import { computed, reactive, type Ref } from 'vue'
import {
    failureKindLabel,
    failureStageLabel,
    RUN_FAILURE_KIND_OPTIONS,
    RUN_FAILURE_STAGE_OPTIONS,
} from '../utils/run-view'

/**
 * 扫描页运行列表的筛选状态与展示口径（自 scans.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 语义与拆分前一致：
 * - 三维筛选（状态 / 失败阶段 / 处置建议）+ 开始时间区间；「全部」用哨兵值 `__all__`
 *   （caomei Select 不允许空字符串作为 item value），提交查询前哨兵不传递
 * - 状态文案 / 颜色与「失败 · 阶段」拼接口径在列表、按仓库聚合表与筛选下拉间同源
 * - 时间区间非法（from > to）由页面在拉取前拦截
 *
 * 依赖通过参数注入（不加载 Nuxt 运行时），便于单测覆盖选项、区间与计数派生。
 */
/** 筛选「全部」哨兵值（不进入查询参数） */
export const FILTER_ALL = '__all__'

/** 状态全集（顺序与 `SCAN_RUN_STATUSES` 一致） */
export const SCAN_RUN_STATUS_OPTIONS = ['pending', 'running', 'completed', 'failed', 'dispatched', 'degraded'] as const

export interface RunFilters {
    status: string
    failureStage: string
    failureKind: string
    from: string
    to: string
}

export interface UseRunFiltersOptions {
    /** i18n 文案解析 */
    t: (key: string, params?: Record<string, string | number>) => string
    /** 顶部聚合（阶段分布计数来源） */
    summary: Ref<{ byFailureStage: Record<string, number> } | null>
}

export const useRunFilters = ({ t, summary }: UseRunFiltersOptions) => {
    const filters = reactive<RunFilters>({
        status: FILTER_ALL,
        failureStage: FILTER_ALL,
        failureKind: FILTER_ALL,
        from: '',
        to: '',
    })

    /** 开始时间区间（DatePicker 使用 Date，提交时统一转 ISO；空串 = 未筛选） */
    const fromDate = computed<Date | null>({
        get: () => (filters.from ? new Date(filters.from) : null),
        set: (value) => {
            filters.from = value ? value.toISOString() : ''
        },
    })
    const toDate = computed<Date | null>({
        get: () => (filters.to ? new Date(filters.to) : null),
        set: (value) => {
            filters.to = value ? value.toISOString() : ''
        },
    })

    const statusFilterOptions = computed(() => [
        { label: t('scans.runList.filterAll'), value: FILTER_ALL },
        ...SCAN_RUN_STATUS_OPTIONS.map((status) => ({ label: statusLabel(status), value: status })),
    ])

    const failureStageFilterOptions = computed(() => [
        { label: t('scans.runList.filterAll'), value: FILTER_ALL },
        ...RUN_FAILURE_STAGE_OPTIONS.map((stage) => ({
            label: failureStageLabel(stage, t) ?? stage,
            value: stage,
        })),
    ])

    const failureKindFilterOptions = computed(() => [
        { label: t('scans.runList.filterAll'), value: FILTER_ALL },
        ...RUN_FAILURE_KIND_OPTIONS.map((kind) => ({
            label: failureKindLabel(kind, t) ?? kind,
            value: kind,
        })),
    ])

    /** byRepo「最近状态」下拉选项（状态集与 runs 列表同源，仅文案/用途不同） */
    const byRepoStatusOptions = computed(() => [
        { label: t('scans.runList.filterAll'), value: FILTER_ALL },
        ...SCAN_RUN_STATUS_OPTIONS.map((status) => ({ label: statusLabel(status), value: status })),
    ])

    /** 阶段分布汇总（仅展示非零项，计数降序）——与「阶段」下拉同源口径 */
    const failureStageCounts = computed(() => {
        const byStage = summary.value?.byFailureStage
        if (!byStage) {
            return []
        }
        return RUN_FAILURE_STAGE_OPTIONS
            .map((stage) => ({ stage, label: failureStageLabel(stage, t) ?? stage, count: byStage[stage] ?? 0 }))
            .filter((item) => item.count > 0)
            .sort((a, b) => b.count - a.count)
    })

    /** 状态 / 失败阶段 / 处置建议 / 开始时间区间是否有任一激活（用于「清除筛选」按钮可见性） */
    const hasActiveFilters = computed(() => (
        filters.status !== FILTER_ALL
        || filters.failureStage !== FILTER_ALL
        || filters.failureKind !== FILTER_ALL
        || filters.from !== ''
        || filters.to !== ''
    ))

    /** 清除运行列表筛选（变更由 watch(filters) 统一驱动重新拉取并回到第 1 页） */
    const clearRunFilters = () => {
        filters.status = FILTER_ALL
        filters.failureStage = FILTER_ALL
        filters.failureKind = FILTER_ALL
        filters.from = ''
        filters.to = ''
    }

    /** 开始时间区间是否合法（空端视为合法；Date.parse 已由 UI 产出 ISO 保证） */
    const hasValidRunRange = (): boolean =>
        !filters.from || !filters.to || Date.parse(filters.from) <= Date.parse(filters.to)

    /** 状态 Tag 颜色 + 文案（与 `repo-history-dialog` 风格一致） */
    const statusTone = (status: string) => {
        switch (status) {
            case 'completed':
                return 'success' as const
            case 'failed':
                return 'danger' as const
            case 'dispatched':
                return 'primary' as const
            case 'degraded':
                return 'warning' as const
            default:
                return 'neutral' as const
        }
    }

    const statusLabel = (status: string) => ({
        completed: t('runs.statusCompleted'),
        failed: t('runs.statusFailed'),
        dispatched: t('runs.statusDispatched'),
        running: t('runs.statusRunning'),
        pending: t('common.status.pending'),
        degraded: t('runs.statusDegraded'),
    })[status] ?? status

    /**
     * 状态文案：`failed` 且有失败阶段时追加「· {阶段}」（如「失败 · 验证门禁」），
     * 使用户一眼区分网络可重试失败与验证 / 交付类需研判失败；其余状态保持原文案。
     */
    const statusLabelWithStage = (status: string, stage: string | null | undefined) => {
        const base = statusLabel(status)
        const stageText = failureStageLabel(stage, t)
        return status === 'failed' && stageText ? `${base} · ${stageText}` : base
    }

    return {
        filters,
        fromDate,
        toDate,
        statusFilterOptions,
        failureStageFilterOptions,
        failureKindFilterOptions,
        byRepoStatusOptions,
        failureStageCounts,
        hasActiveFilters,
        clearRunFilters,
        hasValidRunRange,
        statusTone,
        statusLabel,
        statusLabelWithStage,
    }
}
