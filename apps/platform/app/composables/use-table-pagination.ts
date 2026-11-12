import { nextTick, ref, type Ref } from 'vue'

/** 受控分页的状态来源 */
export interface TablePaginationDeps {
    /** 当前筛选结果行数（刷新后用于把越界页码夹回最后一页） */
    totalRows: () => number
    /** 每页条数初值，默认 10 */
    initialRows?: number
}

export interface TablePaginationReturn {
    /** 当前页码（1 基，直接绑到 DataTable 的 `page`） */
    page: Ref<number>
    /** 每页条数（直接绑到 DataTable 的 `rows`） */
    rows: Ref<number>
    /** 绑到 DataTable 的 `update:page` */
    onPageChange: (page: number) => void
    /** 绑到 DataTable 的 `update:rows` */
    onRowsChange: (rows: number) => void
    /** 回到第 1 页（新增 / 删除等动作） */
    reset: () => void
    /** 把越界页码夹回最后一页 */
    clamp: () => void
    /** 包裹一次数据刷新 */
    withRefresh: (task: () => unknown) => Promise<void>
}

/**
 * 客户端分页表（caomei DataTable 内建分页）的受控页码状态。
 *
 * 解决的问题：`data` 引用一变，`@tanstack` 的 `autoResetPageIndex` 就把页码打回第 1 页。
 * 保存、轮询、手动刷新都会重建筛选结果数组，于是读者被迫从当前页回到首页；分页器若随组件重建
 * （`v-if` 收起表格），每页条数也会退回默认值。
 *
 * 本组合式把 `page` / `rows` 提升为页面级受控状态：
 * - `withRefresh(task)` 包裹数据刷新：期间抑制表格抛出的自动页码重置，刷新落定后收敛越界页码
 * - `reset()` 供新增 / 删除等确实需要回首页的动作显式调用
 * - 用户点击分页器走 `onPageChange`，被抑制的只有数据替换触发的那次自动重置
 */
export const useTablePagination = (deps: TablePaginationDeps): TablePaginationReturn => {
    const page = ref(1)
    const rows = ref(deps.initialRows ?? 10)
    /** 进行中的刷新数：并发刷新时先结束的一轮不得提前解锁 */
    let pendingRefreshes = 0

    const onPageChange = (next: number) => {
        if (pendingRefreshes > 0) {
            return
        }
        page.value = next
    }

    const onRowsChange = (next: number) => {
        rows.value = next
    }

    const reset = () => {
        page.value = 1
    }

    const clamp = () => {
        const pageCount = Math.max(1, Math.ceil(deps.totalRows() / Math.max(rows.value, 1)))
        if (page.value > pageCount) {
            page.value = pageCount
        }
    }

    const withRefresh = async (task: () => unknown) => {
        pendingRefreshes += 1
        try {
            await task()
        } finally {
            // 等本轮数据引发的表格重算落定后再解锁，避免自动重置事件落在解锁之后
            await nextTick()
            clamp()
            pendingRefreshes -= 1
        }
    }

    return { page, rows, onPageChange, onRowsChange, reset, clamp, withRefresh }
}
