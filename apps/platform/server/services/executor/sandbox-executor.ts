import { mkdir, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { RunResult } from '@dependfix/core'
import type { ScanExecutor, ScanExecutorContext, ScanExecutorResult } from './types'
import { DockerAdapter, SANDBOX_DEFAULTS, type ContainerRunResult, type ContainerSpec, type RuntimeAdapter } from './runtime-adapter'

/** SandboxExecutor 默认 workRoot(沿用 ContainerExecutor 约定) */
const defaultWorkRoot = process.env.DATABASE_PATH ? join(process.env.DATABASE_PATH, '..', 'runs') : 'data/runs'

/** 沙箱镜像默认值(占位——实际部署由 ops 配置镜像名,复用 apps/platform/Dockerfile runtime 阶段) */
const DEFAULT_SANDBOX_IMAGE = process.env.SANDBOX_IMAGE ?? 'dependfix-platform:latest'

/** runId 字符白名单(防御性——拒绝任何路径分隔符或父目录引用,即使来源是数据库生成 ID) */
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** 沙箱执行选项 */
export interface SandboxExecutorOptions {
    /** 注入 RuntimeAdapter(默认 DockerAdapter——便于单测 spy 替换) */
    runtimeAdapter?: RuntimeAdapter
    /** 沙箱镜像名 */
    image?: string
    /** workRoot 根目录(每次执行在 workRoot/{runId}/ 下建临时目录) */
    workRoot?: string
    /** 沙箱级资源限额(缺省走平台 SANDBOX_DEFAULTS;仓库级覆盖由 Repository 实体 sandboxLimits 字段承载) */
    sandboxLimits?: { memoryMb?: number, cpu?: number }
    /** 单次执行超时(默认 30 分钟——与 ContainerExecutor 对齐) */
    timeoutMs?: number
}

/**
 * 沙箱执行器(隔离执行用户脚本——独立 Docker 容器)。
 *
 * 设计要点(见 docs/design/governance/executor-sandbox.md §3 与 todo.md §M10 决策会议结论):
 * - **存在意义**:把 git clone / pnpm install / pnpm audit 等可能执行恶意脚本的副作用隔离在
 *   独立容器内(与平台容器即沙箱的 A 模式对照——M10 G5 治理登记
 *   见 todo.md §沙箱与恶意依赖防护治理登记)
 * - **不强绑定 rootless**:通过 RuntimeAdapter 抽象,daemon 不可用即降级回 ContainerExecutor
 *   (todo.md §M10 决策会议结论 Q6:并存,向后兼容)
 * - **零信任默认**:网络 `none`(白名单由后续应用层代理承载)+ user `100:100`(rootless 标配)
 * - **接口契约**:与 ContainerExecutor 同构——`kind: 'sandbox'` / `isAvailable()` / `execute(ctx)`,
 *   scan-orchestrator 路由按 `executorKind` 字段(见 todo.md §M10 决策会议结论 Q6)
 *
 * 错误分类契约(caller 按 error.code 决定降级路径):
 * - `sandbox_unavailable`:RuntimeAdapter ENOENT/ENOTCONN/EACCES/ECONNREFUSED(daemon 不可用)
 * - `execution_timeout`:外层 withTimeout 触发 或 RuntimeAdapter 返回 exitCode 124
 * - `execution_failed`:其他(工作目录创建失败 / 解析失败 / 容器内执行失败)
 */
export class SandboxExecutor implements ScanExecutor {
    readonly kind = 'sandbox' as const

    private readonly adapter: RuntimeAdapter
    private readonly image: string
    private readonly workRoot: string
    private readonly sandboxLimits: { memoryMb?: number, cpu?: number }
    private readonly timeoutMs: number

    constructor(options: SandboxExecutorOptions = {}) {
        this.adapter = options.runtimeAdapter ?? new DockerAdapter()
        this.image = options.image ?? DEFAULT_SANDBOX_IMAGE
        this.workRoot = options.workRoot ?? defaultWorkRoot
        this.sandboxLimits = options.sandboxLimits ?? {}
        this.timeoutMs = options.timeoutMs ?? SANDBOX_DEFAULTS.timeoutMs
    }

    /**
     * 探测 RuntimeAdapter 可用性(即 docker daemon 是否运行)。
     * 探测失败时调用方(scan-orchestrator)应降级回 ContainerExecutor 并 stderr 提示。
     */
    async isAvailable(): Promise<boolean> {
        return this.adapter.isAvailable()
    }

    async execute(ctx: ScanExecutorContext): Promise<ScanExecutorResult> {
        const startedAt = new Date().toISOString()
        const workDir = join(this.workRoot, ctx.runId)

        // 防御性路径校验:防止 runId 包含 `..` 或路径分隔符导致 rm() 越界
        if (!RUN_ID_PATTERN.test(ctx.runId) || relative(this.workRoot, workDir).startsWith('..')) {
            return {
                exitCode: 2,
                error: { code: 'execution_failed', message: `非法的 runId: ${sanitizeErrorMessage(ctx.runId)}` },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        try {
            // 工作目录创建纳入结构化错误边界(EACCES/ENOSPC/ENOTDIR → execution_failed,
            // 不归为 daemon 不可用——避免误报降级)
            await mkdir(workDir, { recursive: true })

            const spec = this.buildSpec(workDir, ctx)
            const cmd = this.buildCmd(ctx)

            const runResult = await withTimeout(this.adapter.run(spec, cmd), this.timeoutMs)
            return this.parseRunResult(runResult, ctx, startedAt)
        } catch (error) {
            return classifyError(error, this.timeoutMs, startedAt)
        } finally {
            // 临时工作目录清理(执行后不留存);清理失败不影响执行结果(已结构化返回)
            await rm(workDir, { recursive: true, force: true }).catch(() => { /* 清理失败静默 */ })
        }
    }

    /**
     * 拼装 ContainerSpec:bind-mount workDir + env 注入 token + cgroup 限额透传。
     * 限额优先级:仓库级 sandboxLimits(Repository 实体字段) > 沙箱级 sandboxLimits > SANDBOX_DEFAULTS。
     */
    buildSpec(workDir: string, ctx: ScanExecutorContext): ContainerSpec {
        return {
            image: this.image,
            workDir: '/work',
            mounts: [{ src: workDir, dst: '/work', readonly: false }],
            env: {
                GITHUB_TOKEN: ctx.credential?.token ?? '',
                GITHUB_REPOSITORY: `${ctx.repository.owner}/${ctx.repository.name}`,
                DEPENDFIX_MODE: ctx.config.mode,
                DEPENDFIX_SEVERITY: String(ctx.config.severityThreshold),
            },
            memoryMb: this.sandboxLimits.memoryMb,
            cpu: this.sandboxLimits.cpu,
            // 沙箱网络策略:report-only 无网络需求(none);fix/fix-and-pr 需 git clone(bridge,白名单由后续应用层代理接管)
            network: ctx.config.mode === 'report-only' ? SANDBOX_DEFAULTS.network : 'bridge',
            timeoutMs: this.timeoutMs,
            autoRemove: SANDBOX_DEFAULTS.autoRemove,
        }
    }

    /**
     * 拼装容器内执行命令(当前阶段最小命令;后续集成阶段实现 git clone + pnpm install + dependfix-cli 完整序列)。
     *
     * 当前最小命令:
     * - 验证容器启动 + bind-mount 双向读写 + 用户态 + cgroup 限额透传
     * - 输出与 RunResult 同构的 JSON,便于 caller 直接解析为 ScanExecutorResult.result
     */
    buildCmd(ctx: ScanExecutorContext): string[] {
        const repo = `${ctx.repository.owner}/${ctx.repository.name}`
        // 最小合法 RunResult:所有必填字段填充 + `satisfies RunResult` 让 typecheck 捕获契约漂移
        const minimalRunResult = {
            runId: ctx.runId,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            config: {
                mode: ctx.config.mode,
                severityThreshold: String(ctx.config.severityThreshold),
                repositories: [repo],
                dryRun: ctx.config.dryRun,
                createPullRequest: ctx.config.createPullRequest,
                maxAlertsPerRepository: ctx.config.maxAlertsPerRepository,
                alertSource: ctx.config.alertSource as 'github-dependabot' | 'pnpm-audit',
            },
            summary: {
                repositoriesScanned: 1,
                alertsFound: 0,
                alertsFixable: 0,
                alertsFixed: 0,
                alertsFailed: 0,
                alertsSkipped: 0,
                alertsConverged: 0,
                alertsTruncated: 0,
                lockfileRepairs: 0,
                verificationsPassed: 0,
                verificationsFailed: 0,
            },
            repositories: [{
                repository: repo,
                defaultBranch: ctx.repository.defaultBranch,
                alertsCount: 0,
                fixable: 0,
                fixed: 0,
                failed: 0,
                lockfileRepaired: false,
                durationMs: 0,
            }],
            alerts: [],
            actions: [],
            errors: [],
        } satisfies RunResult
        const payload = JSON.stringify({ exitCode: 0, result: minimalRunResult })
        // shell 转义:JSON 内含双引号——用单引号包裹 shell string 避免冲突
        return ['sh', '-c', `echo '${payload.replace(/'/g, '\'\\\'\'')}'`]
    }

    /**
     * 解析容器 stdout 为 ScanExecutorResult(fail-closed:任何结构/语义异常归 execution_failed)。
     *
     * 校验项:
     * 1. stdout 是合法 JSON
     * 2. payload.exitCode 为有限整数
     * 3. transport(runResult.exitCode)与 payload.exitCode 不矛盾(transport 非 0 则 payload 也必须非 0)
     * 4. payload.exitCode === 0 时 result 必须存在且符合 RunResult 必填字段契约
     * 5. 错误消息中的 stdout 一律经 sanitizeErrorMessage 防凭据泄露
     */
    private parseRunResult(runResult: ContainerRunResult, ctx: ScanExecutorContext, startedAt: string): ScanExecutorResult {
        const finishedAt = new Date().toISOString()
        const transportExitCode = runResult.exitCode

        // transport 超时分支:RuntimeAdapter 返回 exitCode 124(与 timeout(1) 命令一致语义)
        if (transportExitCode === 124) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_timeout',
                    message: `执行超时(${this.timeoutMs}ms 上限)`,
                },
                startedAt,
                finishedAt,
            }
        }

        let parsed: { exitCode?: number, result?: RunResult } | null = null
        try {
            parsed = JSON.parse(runResult.stdout)
        } catch {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱输出非 JSON:${sanitizeErrorMessage(runResult.stdout.slice(0, 200))}`,
                },
                startedAt,
                finishedAt,
            }
        }

        if (typeof parsed?.exitCode !== 'number' || !Number.isFinite(parsed.exitCode)) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱输出结构无效:缺少 exitCode(stdout 头 200 字符:${sanitizeErrorMessage(runResult.stdout.slice(0, 200))})`,
                },
                startedAt,
                finishedAt,
            }
        }

        // transport 失败但 payload 声称成功 → 视为执行失败(防止伪造)
        if (transportExitCode !== 0 && parsed.exitCode === 0) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `transport exitCode ${transportExitCode} 与 payload exitCode 0 矛盾(stderr 头 200 字符:${sanitizeErrorMessage(runResult.stderr.slice(0, 200))})`,
                },
                startedAt,
                finishedAt,
            }
        }

        // payload 成功时必须携带合法 RunResult
        if (parsed.exitCode === 0) {
            const validation = validateRunResult(parsed.result)
            if (!validation.valid) {
                return {
                    exitCode: 2,
                    error: {
                        code: 'execution_failed',
                        message: `沙箱输出 result 校验失败:${validation.reason}`,
                    },
                    startedAt,
                    finishedAt,
                }
            }
        }

        return {
            exitCode: parsed.exitCode,
            result: parsed.result,
            startedAt,
            finishedAt,
        }
    }
}

/** 错误分类:统一从 catch 分支调用,避免错误分类逻辑散落 */
function classifyError(error: unknown, timeoutMs: number, startedAt: string): ScanExecutorResult {
    const finishedAt = new Date().toISOString()

    // 外层 withTimeout 触发的超时:ExecutionTimeoutError → execution_timeout
    if (error instanceof ExecutionTimeoutError) {
        return {
            exitCode: 2,
            error: {
                code: 'execution_timeout',
                message: `执行超时(${timeoutMs}ms 上限)`,
            },
            startedAt,
            finishedAt,
        }
    }

    // daemon 不可用:ENOENT(docker CLI 缺失)/ ENOTCONN(daemon 卡死)/ EACCES(无权限)/ ECONNREFUSED
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT' || code === 'ENOTCONN' || code === 'EACCES' || code === 'ECONNREFUSED') {
        const raw = error instanceof Error ? error.message : String(error)
        return {
            exitCode: 2,
            error: {
                code: 'sandbox_unavailable',
                message: `沙箱执行器不可用:${sanitizeErrorMessage(raw)}`,
            },
            startedAt,
            finishedAt,
        }
    }

    // 其他(工作目录创建失败 / 容器启动失败 / 业务执行失败等):execution_failed
    const raw = error instanceof Error ? error.message : String(error)
    return {
        exitCode: 2,
        error: {
            code: 'execution_failed',
            message: sanitizeErrorMessage(raw),
        },
        startedAt,
        finishedAt,
    }
}

/**
 * 校验 RunResult 必填字段契约(运行时校验,弥补 `JSON.parse(...) as RunResult` 类型断言的盲点)。
 * 当前校验粒度:顶层必填字段类型 + summary 必填子字段数字类型 + repositories 非空数组。
 */
function validateRunResult(result: unknown): { valid: true } | { valid: false, reason: string } {
    if (!result || typeof result !== 'object') {
        return { valid: false, reason: 'result 不是对象' }
    }
    const r = result as Record<string, unknown>
    if (typeof r.runId !== 'string') {
        return { valid: false, reason: 'runId 缺失或非字符串' }
    }
    if (typeof r.startedAt !== 'string' || typeof r.finishedAt !== 'string') {
        return { valid: false, reason: 'startedAt/finishedAt 缺失或非字符串' }
    }
    if (!r.config || typeof r.config !== 'object') {
        return { valid: false, reason: 'config 缺失' }
    }
    if (!r.summary || typeof r.summary !== 'object') {
        return { valid: false, reason: 'summary 缺失' }
    }
    const summary = r.summary as Record<string, unknown>
    for (const key of ['repositoriesScanned', 'alertsFound', 'alertsFixable', 'alertsFixed', 'alertsFailed']) {
        if (typeof summary[key] !== 'number') {
            return { valid: false, reason: `summary.${key} 缺失或非数字` }
        }
    }
    if (!Array.isArray(r.repositories)) {
        return { valid: false, reason: 'repositories 不是数组' }
    }
    if (!Array.isArray(r.alerts) || !Array.isArray(r.actions) || !Array.isArray(r.errors)) {
        return { valid: false, reason: 'alerts/actions/errors 不是数组' }
    }
    return { valid: true }
}

/** 带超时的 Promise 包装(私有——与 container-executor.ts 同语义但独立,避免交叉依赖) */
class ExecutionTimeoutError extends Error {
    constructor(ms: number) {
        super(`operation timeout after ${ms}ms`)
        this.name = 'ExecutionTimeoutError'
    }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ExecutionTimeoutError(ms)), ms)
    })
    try {
        return await Promise.race([promise, timeoutPromise])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * 错误消息脱敏：抹除 URL 中可能内联的凭据（纵深防御，与 container-executor.ts 对齐）。
 *
 * 覆盖模式：URL 内嵌凭据 / Authorization 头（basic / token / Bearer 三种 scheme）。
 * GitHub REST API v3+ 推荐 `Bearer`，但 legacy `token` 仍兼容——`Authorization: token ghp_xxx`
 * 与 `Authorization: Bearer ghp_xxx` 均需脱敏（C53-后-B + security.md §5.5）。
 *
 * 与 container-executor.ts:340 同步实现；如有调整需同步两处。
 */
export function sanitizeErrorMessage(message: string): string {
    return message
        .replace(/https?:\/\/[^/@\s]+@/g, 'https://***@')
        .replace(/(Authorization:\s+(?:basic|token|bearer)\s+)\S+/gi, '$1***')
}
