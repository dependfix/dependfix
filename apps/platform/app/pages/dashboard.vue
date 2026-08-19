<script setup lang="ts">
// 仪表板：仓库数/告警数（按严重级别）/已修复数/最近扫描
// C61 新增图表区（见 docs/plan/todo.md §C61）：severity 饼图 / 修复率环形 / Top-10 包柱状图
// 图表用自实现 ChartCanvas（apps/platform/app/components/ChartCanvas.vue），
// 避免 PrimeVue `<Chart>` 内部 chart.js/auto 全量（~200KB）—— tree-shakable 仅注册用到的子集
import { computed } from 'vue'

const { session } = useSession()
const { t } = useI18n()

definePageMeta({
    middleware: 'auth',
})

interface TopPackage {
    packageName: string
    count: number
}

interface DashboardStats {
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

const loading = ref(true)
const error = ref('')
const stats = ref<DashboardStats | null>(null)

const fetchStats = async () => {
    loading.value = true
    error.value = ''
    try {
        const res = await $fetch('/api/dashboard/stats')
        stats.value = res as DashboardStats
    } catch (e: any) {
        error.value = t('dashboard.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

onMounted(fetchStats)

const severityTagSeverity = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'danger'
        case 'high':
            return 'warn'
        case 'medium':
            return 'info'
        default:
            return 'secondary'
    }
}

// severity 饼图 5 色映射：复用 PrimeVue Tag 配色映射（与现有 severityTagSeverity 视觉一致）
const SEVERITY_COLORS: Record<string, string> = {
    critical: '#e11d48', // danger
    high: '#f59e0b', // warn
    medium: '#3b82f6', // info
    low: '#64748b', // secondary
    unknown: '#94a3b8', // secondary (lighter)
}

const severityChartData = computed(() => {
    const counts = stats.value?.severityCounts ?? {}
    const labels = ['critical', 'high', 'medium', 'low', 'unknown']
    return {
        labels: labels.map((k) => k),
        datasets: [
            {
                data: labels.map((k) => counts[k] ?? 0),
                backgroundColor: labels.map((k) => SEVERITY_COLORS[k]),
                borderWidth: 2,
                borderColor: '#ffffff',
            },
        ],
    }
})

const severityChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'bottom' as const,
            labels: { boxWidth: 12, padding: 12 },
        },
    },
}))

// 修复率环形：fixedCount / alertsTotal
const fixRateChartData = computed(() => {
    const total = stats.value?.alertsTotal ?? 0
    const fixed = stats.value?.fixedCount ?? 0
    // 边界：fixedCount > alertsTotal 时 remaining 截为 0；中心百分比同步 clamp 到 100%
    const clampedFixed = Math.min(fixed, total)
    const remaining = total - clampedFixed
    return {
        labels: [t('dashboard.fixRateLabel'), t('dashboard.fixRateRemaining')],
        datasets: [
            {
                // 0 告警时显示纯灰环（remaining 占满 100%），与"暂无数据"语义对齐
                data: total > 0 ? [clampedFixed, remaining] : [0, 1],
                backgroundColor: ['#14b8a6', '#e2e8f0'], // primary / slate-200
                borderWidth: 0,
            },
        ],
    }
})

const fixRatePercent = computed(() => {
    const total = stats.value?.alertsTotal ?? 0
    if (total === 0) return 0
    // clamp 防止 fixedCount 异常 > alertsTotal 时中心百分比超过 100%
    const clampedFixed = Math.min(stats.value!.fixedCount, total)
    return Math.round((clampedFixed / total) * 100)
})

const fixRateIsEmpty = computed(() => (stats.value?.alertsTotal ?? 0) === 0)

const fixRateChartOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
        legend: { display: false },
        tooltip: { enabled: (stats.value?.alertsTotal ?? 0) > 0 },
    },
}))

// Top-10 包柱状图：x 轴包名截断 20 字符 + tooltip 完整名
const TOP_PACKAGES_LIMIT = 10
const topPackagesChartData = computed(() => {
    const top = (stats.value?.topPackages ?? []).slice(0, TOP_PACKAGES_LIMIT)
    return {
        labels: top.map((p) => (p.packageName.length > 20 ? `${p.packageName.slice(0, 18)}…` : p.packageName)),
        datasets: [
            {
                label: t('dashboard.topPackagesChartTitle'),
                data: top.map((p) => p.count),
                backgroundColor: '#14b8a6',
                borderRadius: 4,
            },
        ],
    }
})

const topPackagesChartOptions = computed(() => ({
    indexAxis: 'y' as const, // horizontal bar
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            callbacks: {
                title: (items: Array<{ dataIndex: number }>) => {
                    const idx = items[0]?.dataIndex ?? 0
                    return stats.value?.topPackages?.[idx]?.packageName ?? ''
                },
            },
        },
    },
    scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
    },
}))

const hasTopPackages = computed(() => (stats.value?.topPackages?.length ?? 0) > 0)
const hasSeverityData = computed(() => (stats.value?.alertsTotal ?? 0) > 0)
</script>

<template>
    <div class="dashboard">
        <h2>{{ t('dashboard.title') }}</h2>
        <p class="text-muted">
            {{ t('dashboard.welcome', {email: session?.user?.email}) }}
        </p>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>

        <template v-if="!loading && stats">
            <div class="dashboard__stats">
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value">
                            {{ stats.repositoryCount }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            {{ t('dashboard.repositoryCount') }}
                        </div>
                    </template>
                </Card>
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value">
                            {{ stats.alertsTotal }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            {{ t('dashboard.alertsTotal') }}
                        </div>
                    </template>
                </Card>
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value">
                            {{ stats.fixedCount }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            {{ t('dashboard.fixedCount') }}
                        </div>
                    </template>
                </Card>
                <Card class="dashboard__stat">
                    <template #content>
                        <div class="dashboard__stat-value dashboard__stat-value--sm">
                            {{ stats.latestRun?.repository ?? '—' }}
                        </div>
                        <div class="dashboard__stat-label text-muted">
                            {{ t('dashboard.latestRun') }}
                        </div>
                    </template>
                </Card>
            </div>

            <div class="dashboard__severity">
                <h3>{{ t('dashboard.severityTitle') }}</h3>
                <div class="dashboard__severity-row">
                    <span
                        v-for="severity in ['critical', 'high', 'medium', 'low', 'unknown']"
                        :key="severity"
                        class="dashboard__severity-item"
                    >
                        <Tag :value="severity" :severity="severityTagSeverity(severity)" />
                        <span class="dashboard__severity-count">
                            {{ stats.severityCounts[severity] ?? 0 }}
                        </span>
                    </span>
                </div>
            </div>

            <div class="dashboard__charts">
                <h3>{{ t('dashboard.chartTitle') }}</h3>
                <div class="dashboard__charts-grid">
                    <Card class="dashboard__chart-card">
                        <template #content>
                            <h4 class="dashboard__chart-title">
                                {{ t('dashboard.severityChartTitle') }}
                            </h4>
                            <ClientOnly>
                                <div class="dashboard__chart-canvas">
                                    <ChartCanvas
                                        type="doughnut"
                                        :data="severityChartData"
                                        :options="severityChartOptions"
                                        :aria-label="`${t('dashboard.severityChartTitle')}: ${Object.entries(stats.severityCounts).map(([k, v]) => `${k} ${v}`).join(', ')}`"
                                    />
                                    <p v-if="!hasSeverityData" class="dashboard__chart-overlay-empty text-muted">
                                        {{ t('dashboard.chartEmpty') }}
                                    </p>
                                </div>
                            </ClientOnly>
                        </template>
                    </Card>
                    <Card class="dashboard__chart-card">
                        <template #content>
                            <h4 class="dashboard__chart-title">
                                {{ t('dashboard.fixRateChartTitle') }}
                            </h4>
                            <ClientOnly>
                                <div class="dashboard__chart-canvas dashboard__chart-canvas--with-center">
                                    <ChartCanvas
                                        type="doughnut"
                                        :data="fixRateChartData"
                                        :options="fixRateChartOptions"
                                        :aria-label="`${t('dashboard.fixRateChartTitle')}: ${t('dashboard.fixRateValue', {percent: fixRatePercent})}`"
                                    />
                                    <div class="dashboard__chart-center">
                                        <span v-if="fixRateIsEmpty" class="dashboard__chart-center-value dashboard__chart-center-value--muted">—</span>
                                        <span v-else class="dashboard__chart-center-value">{{ t('dashboard.fixRateValue', {percent: fixRatePercent}) }}</span>
                                    </div>
                                    <p v-if="fixRateIsEmpty" class="dashboard__chart-overlay-empty text-muted">
                                        {{ t('dashboard.chartEmpty') }}
                                    </p>
                                </div>
                            </ClientOnly>
                        </template>
                    </Card>
                    <Card class="dashboard__chart-card dashboard__chart-card--wide">
                        <template #content>
                            <h4 class="dashboard__chart-title">
                                {{ t('dashboard.topPackagesChartTitle') }}
                                <span class="dashboard__chart-hint text-muted">{{ t('dashboard.packageTruncated') }}</span>
                            </h4>
                            <ClientOnly>
                                <div class="dashboard__chart-canvas dashboard__chart-canvas--bar">
                                    <ChartCanvas
                                        type="bar"
                                        :data="topPackagesChartData"
                                        :options="topPackagesChartOptions"
                                        :aria-label="`${t('dashboard.topPackagesChartTitle')}: ${stats.topPackages.map((p) => `${p.packageName} ${p.count}`).join(', ')}`"
                                    />
                                    <p v-if="!hasTopPackages" class="dashboard__chart-overlay-empty text-muted">
                                        {{ t('dashboard.chartEmpty') }}
                                    </p>
                                </div>
                            </ClientOnly>
                        </template>
                    </Card>
                </div>
            </div>
        </template>
        <p v-else-if="loading" class="text-muted">
            {{ t('common.empty.loading') }}
        </p>
    </div>
</template>

<style lang="scss" scoped>
.dashboard {
    &__stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: $space-4;
        margin-top: $space-5;
    }

    &__stat-value {
        font-size: 1.75rem;
        font-weight: 700;

        &--sm {
            font-size: 1.125rem;
        }
    }

    &__stat-label {
        font-size: $font-size-sm;
        margin-top: $space-1;
    }

    &__severity {
        margin-top: $space-6;
    }

    &__severity-row {
        display: flex;
        gap: $space-4;
        margin-top: $space-3;
    }

    &__severity-item {
        display: flex;
        align-items: center;
        gap: $space-2;
    }

    &__severity-count {
        font-size: $font-size-lg;
        font-weight: 600;
    }

    &__charts {
        margin-top: $space-6;
    }

    &__charts-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-4;
        margin-top: $space-3;
        align-items: stretch;
    }

    @media (max-width: 768px) {
        &__charts-grid {
            // 768px 以下：severity + fixRate 单列，Top-10 单独一行
            grid-template-columns: 1fr;
        }
    }

    &__chart-card {
        height: 100%;

        &--wide {
            grid-column: 1 / -1;
        }
    }

    &__chart-title {
        margin: 0 0 $space-3;
        font-size: $font-size-base;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: $space-3;
    }

    &__chart-hint {
        font-size: $font-size-sm;
        font-weight: 400;
    }

    &__chart-canvas {
        position: relative;
        height: 280px;

        &--bar {
            height: 360px;
        }

        &--with-center {
            position: relative;
        }
    }

    &__chart-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        margin: 0;
    }

    &__chart-overlay-empty {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        pointer-events: none;
        font-size: $font-size-sm;
    }

    &__chart-center {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }

    &__chart-center-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: $color-text;

        &--muted {
            color: $color-text-muted;
        }
    }
}

@include dark-mode {
    .dashboard__chart-center-value {
        color: $color-text-dark;

        &--muted {
            color: $color-text-muted;
        }
    }
}
</style>
