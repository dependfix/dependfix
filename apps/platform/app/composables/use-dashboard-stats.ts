/**
 * useDashboardStats: 仪表板统计 fetch + 3 块 Chart.js 配置的 composable。
 *
 * 复用动机：dashboard.vue 已实现 3 块图表（severity 饼图 + fixRate 环形 + Top-10 包柱状图），
 * alerts.vue 顶部加同款图表卡片。为消除代码重复并铺路后续页面接入统计图表，抽取为 composable。
 *
 * 减法重构：chart data/options 派生函数抽到 `~/utils/dashboard-charts` 纯函数模块，
 * 便于单测覆盖所有分支（severity 5 桶 / fixRate clamp / Top-10 截断）。composable 仅做
 * reactive 状态 + fetch + i18n 标签注入。
 *
 * 数据源：GET /api/dashboard/stats（已闭环，含 severityCounts / fixedCount / topPackages / alertsTotal）。
 * 图表配置：severity 5 色映射 + fixRate clamp + Top-10 截断 20 字符 + 768px-ready（responsive: true）。
 *
 * 用法（Nuxt auto-import，无需显式 import）：
 * ```ts
 * const { stats, loading, fetchStats, severityChartData, fixRateChartData, topPackagesChartData } = useDashboardStats()
 * onMounted(fetchStats)
 * ```
 *
 * 复用页面：dashboard.vue + alerts.vue。
 * 设计文档：[docs/standards/platform.md §7.1 PrimeVue 4 集成实践](../../../../docs/standards/platform.md#71-primevue-4-集成实践)。
 */
import {
    buildFixRateChartData,
    buildFixRateChartOptions,
    buildSeverityChartData,
    buildSeverityChartOptions,
    buildTopPackagesChartData,
    buildTopPackagesChartOptions,
    computeFixRatePercent,
    TOP_PACKAGES_LIMIT,
    type DashboardStats,
} from '~/utils/dashboard-charts'

export function useDashboardStats() {
    const { t } = useI18n()

    const stats = ref<DashboardStats | null>(null)
    const loading = ref(true)
    const error = ref('')

    const fetchStats = async () => {
        loading.value = true
        error.value = ''
        try {
            const res = await $fetch('/api/dashboard/stats')
            stats.value = res as DashboardStats
        } catch (e: unknown) {
            const err = e as { data?: { message?: string }, message?: string }
            error.value = t('dashboard.errors.loadFailed', {
                message: err.data?.message ?? err.message ?? t('common.errors.unknown'),
            })
        } finally {
            loading.value = false
        }
    }

    // severity 饼图
    const severityChartData = computed(() => buildSeverityChartData(stats.value))
    const severityChartOptions = computed(() => buildSeverityChartOptions())

    // 修复率环形
    const fixRatePercent = computed(() => computeFixRatePercent(stats.value))
    const fixRateIsEmpty = computed(() => (stats.value?.alertsTotal ?? 0) === 0)
    const fixRateChartData = computed(() => buildFixRateChartData(
        stats.value,
        [t('dashboard.fixRateLabel'), t('dashboard.fixRateRemaining')],
    ))
    const fixRateChartOptions = computed(() => buildFixRateChartOptions((stats.value?.alertsTotal ?? 0) > 0))

    // Top-10 包柱状图
    const topPackagesChartData = computed(() => buildTopPackagesChartData(
        stats.value?.topPackages ?? [],
        t('dashboard.topPackagesChartTitle'),
    ))
    const topPackagesChartOptions = computed(() => buildTopPackagesChartOptions(
        (idx: number) => stats.value?.topPackages?.[idx]?.packageName ?? '',
    ))

    const hasTopPackages = computed(() => (stats.value?.topPackages?.length ?? 0) > 0)
    const hasSeverityData = computed(() => (stats.value?.alertsTotal ?? 0) > 0)

    return {
        stats,
        loading,
        error,
        fetchStats,
        // severity
        severityChartData,
        severityChartOptions,
        hasSeverityData,
        // fixRate
        fixRateChartData,
        fixRateChartOptions,
        fixRatePercent,
        fixRateIsEmpty,
        // topPackages
        topPackagesChartData,
        topPackagesChartOptions,
        hasTopPackages,
        // constants
        TOP_PACKAGES_LIMIT,
    }
}
