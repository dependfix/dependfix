import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseDurationMs, type RunResult } from '@dependfix/core'
import {
    DependfixApp,
    type DependfixRunResult,
    type RuntimeConfig,
    computeFixFingerprint,
    createFixBranch,
    GIT_PUSH_HOOKS_ISOLATION_ARGS,
    GIT_PUSH_SIGNING_ISOLATION_ARGS,
    getAbortReason,
    getAbortSnapshot,
} from '@dependfix/engine'
import type { AuthProvider } from '@dependfix/engine/auth'
import type { ScanExecutor, ScanExecutorContext, ScanExecutorResult } from './types'
import {
    deliverFixAndPr,
    planFixAndPrDelivery,
    shouldPlatformDeliver,
    PlatformDeliveryError,
    createPlatformOctokit,
} from './platform-delivery'
import { ABORT_GRACE_MS, describeUnsettledRun, ExecutionTimeoutError, settleWithin, withTimeout } from './engine-run'
import { MemoryLogger } from '#server/utils/memory-logger'
import { logger as platformLogger } from '#server/utils/logger'
import { detectSigkill, startResourceMonitor } from '#server/utils/resource-usage'
import { sanitizeString } from '#server/utils/sanitize'

const execFileAsync = promisify(execFile)

/** clone 超时默认值（可通过 CLONE_TIMEOUT_MS 环境变量覆盖） */
const DEFAULT_CLONE_TIMEOUT_MS = 300_000 // 300秒（弱网环境 GitHub CDN 慢，120s 不足）

/** clone 最大重试次数（可通过 CLONE_MAX_RETRIES 环境变量覆盖） */
const DEFAULT_CLONE_MAX_RETRIES = 3

/** clone 重试基础延迟（指数退避：attempt * baseDelay） */
const CLONE_RETRY_BASE_DELAY_MS = 2000

/**
 * 单仓库执行超时默认值（30 分钟）。
 * 作为 `ContainerExecutor.timeoutMs` 的缺省；queue 层 Worker 锁时长与之对齐
 * （`SCAN_WORKER_LOCK_OPTIONS.lockDuration`，见 scan-worker.ts 与 platform.md §10.5）。
 * 可通过 `EXECUTION_TIMEOUT_MS` 覆盖（见 {@link resolveExecutionTimeoutMs}）。
 */
export const DEFAULT_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000

/**
 * 解析环境变量为正整数（NaN / 负数 / 0 → 返回默认值）。
 * 仅用于重试次数等非时长参数；时长请用 {@link resolveExecutionTimeoutMs} /
 * {@link resolveCloneTimeoutMs}（支持 `30m` / `1h` 等单位写法）。
 */
export function parsePositiveInt(raw: string | undefined, defaultValue: number): number {
    if (!raw) {
        return defaultValue
    }
    const value = parseInt(raw, 10)
    return Number.isInteger(value) && value > 0 ? value : defaultValue
}

/** 单仓库执行超时下限（1 分钟）：低于此值视为非法 → 回退默认 */
export const MIN_EXECUTION_TIMEOUT_MS = 60_000

/** 单仓库执行超时上限（24 小时）：超出视为非法 → 回退默认（防锁窗口 / 资源占用过长） */
export const MAX_EXECUTION_TIMEOUT_MS = 24 * 60 * 60 * 1000

/**
 * 解析单仓库执行超时（`EXECUTION_TIMEOUT_MS` env）。
 *
 * 缺省 / 非法（非正整数）/ 越界（< {@link MIN_EXECUTION_TIMEOUT_MS} 或 > {@link MAX_EXECUTION_TIMEOUT_MS}）
 * → fail-closed 回退 {@link DEFAULT_EXECUTION_TIMEOUT_MS}（30 分钟）。container 执行器构造期读取、
 * queue Worker 锁参数在模块加载期读取同一解析器 → 二者联动；env 变更需重启进程。
 */
export function resolveExecutionTimeoutMs(raw: string | undefined = process.env.EXECUTION_TIMEOUT_MS): number {
    const value = parseDurationMs(raw, { defaultUnit: 'ms' }) ?? DEFAULT_EXECUTION_TIMEOUT_MS
    return value >= MIN_EXECUTION_TIMEOUT_MS && value <= MAX_EXECUTION_TIMEOUT_MS
        ? value
        : DEFAULT_EXECUTION_TIMEOUT_MS
}

/**
 * 解析 clone 超时（`CLONE_TIMEOUT_MS` env）。
 *
 * 支持纯数字毫秒（历史口径）与 `5m` / `1h` 等单位写法；非法 / 非正数回退默认值。
 * 上限不单独设：clone 超时按运维显式配置采纳，运行级 abort 仍由执行上限兜底。
 */
export function resolveCloneTimeoutMs(raw: string | undefined = process.env.CLONE_TIMEOUT_MS): number {
    return parseDurationMs(raw, { defaultUnit: 'ms' }) ?? DEFAULT_CLONE_TIMEOUT_MS
}

/**
 * 从 git 工作目录读取当前分支名（用于 push 后填 runUrl）。
 *
 * 选用 `git rev-parse --abbrev-ref HEAD`：
 * - 正常分支返回分支名（trim 后）
 * - 跨平台一致（Git 1.7.10+）
 * - 不依赖 git porcelain 命令（symbolic-ref 已 deprecated）
 *
 * detached HEAD 时输出 "HEAD"——此时无法 push，调用方应作失败处理。
 */
export async function extractBranchName(workDir: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: workDir,
        timeout: 5_000,
    })
    const branch = stdout.trim()
    if (!branch || branch === 'HEAD') {
        throw new Error(`git 工作目录 ${workDir} 处于 detached HEAD，无法识别分支`)
    }
    return branch
}

/**
 * 推送修复分支到远程 origin（与 cloneRepository 同模式：http.extraheader 注入凭据）。
 * 失败原样抛错，由 execute() 统一归类为 push_failed。
 *
 * 设计要点：
 * - 凭据走 http.extraheader（base64 basic auth），不进 argv/URL（防 execFile 错误回显泄露）
 * - 签名隔离：显式传 `-c push.gpgSign=false`（`GIT_PUSH_SIGNING_ISOLATION_ARGS`），避免宿主
 *   `push.gpgSign=true` 让 push 带 `--signed` 而在服务端不支持时失败（口径见 docs/standards/git.md §3.8）
 * - hooks 隔离：`push --no-verify`（`GIT_PUSH_HOOKS_ISOLATION_ARGS`）跳过被修复仓库的 `pre-push`，
 *   避免隔离环境下 hook 非 0 退出把交付链打断为 `push_failed`（同 §3.8）
 * - git push 成功时 stderr 含 "To https://..." 行；任何其他 stderr 视为失败
 * - 与 pushBranch（`packages/engine/src/github/pr-creator.ts` 的 `pushBranch`）的语义差异：
 *   本函数为 async + 走 http.extraheader 凭据注入（平台 A 模式需要把 token 重新注入到
 *   平台工作目录的 git config，而 engine 端 pushBranch 依赖该 workDir 已有 origin 凭据）
 *
 * @param credential - 凭据；接受 token 字符串（向后兼容）或 AuthProvider（M18.2 接入 GitHub App）
 *   - `string` → PAT 路径（username 固定为 `'x-access-token'`）
 *   - `AuthProvider` → 通过 `getGitCredential()` 获取 username + token（PAT / GitHub App 路径统一接口）
 *   - `undefined` → 不注入 Authorization header（依赖 workDir 已有 origin 凭据）
 *
 * @see [C22 PAT 无感升级评估 §4.5 调用点改造](../../../../docs/design/governance/c22-pat-backward-compat.md)
 */
export async function pushFixBranch(
    branchName: string,
    workDir: string,
    credential?: string | AuthProvider,
): Promise<void> {
    let username: string
    let token: string

    if (typeof credential === 'string') {
        // 向后兼容：token 字符串 → PAT 路径（固定 username = 'x-access-token'）
        username = 'x-access-token'
        token = credential
    } else if (credential) {
        // AuthProvider 路径：通过 getGitCredential() 获取 username + token（PAT + GitHub App 统一接口）
        const gitCred = credential.getGitCredential()
        username = gitCred.username
        token = gitCred.token
    } else {
        // 无凭据：不注入 Authorization header
        username = ''
        token = ''
    }

    const args = [
        ...GIT_PUSH_SIGNING_ISOLATION_ARGS,
        ...(token ? ['-c', `http.extraheader=Authorization: basic ${Buffer.from(`${username}:${token}`).toString('base64')}`] : []),
        'push',
        ...GIT_PUSH_HOOKS_ISOLATION_ARGS,
        'origin', branchName,
    ]
    const { stderr } = await execFileAsync('git', args, { cwd: workDir, timeout: 60_000 })
    if (stderr && !/^To /m.test(stderr)) {
        throw new Error(`git push 失败：${stderr.trim()}`)
    }
}

/**
 * 删除远程分支（best-effort，PR 失败时清理副作用）。
 * 失败静默——失败路径已通过 pr_creation_failed 错误码上报，远程分支清理是 bonus hygiene。
 *
 * 调用场景：fix-and-pr 模式下，pr_creation_failed 时主动清理已推的远程分支。
 * 但本仓库设计选择是「PR 失败保留远程分支供用户手动开 PR」，因此当前不主动调用本函数；
 * 保留为工具函数以备未来需要"严格清理"语义时启用。
 */
export async function cleanupRemoteBranch(branchName: string, workDir: string, token?: string): Promise<boolean> {
    const args = [
        ...GIT_PUSH_SIGNING_ISOLATION_ARGS,
        ...(token ? ['-c', `http.extraheader=Authorization: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`] : []),
        'push',
        ...GIT_PUSH_HOOKS_ISOLATION_ARGS,
        'origin', '--delete', branchName,
    ]
    try {
        await execFileAsync('git', args, { cwd: workDir, timeout: 30_000 })
        return true
    } catch {
        // 失败静默：分支不存在 / 权限不足 / 网络错误——不阻塞主流程
        return false
    }
}

/**
 * 移动 workDir 到 _pending 子目录 + 写 metadata 文件（保留 24h 用于失败诊断）。
 *
 * 设计要点：
 * - 调用面：push 成功但 PR 失败（保留 24h）、取消宽限期结束仍未落定（延迟清理）；
 *   其余路径 finally 直接删除工作目录
 * - 保留窗口通过 .meta.json 记录（writtenAt + retentionMs），便于后续 stale-cleanup 任务扫描
 * - 失败静默（move 可能因 fs 错误失败，但不影响 pr_creation_failed 错误回传）
 * - 当前阶段：保留语义落地，后续 stale-cleanup 任务按 metadata 清理
 */
export interface MoveToPendingOptions {
    /** 保留期（毫秒），默认 24h */
    retentionMs?: number
    /** `.meta.json` 的 reason，默认 `pr_creation_failed` */
    reason?: string
    /** 追加写入 `.meta.json` 的诊断字段（如取消未落定的现场快照） */
    extraMeta?: Record<string, unknown>
}

export async function moveToPending(
    workDir: string,
    runId: string,
    pendingRoot: string,
    options: MoveToPendingOptions = {},
): Promise<string> {
    const retentionMs = options.retentionMs ?? 24 * 60 * 60 * 1000
    const reason = options.reason ?? 'pr_creation_failed'
    const runIdPattern = /^[A-Za-z0-9_-]+$/
    if (!runIdPattern.test(runId)) {
        throw new Error(`非法 runId: ${runId}`)
    }
    const targetDir = join(pendingRoot, runId)
    await mkdir(pendingRoot, { recursive: true })
    await rename(workDir, targetDir)
    const now = new Date()
    // 保留字段不可被 extraMeta 覆盖（来源为调用方上下文，避免误改保留期 / 归属）
    const reserved = new Set(['runId', 'writtenAt', 'retentionMs', 'expiresAt', 'reason'])
    const extra = Object.fromEntries(
        Object.entries(options.extraMeta ?? {}).filter(([key]) => !reserved.has(key)),
    )
    const meta = {
        runId,
        writtenAt: now.toISOString(),
        retentionMs,
        expiresAt: new Date(now.getTime() + retentionMs).toISOString(),
        reason,
        ...extra,
    }
    await writeFile(join(targetDir, '.meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
    return targetDir
}


/**
 * 执行结束后的工作目录处置（可单测的选择点）。
 *
 * - 取消未落定：不删除仍可能被引擎写盘的目录，移入 `_pending` 延迟清理并保留诊断；
 * - 其余：直接删除（执行结束不留存；清理失败静默）。
 */
export async function disposeWorkDirAfterRun(params: {
    workDir: string
    runId: string
    pendingRoot: string
    unsettledDiagnosis?: string
    move?: typeof moveToPending
    remove?: (path: string) => Promise<void>
}): Promise<'moved' | 'removed'> {
    const move = params.move ?? moveToPending
    const remove = params.remove ?? ((path: string) => rm(path, { recursive: true, force: true }))
    if (params.unsettledDiagnosis) {
        await move(params.workDir, params.runId, params.pendingRoot, {
            reason: 'execution_timeout_unsettled',
            extraMeta: { diagnosis: params.unsettledDiagnosis },
        })
        return 'moved'
    }
    await remove(params.workDir).catch(() => { /* 清理失败静默 */ })
    return 'removed'
}

/**
 * A 模式执行器（默认）：平台容器内执行。
 *
 * 设计要点（见 executor-sandbox.md §2.2 / §5.1）：
 * - 平台容器即沙箱（进程级隔离）：非 root 运行（镜像 USER）、临时工作目录、凭据最小化、超时
 * - report-only：不 clone、不 commit（GitHub API 拉取告警，快）；fix/fix-and-pr：先 clone 到 workDir（fix 需操作仓库文件）
 *   - ⚠️ clone 判定与下方引擎 config 覆写必须同源（`isReportOnly`）：report-only 若只跳过 clone 却把引擎降级为
 *     `fix + commit:true`，引擎会在空 workDir 上执行 `git config user.name` → `fatal: not in a git directory`
 *     → `COMMIT_FAILED` → 平台 `engine_delivery_failed`（2026-10-11 生产实证）
 * - 凭据来源单一：credential 由 credential service 解密传入，填充 RuntimeConfig.githubToken/alertsToken
 * - 执行结果直接复用 DependfixApp 的 RunResult（扫描结果落库数据源）
 * - A 模式 fix / fix-and-pr 完成后推送修复分支到远程；push 失败归类 `push_failed`
 * - A 模式 fix-and-pr 进一步创建 PR 拉取请求；PR 失败归类 `pr_creation_failed`（分支已推，状态机 dispatched）
 *   - 该路径下 workDir 保留 24h 供诊断（moveToPending）+ runUrl 兜底为 branch URL
 * - runUrl 兜底为 branch URL（PR 失败时仍可显示供用户手动开 PR）
 */
export class ContainerExecutor implements ScanExecutor {
    readonly kind = 'container' as const

    private readonly workRoot: string
    private readonly timeoutMs: number
    private readonly cloneTimeoutMs: number
    private readonly verifyCommandTimeoutMs?: number
    private readonly installTimeoutMs?: number
    private readonly cloneMaxRetries: number
    /** 超时取消后等待引擎落定的宽限期（见 `engine-run.ts` 的 `ABORT_GRACE_MS`）。 */
    private readonly abortGraceMs: number

    constructor(options: {
        workRoot: string
        timeoutMs?: number
        cloneTimeoutMs?: number
        cloneMaxRetries?: number
        abortGraceMs?: number
        /** 仓库级验证命令超时（毫秒；缺省走引擎 env / 内置默认） */
        verifyCommandTimeoutMs?: number
        /** 仓库级安装类命令超时（毫秒；缺省走引擎 env / 内置默认） */
        installTimeoutMs?: number
    } = { workRoot: process.env.DATABASE_PATH ? join(process.env.DATABASE_PATH, '..', 'runs') : 'data/runs' }) {
        this.workRoot = options.workRoot
        this.timeoutMs = options.timeoutMs ?? resolveExecutionTimeoutMs()
        // clone 超时：优先构造参数 > 环境变量 > 默认值
        this.cloneTimeoutMs = options.cloneTimeoutMs
            ?? resolveCloneTimeoutMs(process.env.CLONE_TIMEOUT_MS)
        this.verifyCommandTimeoutMs = options.verifyCommandTimeoutMs
        this.installTimeoutMs = options.installTimeoutMs
        // clone 重试次数：优先构造参数 > 环境变量 > 默认值
        this.cloneMaxRetries = options.cloneMaxRetries
            ?? parsePositiveInt(process.env.CLONE_MAX_RETRIES, DEFAULT_CLONE_MAX_RETRIES)
        this.abortGraceMs = options.abortGraceMs ?? ABORT_GRACE_MS
    }

    async isAvailable(): Promise<boolean> {
        // 容器内工具链（git/pnpm/node）由镜像保证；此处仅确认工作根目录可写
        try {
            await mkdir(this.workRoot, { recursive: true })
            return true
        } catch {
            return false
        }
    }

    async execute(ctx: ScanExecutorContext): Promise<ScanExecutorResult> {
        const startedAt = new Date().toISOString()
        const monitor = startResourceMonitor()
        try {
            const result = await this.executeRun(ctx)
            const resource = monitor.stop()
            resource.sigkillDetected = detectSigkill([
                ...(result.result?.errors ?? []).map((item) => item.message),
                result.error?.message,
            ])
            result.resource = resource
            return result
        } catch (error) {
            // 未预期抛错也要保留执行窗口快照（此前会在 finally 丢弃，运行详情显示「无资源读数」）。
            // 归类沿用执行器契约的 execution_failed（编排层不再走 orchestration_failed），并留 error 日志。
            const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error))
            platformLogger.error('[container-executor] unexpected failure during execute', { error })
            const resource = monitor.stop()
            resource.sigkillDetected = detectSigkill([message])
            return {
                exitCode: 2,
                error: { code: 'execution_failed', message },
                resource,
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        } finally {
            // 异常路径也停止采样；stop 幂等，不覆盖已生成的快照
            monitor.stop()
        }
    }

    private async executeRun(ctx: ScanExecutorContext): Promise<ScanExecutorResult> {
        const startedAt = new Date().toISOString()
        const { owner, name, defaultBranch } = ctx.repository
        const workDir = join(this.workRoot, ctx.runId)
        // 延迟清理 / PR 失败保留的诊断根目录（finally 与失败分支共用）
        const pendingRoot = join(this.workRoot, '_pending')
        // 扫描模式单一事实源：report-only 为只读扫描（仅拉告警 + 出报告，无 clone / commit / push）；
        // fix / fix-and-pr 才需要本地仓库文件与交付链路。
        // ⚠️ needsClone / needsPush / needsPr 与下方引擎 config 覆写（mode / commit）必须同源，
        // 否则会出现「引擎被降级为 fix + commit:true 却没有 clone」→ 在空目录上 commit → COMMIT_FAILED。
        const isReportOnly = ctx.config.mode === 'report-only'
        // 非 report-only：需要本地仓库文件（clone）+ 成功后推送修复分支到远程
        const needsClone = !isReportOnly
        const needsPush = !isReportOnly
        // fix-and-pr 模式：push 成功后再创建 PR
        const needsPr = ctx.config.mode === 'fix-and-pr'

        // 创建 MemoryLogger 捕获执行日志（同时输出到控制台）
        // 作用域提升到 try 外部，确保 catch 块也能访问
        const memLogger = new MemoryLogger({
            name: 'dependfix',
            console: true,
            maxEntries: 1000,
        })

        // 引擎运行 promise 提升到 try 外：超时路径需要据它等待宽限期（避免与引擎落盘互相踩）
        let engineRun: Promise<DependfixRunResult> | undefined
        // 取消未落定：finally 不直接删工作目录，改为移入 _pending 延迟清理并保留诊断
        let unsettledDiagnosis: string | undefined

        try {
            await mkdir(workDir, { recursive: true })

            // 非 report-only（fix / fix-and-pr）需要本地仓库文件：clone 到工作目录
            if (needsClone) {
                await this.cloneRepository(owner, name, defaultBranch, workDir, { token: ctx.credential?.token, logger: memLogger })
            }

            // 记录修复前 HEAD — 用于修复后 hasNewCommit 判定（no-op 扫描不产生空 push）
            const preRunHead = needsPush ? await readHeadSha(workDir).catch(() => null) : null

            // 构造 RuntimeConfig：凭据来自 credential service 解密结果（来源单一，见契约要点 1）
            // 平台交付降级口径：fix / fix-and-pr 被降级为 `mode: 'fix' + commit: true + createPullRequest: false`，
            // 让引擎只做本地修复+commit（不动 push/PR），由 [platform-delivery] 接管带凭据的 push + PR
            // 见 [executor-sandbox-implementation.md §8.5 push + PR 链路修复后流程]
            // report-only：保持原模式与 `commit: false`（只读扫描不产出提交），与上方 needsClone / needsPush 同源
            const config: RuntimeConfig = {
                ...ctx.config,
                mode: isReportOnly ? ctx.config.mode : 'fix',
                repositories: [`${owner}/${name}`],
                githubToken: ctx.credential?.token ?? ctx.config.githubToken,
                alertsToken: ctx.credential?.token ?? ctx.config.alertsToken,
                commit: !isReportOnly,
                createPullRequest: false,
                // 运行截止时间（上层计算、引擎只消费）：预算不足时引擎停止启动新工作
                deadlineAt: Date.now() + this.timeoutMs,
            }

            const app = new DependfixApp({
                config,
                workDir,
                reportOutputDir: join(workDir, 'dependfix-reports'),
                verbose: false,
                // 仓库级自定义验证命令透传（未配置 → undefined，引擎走 DEFAULT_VERIFY_COMMANDS；见 docs/standards/platform.md §3.8）
                commands: ctx.repository.verifyCommands?.length ? ctx.repository.verifyCommands : undefined,
                // 容器内执行属设计内沙箱（非 root + 临时目录），不触发本地模式风险警告
                executionEnvironment: 'container',
                // 仓库级验证命令 / 安装超时：与执行上限同源解析，未配置时走引擎 env / 默认
                ...(this.verifyCommandTimeoutMs !== undefined ? { verifyCommandTimeoutMs: this.verifyCommandTimeoutMs } : {}),
                ...(this.installTimeoutMs !== undefined ? { installTimeoutMs: this.installTimeoutMs } : {}),
                // 注入 MemoryLogger 用于捕获执行日志
                logger: memLogger,
            })

            if (ctx.repository.verifyCommands?.length) {
                memLogger.info(`[verify] ${owner}/${name} 使用仓库级自定义验证命令（${ctx.repository.verifyCommands.length} 条），已覆盖引擎默认验证链`)
            }

            engineRun = app.run()
            const { result, exitCode } = await withTimeout(engineRun, this.timeoutMs, {
                // 超时不再只是"放弃等待"：请求运行级取消（终止在跑子进程树 + 停止启动新工作 +
                // 放弃交付），使引擎不再与后续仓库争抢资源（2026-10-16 内核 OOM 级联的成因）
                onTimeout: (ms) => app.abort(`execution timeout (${ms / 60000} 分钟上限)`),
            })

            // 平台接管交付：仅当引擎 commit 产生新提交时触发（no-op 扫描不产生空 push）
            // 触发条件比原 `exitCode === 0` 更严格：exitCode 1 也算"有部分成功"，但只有真产生 commit 才推
            let runUrl: string | undefined
            let prNumber: number | undefined
            if (needsPush && result && ctx.credential?.token && shouldPlatformDeliver(result)) {
                const hasNewCommit = await checkHasNewCommit(workDir, preRunHead)
                if (!hasNewCommit) {
                    // 引擎未产生新 commit（无告警 / 告警已收敛 / 全部 failed 已被回滚）→ 不推
                    return { exitCode, result, startedAt, finishedAt: new Date().toISOString(), logsJson: memLogger.toJson() }
                }

                try {
                    if (needsPr) {
                        // fix-and-pr：创建 fix 分支 + 走 platform-delivery 完整链路
                        const octokit = createPlatformOctokit(ctx.credential.token)
                        const plan = await planFixAndPrDelivery(octokit, owner, name, result)
                        // 创建/切换到 fix 分支（在 HEAD 上，含 commit）
                        await createFixBranch(plan.branchName, workDir)
                        const delivery = await deliverFixAndPr({
                            owner,
                            repo: name,
                            branchName: plan.branchName,
                            token: ctx.credential.token,
                            workDir,
                            result,
                            plan,
                            octokit,
                        })
                        runUrl = delivery.runUrl
                        prNumber = delivery.prNumber
                    } else {
                        // fix 模式（无 PR）：推当前分支（默认分支）即可
                        const branchName = await extractBranchName(workDir)
                        await pushFixBranch(branchName, workDir, ctx.credential.token)
                        runUrl = `https://github.com/${owner}/${name}/tree/${branchName}`
                    }
                } catch (deliveryError) {
                    // 平台交付失败（带结构化 code）：细分 push_failed / pr_creation_failed
                    if (deliveryError instanceof PlatformDeliveryError) {
                        if (deliveryError.code === 'pr_creation_failed') {
                            // 分支已推 + PR 失败 → 保留 workDir 24h 供诊断 + 状态机 dispatched
                            // （保留失败静默：目录留在原处，不影响 run 结果）
                            await moveToPending(workDir, ctx.runId, pendingRoot).catch(() => { /* 保留失败静默 */ })
                            return {
                                exitCode: 2,
                                error: {
                                    code: 'pr_creation_failed',
                                    message: `创建 PR 失败（分支已推送 ${deliveryError.message}，workDir 已保留 24h 供诊断）`,
                                },
                                startedAt,
                                finishedAt: new Date().toISOString(),
                                // runUrl 兜底：plan 信息保留在 deliveryError 内不现实（已 throw），
                                // 此处使用 ctx.runId 兜底（虽然不是真分支名，但 user 可点进 run 详情查 workDir 状态）；
                                // 实际场景下 platform-delivery PR 失败时仍可重新从 _pending 目录恢复
                                runUrl: `https://github.com/${owner}/${name}/tree/dependfix/auto-fix-${runIdFingerprint(result)}`,
                                // 失败也要带执行日志：否则运行详情 / 导出只剩「（无执行日志）」，无法离线归因
                                logsJson: memLogger.toJson(),
                            }
                        }
                        // push_failed：分支未推
                        return {
                            exitCode: 2,
                            error: {
                                code: 'push_failed',
                                message: `推送修复分支失败：${sanitizeErrorMessage(deliveryError.message)}`,
                            },
                            startedAt,
                            finishedAt: new Date().toISOString(),
                            logsJson: memLogger.toJson(),
                        }
                    }
                    // 未预期的非 PlatformDeliveryError → 走 execution_failed 兜底
                    const raw = deliveryError instanceof Error ? deliveryError.message : String(deliveryError)
                    throw new Error(raw)
                }
            }

            return {
                exitCode,
                result,
                runUrl,
                prNumber,
                startedAt,
                finishedAt: new Date().toISOString(),
                logsJson: memLogger.toJson(),
            }
        } catch (error) {
            // 纵深防御：错误消息脱敏（防未来任何路径把凭据带进错误文本）
            const raw = error instanceof Error ? error.message : String(error)
            const message = sanitizeErrorMessage(raw)
            const isTimeout = error instanceof ExecutionTimeoutError

            // 诊断日志：区分 clone 超时 vs 整体执行超时 vs 其他失败
            let errorSource = 'execution_failed'
            let errorMessage = message
            if (isTimeout) {
                const isCloneTimeout = error.source === 'clone'
                errorSource = isCloneTimeout ? 'clone_timeout' : 'execution_timeout'
                errorMessage = isCloneTimeout
                    ? `git clone 超时（${this.cloneTimeoutMs / 1000} 秒上限，可通过 CLONE_TIMEOUT_MS 调整）`
                    : `执行超时（${this.timeoutMs / 60000} 分钟上限）`
            }
            // 超时路径：取消已请求（终止子进程树），再给引擎一段宽限期落定后才清理工作目录——
            // 否则会在引擎仍写盘时删除目录，且无法区分"已停止"与"仍在跑"
            if (isTimeout && engineRun) {
                const settled = await settleWithin(engineRun, this.abortGraceMs)
                if (settled) {
                    memLogger.warn(`[executor] ${owner}/${name}: 超时后已请求运行级取消；引擎已在宽限期内落定`)
                } else {
                    // 未落定：记录取消时刻在管子进程数 / 最后命令 / 取消原因，工作目录改为延迟清理
                    // 子进程数取「取消当刻」快照：登记表在 kill 时已被清空，之后读数恒为 0
                    const snapshot = getAbortSnapshot()
                    unsettledDiagnosis = describeUnsettledRun({
                        graceMs: this.abortGraceMs,
                        childProcessCount: snapshot?.trackedCount ?? 0,
                        lastCommand: snapshot?.lastCommand,
                        abortReason: getAbortReason(),
                    })
                    memLogger.warn(
                        `[executor] ${owner}/${name}: 超时后已请求运行级取消；${unsettledDiagnosis}`
                        + '（工作目录将移入 _pending 延迟清理）',
                    )
                }
            }

            const executorFailMsg = `[executor] ${owner}/${name} failed: ${errorSource} - ${message}`
            memLogger.error(executorFailMsg)
            platformLogger.error(executorFailMsg)

            let errorCode: string = 'execution_failed'
            if (isTimeout) {
                errorCode = error.source === 'clone' ? 'clone_timeout' : 'execution_timeout'
            }

            return {
                exitCode: 2,
                error: {
                    code: errorCode,
                    message: errorMessage,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
                logsJson: memLogger.toJson(),
            }
        } finally {
            try {
                await disposeWorkDirAfterRun({ workDir, runId: ctx.runId, pendingRoot, unsettledDiagnosis })
            } catch (error) {
                // 迁移失败时目录留在 workRoot/<runId>：显式留痕（无清扫者，需人工或后续批次处置）
                const reason = error instanceof Error ? error.message : String(error)
                memLogger.warn(`[executor] ${owner}/${name}: 工作目录处置失败（保留原处）：${reason}`)
            }
        }
    }

    /**
     * git clone 目标仓库（带重试 + 超时分类修正）。
     *
     * 修复点：
     * 1. 超时分类：execFileAsync 超时抛标准 Error（killed: true），
     *    转为 ExecutionTimeoutError 让 execute() 正确分类为 execution_timeout
     * 2. 可配置超时：CLONE_TIMEOUT_MS 环境变量（默认 120s）
     * 3. 可配置重试：CLONE_MAX_RETRIES 环境变量（默认 2 次）
     * 4. 错误信息：提取 git stderr 中的 fatal:/error: 行，便于诊断
     *
     * 凭据经 http.extraheader 注入，URL 不携带 token——防 execFile 错误回显泄露。
     */
    private async cloneRepository(
        owner: string,
        name: string,
        branch: string,
        workDir: string,
        options: { token?: string, logger?: MemoryLogger } = {},
    ): Promise<void> {
        const { token, logger } = options
        const repoUrl = `https://github.com/${owner}/${name}.git`
        // partial clone（--filter=blob:none）：不下载 blob 对象，按需延迟拉取
        // 显著减少弱网环境下的传输量和超时概率
        const args = ['clone', '--depth', '1', '--filter=blob:none', '--branch', branch, repoUrl, '.']
        if (token) {
            // 凭据走 http.extraheader（base64 basic auth），不进 argv/URL
            const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
            args.unshift('-c', `http.extraheader=Authorization: basic ${basic}`)
        }

        // 诊断日志：clone 配置（不含 token）
        const cloneInfo = `[clone] ${owner}/${name} → branch=${branch}, timeout=${this.cloneTimeoutMs}ms, maxRetries=${this.cloneMaxRetries}`
        logger?.info(cloneInfo)
        platformLogger.info(cloneInfo)

        let lastError: Error | undefined
        for (let attempt = 1; attempt <= this.cloneMaxRetries; attempt++) {
            const attemptStart = Date.now()
            try {
                const { stderr } = await execFileAsync('git', args, {
                    cwd: workDir,
                    timeout: this.cloneTimeoutMs,
                })
                if (stderr && !stderr.trim().startsWith('Cloning into')) {
                    throw new Error(`git clone 失败：${extractGitErrorMessage(stderr)}`)
                }
                // 成功
                if (attempt > 1) {
                    const msg = `[clone] ${owner}/${name} succeeded on attempt ${attempt} (${Date.now() - attemptStart}ms)`
                    logger?.info(msg)
                    platformLogger.info(msg)
                }
                return
            } catch (err) {
                const elapsed = Date.now() - attemptStart
                lastError = err instanceof Error ? err : new Error(String(err))

                // 超时检测：execFileAsync 超时时 error.killed = true（Node.js child_process 行为）
                const isTimeout = (lastError as unknown as { killed?: boolean }).killed
                    || /SIGTERM|ETIMEDOUT/i.test(lastError.message)

                if (isTimeout) {
                    const msg = `[clone] ${owner}/${name} timeout on attempt ${attempt}/${this.cloneMaxRetries} (${elapsed}ms, limit ${this.cloneTimeoutMs}ms)`
                    logger?.warn(msg)
                    platformLogger.warn(msg)
                    // 最后一次尝试超时 → 抛 ExecutionTimeoutError（让 execute() 正确分类）
                    if (attempt === this.cloneMaxRetries) {
                        throw new ExecutionTimeoutError(this.cloneTimeoutMs, 'clone')
                    }
                } else {
                    // 非超时错误（认证失败、仓库不存在等）→ 不重试，直接抛出
                    const gitMsg = extractGitErrorMessage(lastError.message)
                    const msg = `[clone] ${owner}/${name} failed on attempt ${attempt}: ${gitMsg}`
                    logger?.warn(msg)
                    platformLogger.warn(msg)
                    // 认证/权限/不存在类错误重试无意义
                    if (/authentication|401|403|not found|404/i.test(lastError.message)) {
                        throw new Error(`git clone 失败：${gitMsg}`)
                    }
                    // 其他错误（网络中断等）可重试
                    if (attempt === this.cloneMaxRetries) {
                        throw new Error(`git clone 失败（${attempt} 次尝试）：${gitMsg}`)
                    }
                }

                // 指数退避：清理整个 workDir 并重建空目录（git clone . 要求目标为空）
                await rm(workDir, { recursive: true, force: true }).catch((_err) => {
                    // 设计如此：rm 失败（如目录不存在 / 权限受限）无需处理——后续 mkdir 会重建
                })
                await mkdir(workDir, { recursive: true })
                const delay = CLONE_RETRY_BASE_DELAY_MS * attempt
                const retryMsg = `[clone] retrying in ${delay}ms...`
                logger?.info(retryMsg)
                platformLogger.info(retryMsg)
                await new Promise((r) => setTimeout(r, delay))
            }
        }

        // 理论上不会到这里，但防御性抛出
        throw lastError ?? new Error(`git clone 失败：未知错误`)
    }
}

/**
 * 从 git stderr 提取关键错误信息（fatal:/error: 行）。
 * 去除噪音（进度信息、Cloning into 等），保留诊断价值高的内容。
 */
export function extractGitErrorMessage(stderr: string): string {
    const lines = stderr.split('\n')
    const errorLines = lines.filter((l) => /^\s*(fatal:|error:)/i.test(l.trim()))
    if (errorLines.length > 0) {
        return errorLines.map((l) => l.trim()).join('; ')
    }
    // 无明确错误行 → 返回最后 3 行（通常包含上下文）
    return lines.filter((l) => l.trim()).slice(-3).join('; ').trim() || stderr.trim()
}

/**
 * 错误消息脱敏：抹除 URL 中可能内联的凭据（纵深防御，防 execFile argv 回显）。
 *
 * 覆盖模式：
 * - URL 内嵌：`https://x-access-token:TOKEN@github.com/...` → `https://***@...`
 * - Authorization 头：`Authorization: <scheme> <token>`，scheme 支持 `basic` / `token` / `Bearer`
 *
 * 已迁移至 #server/utils/sanitize.ts，此处保留导出以兼容既有调用。
 */
export function sanitizeErrorMessage(message: string): string {
    return sanitizeString(message)
}

/**
 * 读取 workDir 当前 HEAD SHA（用于 hasNewCommit 判定）。
 * detached HEAD / 失败 → 返回 null（让调用方 fallback 处理）。
 */
async function readHeadSha(workDir: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
            cwd: workDir,
            timeout: 5_000,
        })
        return stdout.trim() || null
    } catch {
        return null
    }
}

/**
 * 判定引擎是否产生新 commit：
 * - preRunHead 为 null（readHeadSha 失败）→ 保守视为 true（确保不会漏推真实修复）
 * - post HEAD 与 pre 一致 → false（无新 commit，不推）
 * - post HEAD 与 pre 不同 → true（有新 commit，推）
 *
 * 防御：引擎可能在 verify-failed 后回滚（`git reset --hard HEAD`），此时 post HEAD 仍等于 pre → false，
 * 不会推空分支；这是 expected behavior（回滚意味着无交付）。
 */
async function checkHasNewCommit(workDir: string, preRunHead: string | null): Promise<boolean> {
    const postRunHead = await readHeadSha(workDir)
    if (postRunHead === null) {
        return false
    }
    if (preRunHead === null) {
        // 修复前读不到 HEAD（极少见：clone 失败 / 权限问题）→ 保守视为有 commit
        // 否则可能漏推真实修复。代价：偶发空 push（用户看到 fix 分支但无内容），可接受。
        return true
    }
    return postRunHead !== preRunHead
}

/**
 * 从 RunResult.actions 计算指纹（8 位 hex），用于 pr_creation_failed 时的 runUrl 兜底分支名。
 * 复用 engine.computeFixFingerprint 的语义（与 platform-delivery.planFixAndPrDelivery 内部用同一函数），
 * 保证兜底 URL 与 plan.branchName 一致。
 */
function runIdFingerprint(result: RunResult): string {
    return computeFixFingerprint(result.actions)
}
