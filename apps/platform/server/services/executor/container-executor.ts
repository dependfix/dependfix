import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DependfixApp, type RuntimeConfig } from '@dependfix/engine'
import type { ScanExecutor, ScanExecutorContext, ScanExecutorResult } from './types'

const execFileAsync = promisify(execFile)

/**
 * A 模式执行器（默认）：平台容器内执行。
 *
 * 设计要点（见 executor-sandbox.md §2.2 / §5.1）：
 * - 平台容器即沙箱（进程级隔离）：非 root 运行（镜像 USER）、临时工作目录、凭据最小化、超时
 * - report-only：不 clone（GitHub API 拉取告警，快）；fix/fix-and-pr：先 clone 到 workDir（fix 需操作仓库文件）
 * - 凭据来源单一：credential 由 credential service 解密传入，填充 RuntimeConfig.githubToken/alertsToken
 * - 执行结果直接复用 DependfixApp 的 RunResult（扫描结果落库数据源）
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

            return {
                exitCode,
                result,
                startedAt,
                finishedAt: new Date().toISOString(),
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
