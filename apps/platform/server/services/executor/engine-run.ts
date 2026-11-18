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

/** 活动句柄类型计数（`process.getActiveResourcesInfo()` 的聚合结果）。 */
export type ActiveResourceCounts = Record<string, number>

/**
 * 采集当前进程的活动句柄类型计数；采集不可用时返回 `undefined`（而非空对象）。
 *
 * 用途：宽限期结束仍未落定时区分「受管子进程仍在跑」与「子进程已停但句柄未关闭」——
 * 后者常见于孙进程继承了 `stdout` / `stderr` 管道（`exit` 已到而 `close` 未到），
 * 此时只看在管子进程数会把「句柄泄漏」误读成「引擎仍在干活」。
 *
 * 返回 `undefined` 与 `{}` 语义不同：把「探针不可用」混同为「零句柄」会让基线侧空快照
 * 与当前全量快照相减，直接判成「有新增句柄」。
 */
export function snapshotActiveResources(): ActiveResourceCounts | undefined {
    let types: string[]
    try {
        types = process.getActiveResourcesInfo()
    } catch {
        // 诊断路径不得因采集失败掩盖未落定判定（由调用方写明「采集不可用」）
        return undefined
    }
    const counts: ActiveResourceCounts = {}
    for (const type of types) {
        counts[type] = (counts[type] ?? 0) + 1
    }
    return counts
}

/**
 * 两次活动句柄快照的**按类型净增量**（`current - baseline`）。
 *
 * - 以运行起点为基线：HTTP 监听、数据库连接、日志管道等常驻句柄不计入；
 * - 同型句柄「旧的关闭 + 新的泄漏」会相抵（Node 不提供句柄身份），故读数是净差而非新增集合；
 * - 任一侧采集不可用（`undefined`）→ 返回 `undefined`，不做「零基线」推断。
 */
export function diffActiveResources(
    baseline: ActiveResourceCounts | undefined,
    current: ActiveResourceCounts | undefined,
): ActiveResourceCounts | undefined {
    if (!baseline || !current) {
        return undefined
    }
    const delta: ActiveResourceCounts = {}
    for (const [type, count] of Object.entries(current)) {
        const added = count - (baseline[type] ?? 0)
        if (added > 0) {
            delta[type] = added
        }
    }
    return delta
}

/** 未落定成因的判读分类：在管子进程 / 未 settle 句柄 / 采集不可用 / 无法归类。 */
export type UnsettledCause = 'child-processes' | 'open-handles' | 'probe-unavailable' | 'unknown'

/** 取消后未落定的诊断快照（存活子进程 / 运行期句柄净增 / 最后命令 / 取消原因）。 */
export interface UnsettledRunSnapshot {
    /** 已等待的宽限期（毫秒） */
    graceMs: number
    /** 取消时刻仍在管的受管子进程数（登记表在 kill 时清空，此后读数恒为 0） */
    childProcessCount: number
    /** 最近一条受管命令（`binary args…`） */
    lastCommand?: string
    /** 取消原因（平台注入，如 `execution timeout`） */
    abortReason?: string
    /**
     * 运行起点到宽限期结束的活动句柄净增量（见 `diffActiveResources`）；
     * `undefined` 表示句柄探针不可用，不得读作「零增量」。
     */
    activeResourceDelta?: ActiveResourceCounts
}

/**
 * 按可用证据判读未落定成因。
 *
 * 取数时点不同（子进程数取取消当刻、句柄取宽限期结束），因此两者并列输出而不是互相遮蔽：
 * 分类只表达「哪类证据存在」，`describeUnsettledRun` 会把两类证据同时写进诊断句。
 */
export function classifyUnsettledCause(snapshot: UnsettledRunSnapshot): UnsettledCause {
    if (snapshot.childProcessCount > 0) {
        return 'child-processes'
    }
    if (!snapshot.activeResourceDelta) {
        return 'probe-unavailable'
    }
    if (Object.values(snapshot.activeResourceDelta).some((count) => count > 0)) {
        return 'open-handles'
    }
    return 'unknown'
}

/** `{ PipeWrap: 2, Timeout: 1 }` → `PipeWrap×2、Timeout×1`（按类型名排序，便于日志比对）。 */
function formatResourceCounts(counts: ActiveResourceCounts): string {
    return Object.keys(counts)
        .sort()
        .map((type) => `${type}×${counts[type]}`)
        .join('、')
}

/** 句柄证据句（进程级口径，不归属到具体运行——平台与引擎同进程）。 */
function describeHandleEvidence(snapshot: UnsettledRunSnapshot): string {
    const delta = snapshot.activeResourceDelta
    if (!delta) {
        return '运行期句柄：采集不可用'
    }
    const types = Object.keys(delta).filter((type) => (delta[type] ?? 0) > 0)
    if (types.length === 0) {
        return '运行期句柄：无净增'
    }
    const counts: ActiveResourceCounts = {}
    for (const type of types) {
        counts[type] = delta[type] as number
    }
    return `运行期句柄：净增 ${formatResourceCounts(counts)}（进程级口径，可能含平台自身连接与并发运行）`
}

/** 分类对应的判读句（与 `classifyUnsettledCause` 同源，避免两处口径漂移）。 */
function describeUnsettledCause(snapshot: UnsettledRunSnapshot): string {
    const cause = classifyUnsettledCause(snapshot)
    if (cause === 'child-processes') {
        // 「取消时刻」是测量时点：此时取消已请求终止子进程树，不能读作「宽限期结束仍在跑」
        return `诊断分类：在管子进程（取消时刻 ${snapshot.childProcessCount} 个，已请求终止）`
    }
    if (cause === 'open-handles') {
        return '诊断分类：未 settle 句柄（无在管的受管子进程）'
    }
    if (cause === 'probe-unavailable') {
        return '诊断分类：无法归类（句柄采集不可用）'
    }
    return '诊断分类：无法归类（无在管的受管子进程、无运行期句柄净增，疑为未返回的异步等待）'
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
        describeUnsettledCause(snapshot),
        describeHandleEvidence(snapshot),
    ]
    return parts.join('；')
}
