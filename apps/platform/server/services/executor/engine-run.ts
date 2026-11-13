// engine-run.ts — 引擎执行的超时与协作式取消（平台侧接入面）。
//
// 背景（2026-10-16 生产复盘）：引擎与平台同进程运行，执行超时此前的实现只做 `Promise.race`
// ——平台放弃等待后**引擎继续跑**，僵尸安装进程与后续仓库争抢资源，4 核 4 GB 主机上触发
// 内核 OOM 级联（41 次 `Killed process`，与引擎日志行同秒对齐）。
//
// 本模块把"超时"从"放弃等待"升级为"请求取消 + 宽限期"：
// 1. 超时到达 → 调用方注入的取消回调（`DependfixApp.abort`）请求运行级取消：
//    终止在跑子进程树、停止启动新工作、放弃交付（见 `packages/engine/src/runners/process-control.ts`）；
// 2. 随后以 `ExecutionTimeoutError` 收尾（状态机据此分类 `execution_timeout`）；
// 3. `settleWithin` 供调用方在清理工作目录之前给引擎一段落定期（避免与引擎写盘互相踩）。
//
// 拆出理由：容器执行器 `execute()` 已是长方法，且超时/取消语义需可独立单测（不依赖真实仓库）。
/** 执行超时上限触发的错误（`source` 区分 clone 超时与整体执行超时）。 */
export class ExecutionTimeoutError extends Error {
    readonly source: 'clone' | 'execution'

    constructor(ms: number, source: 'clone' | 'execution' = 'execution') {
        super(`operation timeout after ${ms}ms`)
        this.name = 'ExecutionTimeoutError'
        this.source = source
    }
}

/**
 * 超时后等待引擎落定的宽限期。
 *
 * 取值依据：取消已同步终止子进程树（`killProcessTree`），剩余工作只是收尾与落盘；
 * 10 秒足够，超出则不再等待——继续阻塞只会占用队列与 Worker 锁。
 */
export const ABORT_GRACE_MS = 10_000

/** `withTimeout` 可选行为（超时时的取消回调）。 */
export interface WithTimeoutOptions {
    /**
     * 超时到达时调用（在抛出 `ExecutionTimeoutError` 之前）。
     * 典型用途：请求运行级取消，使引擎停止启动新工作并终止在跑子进程。
     * 回调抛错**不会**掩盖超时错误（超时语义优先）。
     */
    onTimeout?: (ms: number) => void
}

/**
 * 带超时的 Promise 包装。
 *
 * 与裸 `Promise.race` 的差异：超时到达时先执行 `options.onTimeout`（请求协作式取消），
 * 再以专属错误类收尾；取消回调自身抛错被吞掉并以 warn 输出，保证超时错误不被掩盖。
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    options: WithTimeoutOptions = {},
): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            if (options.onTimeout) {
                try {
                    options.onTimeout(ms)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.warn(`[executor] 超时取消回调失败（不影响超时判定）：${message}`)
                }
            }
            reject(new ExecutionTimeoutError(ms))
        }, ms)
    })
    try {
        return await Promise.race([promise, timeoutPromise])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * 等待 `promise` 落定，最多 `ms` 毫秒。
 *
 * - 落定（含 reject）→ 返回 `true`
 * - 超时 → 返回 `false`（调用方据此决定是否继续等待；不抛错）
 */
export async function settleWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined
    try {
        return await Promise.race([
            promise.then(() => true, () => true),
            new Promise<boolean>((resolve) => {
                timer = setTimeout(() => resolve(false), ms)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}

/** 取消后未落定的诊断快照（存活子进程 / 最后命令 / 取消原因）。 */
export interface UnsettledRunSnapshot {
    /** 已等待的宽限期（毫秒） */
    graceMs: number
    /** 取消时刻仍在管的受管子进程数（登记表在 kill 时清空，此后读数恒为 0） */
    childProcessCount: number
    /** 最近一条受管命令（`binary args…`） */
    lastCommand?: string
    /** 取消原因（平台注入，如 `execution timeout`） */
    abortReason?: string
}

/**
 * 取消宽限期结束仍未落定时的诊断文本（落执行日志，供 `_pending` 目录与运行详情归因）。
 *
 * 宽限期保持固定上限、不做无限延长；未落定则延迟清理（`_pending`）并留下证据，
 * 让「为什么没落定」可判读，而不是只看到「超时」。
 */
export function describeUnsettledRun(snapshot: UnsettledRunSnapshot): string {
    const parts = [
        `未在 ${snapshot.graceMs}ms 宽限期内落定`,
        `取消时刻在管受管子进程 ${snapshot.childProcessCount} 个`,
        `最后命令：${snapshot.lastCommand ?? '（无受管命令记录）'}`,
        `取消原因：${snapshot.abortReason ?? '（未记录）'}`,
    ]
    return parts.join('；')
}
