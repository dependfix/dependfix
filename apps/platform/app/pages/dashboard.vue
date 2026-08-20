<script setup lang="ts">
// 仪表板：仓库数/告警数（按严重级别）/已修复数/最近扫描
// 图表配置抽取为 useDashboardStats composable（apps/platform/app/composables/use-dashboard-stats.ts），
// 供 alerts.vue 复用，消除代码重复（Nuxt auto-import）

const { session } = useSession()
const { t } = useI18n()

definePageMeta({
    middleware: 'auth',
})

const {
    stats,
    loading,
    error,
    fetchStats,
    severityChartData,
    severityChartOptions,
    hasSeverityData,
    fixRateChartData,
    fixRateChartOptions,
    fixRatePercent,
    fixRateIsEmpty,
    topPackagesChartData,
    topPackagesChartOptions,
    hasTopPackages,
} = useDashboardStats()

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
