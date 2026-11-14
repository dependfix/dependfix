import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { FILTER_ALL, useRunFilters } from '../../app/composables/use-run-filters'

/**
 * use-run-filters 单测：扫描页运行列表筛选状态与展示口径（自 scans.vue 拆出）。
 *
 * 覆盖「默认选项 / 日期区间往返 / 阶段计数排序 / 激活判定与清除 / 区间合法性 / 状态文案与色值」六组；
 * 数据级筛选（服务端查询参数）由 `tests/e2e/scans.e2e.test.ts` 与 `sortable.e2e.test.ts` 覆盖。
 */

const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key

const setup = (byFailureStage: Record<string, number> = {}) => useRunFilters({
    t,
    summary: ref({ byFailureStage }),
})

describe('useRunFilters', () => {
    it('筛选项：首项为哨兵「全部」，其余与状态 / 阶段 / 建议枚举同序', () => {
        const filters = setup()

        expect(filters.statusFilterOptions.value[0]).toEqual({ label: 'scans.runList.filterAll', value: FILTER_ALL })
        expect(filters.statusFilterOptions.value.slice(1).map((item) => item.value)).toEqual([
            'pending',
            'running',
            'completed',
            'failed',
            'dispatched',
            'degraded',
        ])
        // 阶段 / 建议选项不出现空值（caomei Select 不允许空字符串 item value）
        expect(filters.failureStageFilterOptions.value.every((item) => item.value !== '')).toBe(true)
        expect(filters.failureKindFilterOptions.value.every((item) => item.value !== '')).toBe(true)
        expect(filters.byRepoStatusOptions.value.map((item) => item.value)).toEqual(filters.statusFilterOptions.value.map((item) => item.value))
    })

    it('日期区间：ISO 往返（set → ISO，get → Date），清空回空串', () => {
        const filters = setup()
        const date = new Date('2026-11-01T08:00:00.000Z')

        filters.fromDate.value = date
        expect(filters.filters.from).toBe('2026-11-01T08:00:00.000Z')
        expect(filters.fromDate.value?.toISOString()).toBe('2026-11-01T08:00:00.000Z')

        filters.toDate.value = null
        expect(filters.filters.to).toBe('')
        expect(filters.toDate.value).toBeNull()
    })

    it('阶段分布：仅非零项且计数降序', () => {
        const filters = setup({ verify: 2, deliver: 5, network: 0, clone: 0 })

        expect(filters.failureStageCounts.value.map((item) => item.count)).toEqual([5, 2])
    })

    it('激活判定与清除：任一维度生效即 true，清除后回到全默认', () => {
        const filters = setup()
        expect(filters.hasActiveFilters.value).toBe(false)

        filters.filters.status = 'failed'
        expect(filters.hasActiveFilters.value).toBe(true)

        filters.clearRunFilters()
        expect(filters.filters).toEqual({
            status: FILTER_ALL,
            failureStage: FILTER_ALL,
            failureKind: FILTER_ALL,
            from: '',
            to: '',
        })
        expect(filters.hasActiveFilters.value).toBe(false)
    })

    it('时间区间合法性：空端合法、from > to 非法', () => {
        const filters = setup()
        expect(filters.hasValidRunRange()).toBe(true)

        filters.filters.from = '2026-11-02T00:00:00.000Z'
        expect(filters.hasValidRunRange()).toBe(true)

        filters.filters.to = '2026-11-01T00:00:00.000Z'
        expect(filters.hasValidRunRange()).toBe(false)

        filters.filters.from = '2026-11-01T00:00:00.000Z'
        expect(filters.hasValidRunRange()).toBe(true)
    })

    it('状态文案：failed 追加阶段、其余保持原文案；Tag 色值映射固定', () => {
        const filters = setup()

        expect(filters.statusLabelWithStage('completed', 'verify')).toBe('runs.statusCompleted')
        expect(filters.statusLabelWithStage('failed', 'verify')).toContain('runs.statusFailed')
        expect(filters.statusLabelWithStage('failed', 'verify')).toContain(' · ')
        expect(filters.statusLabelWithStage('failed', null)).toBe('runs.statusFailed')
        expect(filters.statusLabelWithStage('custom', null)).toBe('custom')

        expect(filters.statusTone('completed')).toBe('success')
        expect(filters.statusTone('failed')).toBe('danger')
        expect(filters.statusTone('dispatched')).toBe('primary')
        expect(filters.statusTone('degraded')).toBe('warning')
        expect(filters.statusTone('pending')).toBe('neutral')
    })
})
