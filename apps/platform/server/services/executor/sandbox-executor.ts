import type { RunResult } from '@dependfix/core'
import type { ScanExecutor, ScanExecutorContext, ScanExecutorResult } from './types'
import { DockerAdapter, SANDBOX_DEFAULTS, type ContainerRunResult, type ContainerSpec, type RuntimeAdapter } from './runtime-adapter'
import { sanitizeString } from '#server/utils/sanitize'

/**
 * 沙箱镜像默认值：优先显式 SANDBOX_IMAGE，其次平台容器镜像引用（compose 注入 DEPENDFIX_IMAGE）。
 *
 * 不复用 CI 发布镜像作为默认（版本漂移），也不假设本地 tag 存在——标准部署由 compose 注入
 * `DEPENDFIX_IMAGE`，独立 `docker run` 需显式设置 `SANDBOX_IMAGE`。
 */
const DEFAULT_SANDBOX_IMAGE = process.env.SANDBOX_IMAGE?.trim()
    || process.env.DEPENDFIX_IMAGE?.trim()
    || 'dependfix-platform:latest'

/** 自包含 CLI 入口（镜像内由 Dockerfile 复制；本地联调可经 env 指向工作区产物） */
const DEFAULT_SANDBOX_ENTRY = process.env.DEPENDFIX_SANDBOX_ENTRY ?? '/app/sandbox/bin.mjs'

/** 随 bundle 复制的产品 skill 根目录（其下为 dependfix-remediator） */
const DEFAULT_SANDBOX_SKILLS_DIR = process.env.DEPENDFIX_SANDBOX_SKILLS_DIR ?? '/app/sandbox/skills'

/** 容器内结果文件路径（容器私有文件系统；不依赖宿主与平台容器的路径映射） */
const CONTAINER_RESULT_PATH = '/tmp/result.json'

/** 结果回传哨兵：CLI 日志走 stdout，只有哨兵之间的内容是显式结果契约 */
const RESULT_SENTINEL_START = '__DEPENDFIX_RESULT_JSON_START__'
const RESULT_SENTINEL_END = '__DEPENDFIX_RESULT_JSON_END__'

/** 仅放行的执行模式：fix / fix-and-pr 需先接入出站白名单代理 */
const SANDBOX_ALLOWED_MODE = 'report-only'

/** 仅放行的告警源：report-only 的隔离论证依赖「不执行目标仓库代码」 */
const SANDBOX_ALLOWED_ALERT_SOURCE = 'github-dependabot'

/** runId 字符白名单(防御性——拒绝任何路径分隔符或父目录引用,即使来源是数据库生成 ID) */
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** 沙箱执行选项 */
export interface SandboxExecutorOptions {
    /** 注入 RuntimeAdapter(默认 DockerAdapter——便于单测 spy 替换) */
    runtimeAdapter?: RuntimeAdapter
    /** 沙箱镜像名 */
    image?: string
    /** 自包含 CLI 入口（容器内路径） */
    entry?: string
    /** 产品 skill 根目录（容器内路径） */
    skillsDir?: string
    /** 沙箱级资源限额(缺省走平台 SANDBOX_DEFAULTS;仓库级覆盖由 Repository 实体 sandboxLimits 字段承载) */
    sandboxLimits?: { memoryMb?: number, cpu?: number }
    /** 单次执行超时(默认 30 分钟——与 ContainerExecutor 对齐) */
    timeoutMs?: number
}

/**
 * 沙箱执行器(隔离执行用户脚本——独立 Docker 容器)。
 *
 * 设计要点(见 docs/design/governance/executor-sandbox.md §3):
 * - **存在意义**:把可能执行恶意脚本的副作用隔离在独立容器内(与平台容器即沙箱的 A 模式对照)
 * - **不强绑定 rootless**:通过 RuntimeAdapter 抽象,daemon 不可用即降级回 ContainerExecutor(并存,向后兼容)
 * - **零信任默认**:user `100:100`(rootless 标配)+ cgroup 限额 + 不挂宿主 docker.sock
 * - **接口契约**:与 ContainerExecutor 同构——`kind: 'sandbox'` / `isAvailable()` / `execute(ctx)`
 *
 * 结果回传：不 bind-mount 宿主目录（平台容器与宿主 daemon 的路径视角不一致），
 * 由容器内自包含 CLI 写 `/tmp/result.json`，shell 用哨兵把内容打到 stdout；执行器只解析哨兵区间。
 *
 * 错误分类契约(caller 按 error.code 决定降级路径):
 * - `sandbox_unavailable`:RuntimeAdapter ENOENT/ENOTCONN/EACCES/ECONNREFUSED(daemon 不可用)
 * - `execution_timeout`:外层 withTimeout 触发 或 RuntimeAdapter 返回 exitCode 124
 * - `sandbox_image_unavailable`:docker exit 125 且 stderr 指向镜像缺失 / 无法拉取
 * - `sandbox_fix_requires_egress_policy`:非 report-only 被第二道闸拒绝
 * - `sandbox_alert_source_unsupported`:pnpm-audit 等会执行仓库代码的告警源被拒绝
 * - `execution_failed`:其他(结果缺失 / 解析失败 / 容器内执行失败)
 */
export class SandboxExecutor implements ScanExecutor {
    readonly kind = 'sandbox' as const

    private readonly adapter: RuntimeAdapter
    private readonly image: string
    private readonly entry: string
    private readonly skillsDir: string
    private readonly sandboxLimits: { memoryMb?: number, cpu?: number }
    private readonly timeoutMs: number

    constructor(options: SandboxExecutorOptions = {}) {
        this.adapter = options.runtimeAdapter ?? new DockerAdapter()
        this.image = options.image ?? DEFAULT_SANDBOX_IMAGE
        this.entry = options.entry ?? DEFAULT_SANDBOX_ENTRY
        this.skillsDir = options.skillsDir ?? DEFAULT_SANDBOX_SKILLS_DIR
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

        // 防御性校验：runId 仅用于日志关联，仍拒绝异常形态（避免未来落盘时越界）
        if (!RUN_ID_PATTERN.test(ctx.runId)) {
            return {
                exitCode: 2,
                error: { code: 'execution_failed', message: `非法的 runId: ${sanitizeErrorMessage(ctx.runId)}` },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        // fail-closed：沙箱仅放行 report-only + GitHub 告警源。fix / fix-and-pr 需要出站白名单代理
        // 接入执行路径，否则 clone / install 的网络面不受控；编排层会先行降级并记
        // `sandbox_fix_requires_egress_policy`，此处为绕过编排层时的第二道闸。
        if (ctx.config.mode !== SANDBOX_ALLOWED_MODE) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_fix_requires_egress_policy',
                    message: `沙箱执行器仅放行 ${SANDBOX_ALLOWED_MODE}；${ctx.config.mode} 需先接入出站白名单代理，已拒绝在沙箱内执行`,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }
        // pnpm-audit 会在工作目录执行目标仓库安装链，破坏「report-only 不执行仓库代码」的隔离前提
        if (ctx.config.alertSource !== SANDBOX_ALLOWED_ALERT_SOURCE) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_alert_source_unsupported',
                    message: `沙箱 report-only 仅支持 ${SANDBOX_ALLOWED_ALERT_SOURCE}（${ctx.config.alertSource} 会执行目标仓库代码）`,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        try {
            const spec = this.buildSpec(ctx)
            const cmd = this.buildCmd(ctx)
            const runResult = await withTimeout(this.adapter.run(spec, cmd), this.timeoutMs)
            return this.parseRunResult(runResult, startedAt)
        } catch (error) {
            return classifyError(error, this.timeoutMs, startedAt)
        }
    }

    /**
     * 拼装 ContainerSpec:env 注入 token + cgroup 限额透传，不挂载宿主目录。
     * 限额优先级:仓库级 sandboxLimits(Repository 实体字段) > 沙箱级 sandboxLimits > SANDBOX_DEFAULTS。
     *
     * 网络：report-only 仍必须访问 GitHub API（Dependabot / Code Scanning alerts），故走 bridge。
     * 该模式不在容器内执行目标仓库代码（无 clone / install / 验证），网络面仅 API 调用；
     * fix / fix-and-pr 在出站白名单代理接入前被 `execute()` 拒绝，不会用到更大网络面。
     */
    buildSpec(ctx: ScanExecutorContext): ContainerSpec {
        return {
            image: this.image,
            // 容器私有可写目录（镜像内存在）；结果文件与报告都落在这里，不跨宿主路径
            workDir: '/tmp',
            env: {
                GITHUB_TOKEN: ctx.credential?.token ?? '',
                GITHUB_REPOSITORY: `${ctx.repository.owner}/${ctx.repository.name}`,
                // 自包含产物不依赖 node_modules：skills 静态目录随 bundle 复制
                DEPENDFIX_SKILLS_DIR: this.skillsDir,
                // AI 研判 env 注入：report-only 不使用 AI，且只放行 report-only → 当前不注入；
                // 保留条件供 fix 模式放行后复用（按仓库最小注入，不在 report-only 泄露组织级 Key）。
                ...(ctx.config.mode !== 'report-only' && ctx.config.ai?.enabled && {
                    DEPENDFIX_AI: 'true',
                    DEPENDFIX_AI_PROVIDER: ctx.config.ai.provider,
                    DEPENDFIX_AI_MODEL: ctx.config.ai.model,
                    DEPENDFIX_AI_BASE_URL: ctx.config.ai.baseUrl ?? '',
                    DEPENDFIX_AI_TRIGGER: ctx.config.ai.trigger,
                    ...(ctx.config.ai.apiKey && { DEPENDFIX_AI_API_KEY: ctx.config.ai.apiKey }),
                    ...(ctx.config.ai.apiUrl && { DEPENDFIX_AI_API_URL: ctx.config.ai.apiUrl }),
                }),
            },
            memoryMb: this.sandboxLimits.memoryMb,
            cpu: this.sandboxLimits.cpu,
            network: 'bridge',
            timeoutMs: this.timeoutMs,
            autoRemove: SANDBOX_DEFAULTS.autoRemove,
        }
    }

    /**
     * 拼装容器内执行命令：自包含 CLI 在 `/tmp` 跑 report-only，把显式结果写入
     * `/tmp/result.json`，随后用哨兵把结果打到 stdout（日志与结果同流，靠哨兵切分）。
     *
     * 凭据只走 env（`GITHUB_TOKEN`），不进 argv——避免 docker inspect / 错误回显泄露。
     * 报告副产物 `dependfix-reports/**` 不作为结果来源（写报告失败不阻断运行）。
     */
    buildCmd(ctx: ScanExecutorContext): string[] {
        const repo = `${ctx.repository.owner}/${ctx.repository.name}`
        const args = [
            'node',
            this.entry,
            ctx.config.mode,
            '--repo', repo,
            '--severity-threshold', ctx.config.severityThreshold,
            '--alerts-source', ctx.config.alertSource,
            '--max-alerts-per-repository', String(ctx.config.maxAlertsPerRepository),
            '--max-concurrency', String(ctx.config.maxConcurrency),
            '--result-json', CONTAINER_RESULT_PATH,
        ]
        if (ctx.config.codeScanningEnabled) {
            args.push('--code-scanning')
        }
        if (ctx.config.codeQualityEnabled) {
            args.push('--code-quality')
        }
        const script = [
            args.map(shQuote).join(' '),
            'code=$?',
            `printf '\\n${RESULT_SENTINEL_START}\\n'`,
            `cat ${shQuote(CONTAINER_RESULT_PATH)} 2>/dev/null`,
            `printf '\\n${RESULT_SENTINEL_END}\\n'`,
            'exit $code',
        ].join('; ')
        return ['sh', '-c', script]
    }

    /**
     * 解析 stdout 哨兵区间内的显式结果(fail-closed:任何结构/语义异常归 execution_failed)。
     *
     * 校验项:
     * 1. 哨兵区间存在且是合法 JSON（缺失 / 非 JSON → execution_failed，附日志尾部便于归因）
     * 2. payload.exitCode 为有限整数
     * 3. transport(runResult.exitCode)与 payload.exitCode 不矛盾(transport 非 0 则 payload 也必须非 0)
     * 4. payload.exitCode === 0 时 result 必须存在且符合 RunResult 必填字段契约
     * 5. 错误消息中的 stdout / stderr 一律经 sanitizeErrorMessage 防凭据泄露
     */
    private parseRunResult(runResult: ContainerRunResult, startedAt: string): ScanExecutorResult {
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

        // 镜像缺失 / 无法拉取：docker run 返回 125，错误文本指向镜像而非代码
        if (transportExitCode === 125 && /unable to find image|manifest unknown|pull access denied/i.test(runResult.stderr)) {
            return {
                exitCode: 2,
                error: {
                    code: 'sandbox_image_unavailable',
                    message: `沙箱镜像不可用（确认镜像已在目标 daemon 内可拉取 / 已存在）：${sanitizeErrorMessage(runResult.stderr.slice(0, 200))}`,
                },
                startedAt,
                finishedAt,
            }
        }

        const start = runResult.stdout.lastIndexOf(RESULT_SENTINEL_START)
        const end = start >= 0
            ? runResult.stdout.indexOf(RESULT_SENTINEL_END, start + RESULT_SENTINEL_START.length)
            : -1
        if (start < 0 || end < 0) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱未回传显式结果（stdout 头 200 字符:${sanitizeErrorMessage(runResult.stdout.slice(0, 200))}；stderr 头 200 字符:${sanitizeErrorMessage(runResult.stderr.slice(0, 200))}）`,
                },
                startedAt,
                finishedAt,
            }
        }

        const raw = runResult.stdout.slice(start + RESULT_SENTINEL_START.length, end).trim()
        // 结果区间之外仍是 CLI 日志：剔除结果 JSON 后作为执行日志回传
        const stdoutLogs = `${runResult.stdout.slice(0, start)}${runResult.stdout.slice(end + RESULT_SENTINEL_END.length)}`
        const logsJson = buildLogsJson(stdoutLogs, runResult.stderr)

        let parsed: { exitCode?: number, result?: RunResult } | null = null
        try {
            parsed = JSON.parse(raw) as { exitCode?: number, result?: RunResult }
        } catch {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱结果非 JSON:${sanitizeErrorMessage(raw.slice(0, 200))}`,
                },
                startedAt,
                finishedAt,
                logsJson,
            }
        }

        if (typeof parsed?.exitCode !== 'number' || !Number.isFinite(parsed.exitCode)) {
            return {
                exitCode: 2,
                error: {
                    code: 'execution_failed',
                    message: `沙箱结果结构无效:缺少 exitCode(结果头 200 字符:${sanitizeErrorMessage(raw.slice(0, 200))})`,
                },
                startedAt,
                finishedAt,
                logsJson,
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
                logsJson,
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
                        message: `沙箱结果 result 校验失败:${validation.reason}`,
                    },
                    startedAt,
                    finishedAt,
                    logsJson,
                }
            }
        }

        return {
            exitCode: parsed.exitCode,
            result: parsed.result,
            startedAt,
            finishedAt,
            logsJson,
        }
    }
}

/** POSIX shell 单引号转义（命令参数全部经此包装，避免注入） */
function shQuote(value: string): string {
    return `'${value.replace(/'/g, '\'\\\'\'')}'`
}

/** 把 stdout / stderr 尾部转为执行日志 JSON（与 MemoryLogger 同形：timestamp / level / message） */
function buildLogsJson(stdout: string, stderr: string, maxLines = 100): string {
    const now = new Date().toISOString()
    const toLines = (text: string) => text.split('\n')
        .map((line) => sanitizeString(line.trim()))
        .filter(Boolean)
        .slice(-maxLines)
    const entries = [
        ...toLines(stdout).map((message) => ({ timestamp: now, level: 'info', message })),
        ...toLines(stderr).map((message) => ({ timestamp: now, level: 'error', message })),
    ]
    return JSON.stringify(entries)
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

    // 其他(容器启动失败 / 业务执行失败等):execution_failed
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
 * 错误消息脱敏：抹除 URL 中可能内联的凭据（纵深防御，防 execFile argv 回显）。
 *
 * 已迁移至 #server/utils/sanitize.ts，此处保留导出以兼容既有调用。
 */
export function sanitizeErrorMessage(message: string): string {
    return sanitizeString(message)
}
