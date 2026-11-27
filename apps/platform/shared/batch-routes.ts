/**
 * 批次深链的路径契约（服务端兼容重定向与列表页读取共用，避免 `?id=` 键名在两处漂移）。
 */
export const BATCH_DEEP_LINK_QUERY_KEY = 'id'

/** 构造批次深链相对路径；id 缺失时回退列表页。 */
export const buildBatchDeepLinkPath = (id: string | null | undefined): string => {
    const targetId = id?.trim()
    return targetId ? `/batch-runs?${BATCH_DEEP_LINK_QUERY_KEY}=${encodeURIComponent(targetId)}` : '/batch-runs'
}
