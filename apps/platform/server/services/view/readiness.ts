import { ensureDatabaseInitialized } from '#server/database'
import { getSchemaStatus, type SchemaStatus } from '#server/database/schema-drift'

/** readiness 探测总超时（毫秒，覆盖「建连 + 查询」两阶段；必须小于编排器 / uptime 的请求超时） */
export const READINESS_QUERY_TIMEOUT_MS = 2000

/** readiness 状态（只暴露枚举，不暴露数据库类型 / 路径 / 错误正文） */
export type ReadinessStatus = 'ready' | 'not_ready'

/** readiness 视图（公开只读；字段集合固定为 status + schema） */
export interface ReadinessView {
    status: ReadinessStatus
    schema: SchemaStatus
}

/** 可注入的数据库句柄（只要求 query；单测用 stub，不触碰真实连接） */
export interface ReadinessDataSource {
    query: (sql: string) => Promise<unknown>
}

/** readiness 探测依赖（缺省为真实数据库引导；单测注入 stub / 超时值） */
export interface ReadinessDeps {
    ensureDataSource?: () => Promise<ReadinessDataSource>
    timeoutMs?: number
}

/**
 * Promise 超时包装：超时后 reject，并在 finally 清掉定时器（不阻塞进程退出）。
 * 用途仅为探针：慢查询不得让 HTTP 探针悬挂到编排器超时（否则只会看到超时而非 not_ready）。
 */
export const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`readiness probe timeout after ${timeoutMs}ms`)), timeoutMs)
            }),
        ])
    } finally {
        if (timer) {
            clearTimeout(timer)
        }
    }
}

/** 距截止时刻的剩余预算（至少 1ms，避免 0 / 负数被 setTimeout 立即触发） */
const remainingMs = (deadline: number): number => Math.max(1, deadline - Date.now())

/**
 * 数据库可读探测（readiness 的唯一依赖）。
 *
 * 两阶段（建连 → `SELECT 1`）共享**同一个总超时**：任一段慢都按同一 deadline 截断，
 * 保证端点最坏耗时 ≈ `timeoutMs`，而不是两倍。
 * 任一环节抛错 / 超时都判 not_ready（fail-closed）；错误正文不回传，本模块也不额外记录日志
 * （数据库层自身仍会输出连接失败日志，若探针间隔过密需在日志侧降噪）。
 */
export const checkDatabaseReadable = async (deps: ReadinessDeps = {}): Promise<boolean> => {
    const timeoutMs = deps.timeoutMs ?? READINESS_QUERY_TIMEOUT_MS
    const ensureDataSource = deps.ensureDataSource ?? ensureDatabaseInitialized
    const deadline = Date.now() + timeoutMs
    try {
        const dataSource = await withTimeout(ensureDataSource(), remainingMs(deadline))
        await withTimeout(dataSource.query('SELECT 1'), remainingMs(deadline))
        return true
    } catch {
        return false
    }
}

/**
 * readiness 视图：`status` 由数据库可读性决定，`schema` 复用启动期漂移检测结果。
 * 编排器 / 外部 uptime 只看 HTTP 状态码（200 ready / 503 not_ready），无需解析正文。
 */
export const toReadinessView = async (deps: ReadinessDeps = {}): Promise<ReadinessView> => ({
    status: (await checkDatabaseReadable(deps)) ? 'ready' : 'not_ready',
    schema: getSchemaStatus(),
})
