/**
 * 批次深链（`/batch-runs?id=<batchRunId>`）的目标定位。
 *
 * 站外通知使用 `/batch-runs/<id>`，由兼容路由重定向到本形态；列表页据此把目标行翻到
 * 所在页并展开——否则会出现「链接能打开，但看不到目标批次」。
 */
export interface BatchDeepLinkTarget {
    /** 目标行在（筛选后的）列表中的下标 */
    index: number
    /** 目标行所在页码（1 基，与 caomei DataTable 的 `page` 同口径） */
    page: number
}

/**
 * 解析深链目标；未提供 id / 目标不在当前列表 / 非法页码参数时返回 null（调用方保持列表原样）。
 */
export const resolveBatchDeepLinkTarget = (
    runs: readonly { id: string }[],
    id: string | null | undefined,
    pageSize: number,
): BatchDeepLinkTarget | null => {
    const targetId = id?.trim()
    if (!targetId) {
        return null
    }
    const index = runs.findIndex((run) => run.id === targetId)
    if (index < 0) {
        return null
    }
    // 非法 pageSize（0 / 负数 / NaN / Infinity）按 1 处理，避免算出 NaN 页码
    const normalizedPageSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 1
    return { index, page: Math.floor(index / normalizedPageSize) + 1 }
}
