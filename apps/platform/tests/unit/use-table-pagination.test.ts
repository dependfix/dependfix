import { describe, expect, it } from 'vitest'
import { useTablePagination } from '../../app/composables/use-table-pagination'

/**
 * use-table-pagination 单测：受控分页在数据刷新期间的页码保持语义。
 *
 * 覆盖「刷新期间抑制自动回首页 / 刷新结束恢复 / 并发刷新不提前解锁 / 越界收敛 /
 * 显式回首页 / 刷新抛错仍解锁」。真实表格的数据替换行为由
 * `tests/e2e/repos-crud.e2e.test.ts` 的「分页保持」用例覆盖。
 */

const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

describe('useTablePagination', () => {
    it('默认从第 1 页、每页 10 条开始，可按初值覆盖', () => {
        const fallback = useTablePagination({ totalRows: () => 0 })
        expect(fallback.page.value).toBe(1)
        expect(fallback.rows.value).toBe(10)

        const custom = useTablePagination({ totalRows: () => 0, initialRows: 25 })
        expect(custom.rows.value).toBe(25)
    })

    it('分页器页码与每页条数回写受控状态', () => {
        const pagination = useTablePagination({ totalRows: () => 100 })
        pagination.onPageChange(4)
        pagination.onRowsChange(50)
        expect(pagination.page.value).toBe(4)
        expect(pagination.rows.value).toBe(50)
    })

    it('刷新期间忽略自动回首页，刷新结束后恢复响应', async () => {
        const pagination = useTablePagination({ totalRows: () => 100 })
        pagination.onPageChange(3)

        const gate = deferred()
        const refreshing = pagination.withRefresh(() => gate.promise)
        // 数据替换触发的自动重置（page 1）被抑制
        pagination.onPageChange(1)
        expect(pagination.page.value).toBe(3)

        gate.resolve()
        await refreshing
        // 刷新结束后的用户操作正常生效
        pagination.onPageChange(2)
        expect(pagination.page.value).toBe(2)
    })

    it('并发刷新时先结束的一轮不得提前解锁', async () => {
        const pagination = useTablePagination({ totalRows: () => 100 })
        pagination.onPageChange(5)

        const first = deferred()
        const second = deferred()
        const firstRefresh = pagination.withRefresh(() => first.promise)
        const secondRefresh = pagination.withRefresh(() => second.promise)

        first.resolve()
        await firstRefresh
        // 第二轮仍在进行，自动重置继续被抑制
        pagination.onPageChange(1)
        expect(pagination.page.value).toBe(5)

        second.resolve()
        await secondRefresh
        pagination.onPageChange(1)
        expect(pagination.page.value).toBe(1)
    })

    it('刷新后把越界页码夹回最后一页', async () => {
        let total = 95
        const pagination = useTablePagination({ totalRows: () => total, initialRows: 10 })
        pagination.onPageChange(10)

        total = 25
        await pagination.withRefresh(() => undefined)
        expect(pagination.page.value).toBe(3)
    })

    it('空结果集收敛到第 1 页', async () => {
        const pagination = useTablePagination({ totalRows: () => 30 })
        pagination.onPageChange(3)
        await pagination.withRefresh(() => undefined)
        expect(pagination.page.value).toBe(3)
    })

    it('reset 显式回到第 1 页（新增 / 删除）', () => {
        const pagination = useTablePagination({ totalRows: () => 100 })
        pagination.onPageChange(4)
        pagination.reset()
        expect(pagination.page.value).toBe(1)
    })

    it('刷新任务抛错时仍然解锁并收敛页码', async () => {
        let total = 15
        const pagination = useTablePagination({ totalRows: () => total })
        pagination.onPageChange(5)

        total = 5
        await expect(pagination.withRefresh(() => {
            throw new Error('refresh failed')
        })).rejects.toThrow('refresh failed')

        expect(pagination.page.value).toBe(1)
        pagination.onPageChange(2)
        expect(pagination.page.value).toBe(2)
    })
})
