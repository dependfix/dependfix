import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { RunResult } from '@dependfix/core'
import {
    DependfixApp,
    type RuntimeConfig,
    buildPrTitle,
    createGitHubClient,
    createPullRequest,
    fetchDefaultBranch,
    generatePRBody,
} from '@dependfix/engine'
import type { ScanExecutor, ScanExecutorContext, ScanExecutorResult } from './types'

const execFileAsync = promisify(execFile)

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
 * - git push 成功时 stderr 含 "To https://..." 行；任何其他 stderr 视为失败
 * - 与 pushBranch（packages/engine/src/github/pr-creator.ts:200）的语义差异：
 *   本函数为 async + 走 http.extraheader 凭据注入（平台 A 模式需要把 token 重新注入到
 *   平台工作目录的 git config，而 engine 端 pushBranch 依赖该 workDir 已有 origin 凭据）
 */
export async function pushFixBranch(branchName: string, workDir: string, token?: string): Promise<void> {
    const args = ['push', 'origin', branchName]
    if (token) {
        const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
        args.unshift('-c', `http.extraheader=Authorization: basic ${basic}`)
    }
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
    const args = ['push', 'origin', '--delete', branchName]
    if (token) {
        const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
        args.unshift('-c', `http.extraheader=Authorization: basic ${basic}`)
    }
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
 * - 仅在 push 成功 + PR 失败时调用（其他路径 finally 立即清理）
 * - 保留窗口通过 .meta.json 记录（writtenAt + retentionMs），便于后续 stale-cleanup 任务扫描
 * - 失败静默（move 可能因 fs 错误失败，但不影响 pr_creation_failed 错误回传）
 * - 当前阶段：保留语义落地，后续 stale-cleanup 任务按 metadata 清理
 */
export async function moveToPending(
    workDir: string,
    runId: string,
    pendingRoot: string,
    retentionMs = 24 * 60 * 60 * 1000,
): Promise<string> {
    const runIdPattern = /^[A-Za-z0-9_-]+$/
    if (!runIdPattern.test(runId)) {
        throw new Error(`非法 runId: ${runId}`)
    }
    const targetDir = join(pendingRoot, runId)
    await mkdir(pendingRoot, { recursive: true })
    await rename(workDir, targetDir)
    const now = new Date()
    const meta = {
        runId,
        writtenAt: now.toISOString(),
        retentionMs,
        expiresAt: new Date(now.getTime() + retentionMs).toISOString(),
        reason: 'pr_creation_failed',
    }
    await writeFile(join(targetDir, '.meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
    return targetDir
}

/**
 * 创建修复 PR（fix-and-pr 模式）：通过 GitHub API 调用引擎层 createPullRequest。
 * 复用引擎的 createGitHubClient + fetchDefaultBranch + buildPrTitle + generatePRBody。
 *
 * 失败原样抛错，由 execute() 归类为 pr_creation_failed（与 B 模式命名一致）。
 *
 * 设计要点：
 * - Octokit 实例由 createGitHubClient 构造（自带限流 hook：GET/HEAD 限流重试，POST 写请求豁免）
 * - 默认分支从 GitHub API 获取；失败回退 'unknown'（与 engine 端 fetchDefaultBranch 行为一致）
 * - PR body 模板引擎端已实现供应链信号披露 / 升级明细 / 截断保护（60KB 上限）
 */
export async function createPrForFix(
    result: RunResult,
    owner: string,
    name: string,
    branchName: string,
    token: string,
): Promise<{ htmlUrl: string, number: number }> {
    const client = createGitHubClient({
        token,
        retry: { maxRetries: 3, maxBackoffMs: 30_000 },
    })
    const baseBranch = await fetchDefaultBranch(client, owner, name)
    const title = buildPrTitle(result.summary, result.actions)
    const body = generatePRBody(result)
    return createPullRequest({
        octokit: client,
        owner,
        repo: name,
        headBranch: branchName,
        baseBranch,
        title,
        body,
    })
}

/**
 * A 模式执行器（默认）：平台容器内执行。
 *
 * 设计要点（见 executor-sandbox.md §2.2 / §5.1）：
 * - 平台容器即沙箱（进程级隔离）：非 root 运行（镜像 USER）、临时工作目录、凭据最小化、超时
 * - report-only：不 clone（GitHub API 拉取告警，快）；fix/fix-and-pr：先 clone 到 workDir（fix 需操作仓库文件）
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

    constructor(options: { workRoot: string, timeoutMs?: number } = { workRoot: process.env.DATABASE_PATH ? join(process.env.DATABASE_PATH, '..', 'runs') : 'data/runs' }) {
        this.workRoot = options.workRoot
        this.timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
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
        const { owner, name, defaultBranch } = ctx.repository
        const workDir = join(this.workRoot, ctx.runId)
        // fix / fix-and-pr 模式：app.run() 成功后需推送修复分支到远程
        const needsPush = ctx.config.mode === 'fix' || ctx.config.mode === 'fix-and-pr'
        // fix-and-pr 模式：push 成功后再创建 PR
        const needsPr = ctx.config.mode === 'fix-and-pr'
        // push 成功 + PR 失败时保留 workDir 24h 供诊断（pendingRoot = workRoot/_pending）
        const pendingRoot = join(this.workRoot, '_pending')

        try {
            await mkdir(workDir, { recursive: true })

            // fix / fix-and-pr 需要本地仓库文件：clone 到工作目录
            const needsClone = ctx.config.mode !== 'report-only'
            if (needsClone) {
                await this.cloneRepository(owner, name, defaultBranch, workDir, ctx.credential?.token)
            }

            // 构造 RuntimeConfig：凭据来自 credential service 解密结果（来源单一，见契约要点 1）
            const config: RuntimeConfig = {
                ...ctx.config,
                repositories: [`${owner}/${name}`],
                githubToken: ctx.credential?.token ?? ctx.config.githubToken,
                alertsToken: ctx.credential?.token ?? ctx.config.alertsToken,
            }

            const app = new DependfixApp({
                config,
                workDir,
                reportOutputDir: join(workDir, 'dependfix-reports'),
                verbose: false,
                // 容器内执行属设计内沙箱（非 root + 临时目录），不触发本地模式风险警告
                executionEnvironment: 'container',
            })

            const { result, exitCode } = await withTimeout(app.run(), this.timeoutMs)

            // 推送修复分支到远程（仅 fix / fix-and-pr 模式且 app.run() 成功）
            // push 失败单独归类 push_failed（与执行超时/失败语义区分），便于上层状态机决策
            let runUrl: string | undefined
            if (needsPush && exitCode === 0) {
                try {
                    const branchName = await extractBranchName(workDir)
                    await pushFixBranch(branchName, workDir, ctx.credential?.token)
                    // runUrl 兜底为 branch URL（PR 失败时仍可显示供用户手动开 PR）
                    runUrl = `https://github.com/${owner}/${name}/tree/${branchName}`

                    // fix-and-pr 模式：push 成功后再创建 PR
                    if (needsPr && ctx.credential?.token) {
                        try {
                            const pr = await createPrForFix(result, owner, name, branchName, ctx.credential.token)
                            runUrl = pr.htmlUrl
                        } catch (prError) {
                            const raw = prError instanceof Error ? prError.message : String(prError)
                            // 保留 workDir 24h 供诊断（moveToPending 失败静默，不影响错误回传）
                            await moveToPending(workDir, ctx.runId, pendingRoot).catch(() => { /* 保留失败静默 */ })
                            return {
                                exitCode: 2,
                                error: {
                                    code: 'pr_creation_failed',
                                    message: `创建 PR 失败（分支已推送，workDir 已保留 24h 供诊断）：${sanitizeErrorMessage(raw)}`,
                                },
                                startedAt,
                                finishedAt: new Date().toISOString(),
                                runUrl,
                            }
                        }
                    }
                } catch (pushError) {
                    const raw = pushError instanceof Error ? pushError.message : String(pushError)
                    return {
                        exitCode: 2,
                        error: {
                            code: 'push_failed',
                            message: `推送修复分支失败：${sanitizeErrorMessage(raw)}`,
                        },
                        startedAt,
                        finishedAt: new Date().toISOString(),
                    }
                }
            }

            return {
                exitCode,
                result,
                startedAt,
                finishedAt: new Date().toISOString(),
                runUrl,
            }
        } catch (error) {
            // 纵深防御：错误消息脱敏（防未来任何路径把凭据带进错误文本）
            const raw = error instanceof Error ? error.message : String(error)
            const message = sanitizeErrorMessage(raw)
            const isTimeout = error instanceof ExecutionTimeoutError
            return {
                exitCode: 2,
                error: {
                    code: isTimeout ? 'execution_timeout' : 'execution_failed',
                    message: isTimeout ? `执行超时（${this.timeoutMs / 60000} 分钟上限）` : message,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        } finally {
            // 临时工作目录清理（执行后不留存）；清理失败不影响执行结果
            // 这里已是"未走 pr_creation_failed 保留路径"的所有场景（completed / push_failed / execution_failed / execution_timeout）
            await rm(workDir, { recursive: true, force: true }).catch(() => { /* 清理失败静默 */ })
        }
    }

    /** git clone 目标仓库（凭据经 http.extraheader 注入，URL 不携带 token——防 execFile 错误回显泄露） */
    private async cloneRepository(owner: string, name: string, branch: string, workDir: string, token?: string): Promise<void> {
        const repoUrl = `https://github.com/${owner}/${name}.git`
        const args = ['clone', '--depth', '1', '--branch', branch, repoUrl, '.']
        if (token) {
            // 凭据走 http.extraheader（base64 basic auth），不进 argv/URL
            const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
            args.unshift('-c', `http.extraheader=Authorization: basic ${basic}`)
        }
        const { stderr } = await execFileAsync('git', args, { cwd: workDir, timeout: 60_000 })
        if (stderr && !stderr.trim().startsWith('Cloning into')) {
            throw new Error(`git clone 失败：${stderr.trim()}`)
        }
    }
}

/** 带超时的 Promise 包装（超时抛专属错误类供识别，避免字符串匹配误判） */
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
 * 覆盖模式：
 * - URL 内嵌：`https://x-access-token:TOKEN@github.com/...` → `https://***@...`
 * - Authorization 头：`Authorization: <scheme> <token>`，scheme 支持 `basic` / `token` / `Bearer`
 *   （GitHub REST API v3+ 推荐 `Bearer`，但 legacy `token` 仍兼容；详见 C53-后-B + security.md §5.5）
 *
 * 不覆盖：未匹配到上述模式的明文 token（如 `ghp_xxx` 单独出现）；调用方应避免把明文 token
 * 拼到错误消息中（防御纵深依赖调用纪律，本工具仅兜底 sanitize）。
 *
 * 与 sandbox-executor.ts:378 同步实现；如有调整需同步两处（C53-后-B 登记）。
 */
export function sanitizeErrorMessage(message: string): string {
    return message
        .replace(/https?:\/\/[^/@\s]+@/g, 'https://***@')
        .replace(/(Authorization:\s+(?:basic|token|bearer)\s+)\S+/gi, '$1***')
}
