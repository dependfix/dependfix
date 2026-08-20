/**
 * dashboard 图表纯数据派生（apps/platform/app/utils/dashboard-charts.ts）。
 *
 * 减法动机：useDashboardStats composable 中 chart data 计算分支较多（severity 5 桶 / fixRate clamp
 * 边界 / Top-10 截断），混合 Nuxt auto-import 后难以单测。提取为纯函数模块，composable 仅做 reactive
 * 状态 + fetch，纯函数部分可独立 vitest 覆盖所有分支。
 */

export interface TopPackage {
    packageName: string
    count: number
}

export interface DashboardStats {
    repositoryCount: number
    alertsTotal: number
    severityCounts: Record<string, number>
    fixedCount: number
    topPackages: TopPackage[]
    latestRun: {
        id: string
        repository: string | null
        status: string
        startedAt: string | null
        finishedAt: string | null
    } | null
}

/** severity 5 色映射：复用 PrimeVue Tag 配色映射（与 severityTagSeverity 视觉一致） */
export const SEVERITY_COLORS: Record<string, string> = {
    critical: '#e11d48', // danger
    high: '#f59e0b', // warn
    medium: '#3b82f6', // info
    low: '#64748b', // secondary
    unknown: '#94a3b8', // secondary (lighter)
}

/** Top-10 包柱状图截断阈值（避免 x 轴标签拥挤） */
export const TOP_PACKAGES_LIMIT = 10

/** Top-10 包柱状图 x 轴标签截断阈值（tooltip 显示完整名） */
const TOP_PACKAGE_LABEL_MAX = 20

/** severity 桶顺序（与 primevue tag severity 视觉对齐） */
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'unknown'] as const

/**
 * 构造 severity 饼图 data（Chart.js datasets 形态）。
 */
export function buildSeverityChartData(stats: DashboardStats | null) {
    const counts = stats?.severityCounts ?? {}
    return {
        labels: SEVERITY_ORDER.map((k) => k),
        datasets: [
            {
                data: SEVERITY_ORDER.map((k) => counts[k] ?? 0),
                backgroundColor: SEVERITY_ORDER.map((k) => SEVERITY_COLORS[k]),
                borderWidth: 2,
                borderColor: '#ffffff',
            },
        ],
    }
}

/**
 * 构造 severity 饼图 options（Chart.js options 形态）。
 */
export function buildSeverityChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom' as const,
                labels: { boxWidth: 12, padding: 12 },
            },
        },
    }
}

/**
 * 修复率百分比（clamp 防止 fixedCount 异常 > alertsTotal 时超过 100%）。
 */
export function computeFixRatePercent(stats: DashboardStats | null): number {
    const total = stats?.alertsTotal ?? 0
    if (total === 0) {
        return 0
    }
    const clampedFixed = Math.min(stats!.fixedCount, total)
    return Math.round((clampedFixed / total) * 100)
}

/**
 * 修复率环形 data。`labels` 由调用方 i18n 注入（fixRateLabel / fixRateRemaining）。
 */
export function buildFixRateChartData(
    stats: DashboardStats | null,
    labels: [string, string],
): {
    labels: [string, string]
    datasets: { data: number[], backgroundColor: [string, string], borderWidth: number }[]
} {
    const total = stats?.alertsTotal ?? 0
    const fixed = stats?.fixedCount ?? 0
    const clampedFixed = Math.min(fixed, total)
    const remaining = total - clampedFixed
    return {
        labels,
        datasets: [
            {
                // 0 告警时显示纯灰环（remaining 占满 100%），与"暂无数据"语义对齐
                data: total > 0 ? [clampedFixed, remaining] : [0, 1],
                backgroundColor: ['#14b8a6', '#e2e8f0'], // primary / slate-200
                borderWidth: 0,
            },
        ],
    }
}

/**
 * 修复率环形 options。`tooltipEnabled` 由调用方根据 alertsTotal 派生。
 */
export function buildFixRateChartOptions(tooltipEnabled: boolean) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: { display: false },
            tooltip: { enabled: tooltipEnabled },
        },
    }
}

/** Top-10 包柱状图 labels（包名截断 20 字符 + tooltip 显示完整名） */
export function buildTopPackagesLabels(packages: TopPackage[]): string[] {
    return packages.map((p) => (p.packageName.length > TOP_PACKAGE_LABEL_MAX
        ? `${p.packageName.slice(0, TOP_PACKAGE_LABEL_MAX - 2)}…`
        : p.packageName))
}

/**
 * 构造 Top-10 包柱状图 data（已 slice 到 TOP_PACKAGES_LIMIT + 截断 labels）。
 */
export function buildTopPackagesChartData(
    packages: TopPackage[],
    chartTitleLabel: string,
) {
    const top = packages.slice(0, TOP_PACKAGES_LIMIT)
    return {
        labels: buildTopPackagesLabels(top),
        datasets: [
            {
                label: chartTitleLabel,
                data: top.map((p) => p.count),
                backgroundColor: '#14b8a6',
                borderRadius: 4,
            },
        ],
    }
}

/**
 * 构造 Top-10 包柱状图 options。`getFullPackageName` 由调用方传入（按 dataIndex 拿完整包名）。
 */
export function buildTopPackagesChartOptions(getFullPackageName: (idx: number) => string) {
    return {
        indexAxis: 'y' as const, // horizontal bar
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: (items: { dataIndex: number }[]) => {
                        const idx = items[0]?.dataIndex ?? 0
                        return getFullPackageName(idx)
                    },
                },
            },
        },
        scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
        },
    }
}
