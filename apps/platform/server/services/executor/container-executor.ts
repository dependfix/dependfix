import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DependfixApp, type RuntimeConfig } from '@dependfix/engine'
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
 * A 模式执行器（默认）：平台容器内执行。
 *
 * 设计要点（见 executor-sandbox.md §2.2 / §5.1）：
 * - 平台容器即沙箱（进程级隔离）：非 root 运行（镜像 USER）、临时工作目录、凭据最小化、超时
 * - report-only：不 clone（GitHub API 拉取告警，快）；fix/fix-and-pr：先 clone 到 workDir（fix 需操作仓库文件）
 * - 凭据来源单一：credential 由 credential service 解密传入，填充 RuntimeConfig.githubToken/alertsToken
 * - 执行结果直接复用 DependfixApp 的 RunResult（扫描结果落库数据源）
 * - A 模式 fix / fix-and-pr 完成后推送修复分支到远程；push 失败归类 `push_failed`
 *   （与 `execution_failed` / `execution_timeout` 语义区分），便于上层状态机决策 dispatched
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
                    runUrl = `https://github.com/${owner}/${name}/tree/${branchName}`
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
            // 后续阶段：push 失败前立即清理；push 成功 + PR 失败时保留 24h
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

/** 错误消息脱敏：抹除 URL 中可能内联的凭据（纵深防御，防 execFile argv 回显） */
export function sanitizeErrorMessage(message: string): string {
    return message
        .replace(/https?:\/\/[^/@\s]+@/g, 'https://***@')
        .replace(/(Authorization: basic )\S+/gi, '$1***')
}
