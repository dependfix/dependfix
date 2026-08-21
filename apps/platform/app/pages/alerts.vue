<script setup lang="ts">
// 告警视图：按仓库/严重级别/来源筛选
// 顶部加图表区块（severity 饼图 + fixRate 环形 + Top-10 包柱状图），
// 复用 dashboard.vue 的图表配置（通过 useDashboardStats composable 共享，Nuxt auto-import）
import { withFixStatusRank, withSeverityRank } from '~/utils/sort-helpers'
import type { DataTableSortMeta } from 'primevue/datatable'

definePageMeta({
    middleware: 'auth',
})

const { t } = useI18n()

interface AlertView {
    id: string
    runId: string
    repository: string | null
    source: string
    severity: string
    packageName: string
    manifestPath: string | null
    ruleId: string | null
    summary: string | null
    fixable: boolean
    fixStrategy: string | null
    recommendedVersion: string | null
    htmlUrl: string | null
    fixStatus: string
    errorMessage: string | null
}

const loading = ref(true)
const error = ref('')
const alerts = ref<AlertView[]>([])
const repositories = ref<{ id: string, name: string }[]>([])

const filters = ref({
    repositoryId: 'all',
    severity: 'all',
    source: 'all',
})

const severityOptions = computed(() => [
    { label: t('alerts.severityAll'), value: 'all' },
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
    { label: 'Unknown', value: 'unknown' },
])

const sourceOptions = computed(() => [
    { label: t('alerts.sourceAll'), value: 'all' },
    { label: 'Dependabot', value: 'dependabot' },
    { label: 'Code Scanning', value: 'code-scanning' },
    { label: 'pnpm audit', value: 'pnpm-audit' },
])

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

const fixStatusLabel = (status: string) => ({
    success: t('common.fixStatus.success'),
    failed: t('common.fixStatus.failed'),
    skipped: t('common.fixStatus.skipped'),
    converged: t('common.fixStatus.converged'),
})[status] ?? t('common.fixStatus.pending')

const fetchRepositories = async () => {
    try {
        const res = await $fetch('/api/repos')
        repositories.value = [
            { id: 'all', name: t('alerts.allRepositories') },
            ...(res as Array<{ id: string, owner: string, name: string }>).map((r) => ({
                id: r.id,
                name: `${r.owner}/${r.name}`,
            })),
        ]
    } catch {
        repositories.value = [{ id: 'all', name: t('alerts.allRepositories') }]
    }
}

const fetchAlerts = async () => {
    loading.value = true
    error.value = ''
    try {
        const query: Record<string, string> = { groupBy: 'package' }
        if (filters.value.repositoryId !== 'all') {
            query.repositoryId = filters.value.repositoryId
        }
        if (filters.value.severity !== 'all') {
            query.severity = filters.value.severity
        }
        if (filters.value.source !== 'all') {
            query.source = filters.value.source
        }
        const res = await $fetch('/api/alerts', { query })
        // 排序键派生：severity / fixStatus 走业务语义排序（非字典序）
        const list = res as AlertView[]
        alerts.value = withFixStatusRank(withSeverityRank(list))
    } catch (e: unknown) {
        const err = e as { data?: { message?: string }, message?: string }
        error.value = t('alerts.errors.loadFailed', {
            message: err.data?.message ?? err.message ?? t('common.errors.unknown'),
        })
    } finally {
        loading.value = false
    }
}

// 复用 dashboard.vue 的图表数据 composable（Nuxt auto-import）
const {
    stats,
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

// rowGroup 模式：按 packageName 聚合计数（subheader 显示该包告警数）
const packageCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const a of alerts.value) {
        counts.set(a.packageName, (counts.get(a.packageName) ?? 0) + 1)
    }
    return counts
})

// rowGroup 多列排序持久 + expandableRowGroups 折叠状态
// - 排序模式 multiple：用户点其他列时 PrimeVue 自动把 packageName 保留为第一排序键
// - 默认排序必须用 multiSortMeta（v-model），不能用 sortField/sortOrder——后者只在 sortMode='single' 生效，
//   多列模式下 d_multiSortMeta 不会被自动填充，会保持空数组；但 d_sortField 被赋值后 `sorted` 仍为 true，
//   触发 sortMultiple → multisortField(data, data, 0) → d_multiSortMeta[0].field → TypeError
// - 折叠状态以 packageName 数组跟踪：PrimeVue v-model:expanded-row-groups 内部用 .indexOf() 判断 group 是否展开，
//   传 Record<string, boolean> 会触发 TypeError: this.expandedRowGroups.indexOf is not a function（RowGroup 数据流必现）
//   PrimeVue 4 在 expandable-row-groups 模式下会在 #groupheader slot 之前自动渲染 rowToggleButton
//   （含 ChevronDown/RightIcon），slot 内不应再叠加自定义 chevron，否则双 chevron 视觉缺陷
//   （node_modules/primevue/datatable/index.mjs:1776-1800 rowToggleButton 渲染分支）
const multiSortMeta = ref<DataTableSortMeta[]>([{ field: 'packageName', order: 1 }])
const expandedPackages = ref<string[]>([])
// 自定义 span 整体可点击 + 键盘 enter/space 触发（todo.md §C65-D2 验收）。
// PrimeVue 4 rowToggleButton 在 groupheader 之前渲染（已验证 datatable/index.mjs:1776-1800），
// 自定义 toggle 与 PrimeVue 内部 toggle 走不同路径但修改同一 ref，不会重复 toggle。
const isPackageExpanded = (packageName: string) => expandedPackages.value.includes(packageName)
const togglePackage = (packageName: string) => {
    expandedPackages.value = isPackageExpanded(packageName)
        ? expandedPackages.value.filter((p) => p !== packageName)
        : [...expandedPackages.value, packageName]
}

onMounted(async () => {
    await Promise.all([fetchRepositories(), fetchStats()])
    await fetchAlerts()
})
</script>

<template>
    <div class="alerts">
        <div class="alerts__header">
            <div>
                <h2>{{ t('alerts.title') }}</h2>
                <p class="text-muted">
                    {{ t('alerts.subtitle') }}
                </p>
            </div>
        </div>

        <!-- 图表统计区块（severity 饼图 + fixRate 环形 + Top-10 包柱状图）—— 复用 dashboard.vue 图表配置 -->
        <div class="alerts__charts">
            <h3>{{ t('dashboard.chartTitle') }}</h3>
            <div class="alerts__charts-grid">
                <Card class="alerts__chart-card">
                    <template #content>
                        <h4 class="alerts__chart-title">
                            {{ t('dashboard.severityChartTitle') }}
                        </h4>
                        <ClientOnly>
                            <div class="alerts__chart-canvas">
                                <ChartCanvas
                                    type="doughnut"
                                    :data="severityChartData"
                                    :options="severityChartOptions"
                                    :aria-label="`${t('dashboard.severityChartTitle')}: ${Object.entries(stats?.severityCounts ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}`"
                                />
                                <p v-if="!hasSeverityData" class="alerts__chart-overlay-empty text-muted">
                                    {{ t('dashboard.chartEmpty') }}
                                </p>
                            </div>
                        </ClientOnly>
                    </template>
                </Card>
                <Card class="alerts__chart-card">
                    <template #content>
                        <h4 class="alerts__chart-title">
                            {{ t('dashboard.fixRateChartTitle') }}
                        </h4>
                        <ClientOnly>
                            <div class="alerts__chart-canvas alerts__chart-canvas--with-center">
                                <ChartCanvas
                                    type="doughnut"
                                    :data="fixRateChartData"
                                    :options="fixRateChartOptions"
                                    :aria-label="`${t('dashboard.fixRateChartTitle')}: ${t('dashboard.fixRateValue', {percent: fixRatePercent})}`"
                                />
                                <div class="alerts__chart-center">
                                    <span v-if="fixRateIsEmpty" class="alerts__chart-center-value alerts__chart-center-value--muted">—</span>
                                    <span v-else class="alerts__chart-center-value">{{ t('dashboard.fixRateValue', {percent: fixRatePercent}) }}</span>
                                </div>
                                <p v-if="fixRateIsEmpty" class="alerts__chart-overlay-empty text-muted">
                                    {{ t('dashboard.chartEmpty') }}
                                </p>
                            </div>
                        </ClientOnly>
                    </template>
                </Card>
                <Card class="alerts__chart-card alerts__chart-card--wide">
                    <template #content>
                        <h4 class="alerts__chart-title">
                            {{ t('dashboard.topPackagesChartTitle') }}
                            <span class="alerts__chart-hint text-muted">{{ t('dashboard.packageTruncated') }}</span>
                        </h4>
                        <ClientOnly>
                            <div class="alerts__chart-canvas alerts__chart-canvas--bar">
                                <ChartCanvas
                                    type="bar"
                                    :data="topPackagesChartData"
                                    :options="topPackagesChartOptions"
                                    :aria-label="`${t('dashboard.topPackagesChartTitle')}: ${(stats?.topPackages ?? []).map((p) => `${p.packageName} ${p.count}`).join(', ')}`"
                                />
                                <p v-if="!hasTopPackages" class="alerts__chart-overlay-empty text-muted">
                                    {{ t('dashboard.chartEmpty') }}
                                </p>
                            </div>
                        </ClientOnly>
                    </template>
                </Card>
            </div>
        </div>

        <Card class="alerts__filters">
            <template #content>
                <div class="alerts__filter-row">
                    <div class="alerts__filter-field">
                        <label for="repo">{{ t('alerts.filterRepository') }}</label>
                        <Select
                            id="repo"
                            v-model="filters.repositoryId"
                            :options="repositories"
                            option-label="name"
                            option-value="id"
                            :placeholder="t('alerts.allRepositories')"
                            fluid
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <label for="severity">{{ t('alerts.filterSeverity') }}</label>
                        <Select
                            id="severity"
                            v-model="filters.severity"
                            :options="severityOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <label for="source">{{ t('alerts.filterSource') }}</label>
                        <Select
                            id="source"
                            v-model="filters.source"
                            :options="sourceOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <Button
                            :label="t('alerts.filterApply')"
                            icon="pi pi-filter"
                            @click="fetchAlerts"
                        />
                    </div>
                </div>
            </template>
        </Card>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>

        <Card v-if="!loading" class="alerts__table">
            <template #content>
                <DataTable
                    v-model:expanded-row-groups="expandedPackages"
                    v-model:multi-sort-meta="multiSortMeta"
                    :value="alerts"
                    striped-rows
                    size="small"
                    removable-sort
                    sort-mode="multiple"
                    row-group-mode="subheader"
                    group-rows-by="packageName"
                    expandable-row-groups
                    :empty-message="t('alerts.empty')"
                >
                    <template #groupheader="{data}">
                        <span
                            class="alerts__group-header"
                            role="button"
                            tabindex="0"
                            :aria-expanded="isPackageExpanded(data.packageName)"
                            @click="togglePackage(data.packageName)"
                            @keydown.enter.prevent="togglePackage(data.packageName)"
                            @keydown.space.prevent="togglePackage(data.packageName)"
                        >
                            <strong>{{ data.packageName }}</strong>
                            <span class="alerts__group-count text-muted">
                                {{ t('alerts.groupHeaderCount', {count: packageCounts.get(data.packageName) ?? 0}) }}
                            </span>
                        </span>
                    </template>
                    <Column
                        field="repository"
                        :header="t('alerts.colRepository')"
                        sortable
                    />
                    <Column
                        field="_severityRank"
                        :header="t('alerts.colSeverity')"
                        sortable
                        :default-sort-order="-1"
                    >
                        <template #body="{data}">
                            <Tag :value="data.severity" :severity="severityTagSeverity(data.severity)" />
                        </template>
                    </Column>
                    <Column
                        field="packageName"
                        :header="t('alerts.colPackage')"
                        sortable
                    />
                    <Column
                        field="source"
                        :header="t('alerts.colSource')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="data.source" severity="secondary" />
                        </template>
                    </Column>
                    <Column :header="t('alerts.colFixable')">
                        <template #body="{data}">
                            <Tag
                                :value="data.fixable ? t('common.yes') : t('common.no')"
                                :severity="data.fixable ? 'success' : 'secondary'"
                            />
                        </template>
                    </Column>
                    <Column
                        field="recommendedVersion"
                        :header="t('alerts.colRecommended')"
                        sortable
                    />
                    <Column
                        field="_fixStatusRank"
                        :header="t('alerts.colStatus')"
                        sortable
                        :default-sort-order="-1"
                    >
                        <template #body="{data}">
                            <Tag :value="fixStatusLabel(data.fixStatus)" severity="secondary" />
                        </template>
                    </Column>
                    <Column :header="t('alerts.colLink')">
                        <template #body="{data}">
                            <a
                                v-if="data.htmlUrl"
                                :href="data.htmlUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {{ t('alerts.view') }}
                            </a>
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>
    </div>
</template>

<style lang="scss" scoped>
.alerts {
    &__header {
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }

    // 图表区块样式（与 dashboard.vue charts-grid 一致，含 768px 响应式断点）
    &__charts {
        margin-bottom: $space-6;
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

    &__filters {
        margin-bottom: $space-4;
    }

    &__filter-row {
        display: flex;
        align-items: flex-end;
        gap: $space-4;
        flex-wrap: wrap;
    }

    &__filter-field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        min-width: 160px;
    }

    &__filter-field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }

    // rowGroup 模式：subheader 显示包名 + 该包告警数
    &__group-header {
        display: inline-flex;
        align-items: baseline;
        gap: $space-2;
        cursor: pointer;
        user-select: none;

        &:focus-visible {
            outline: 2px solid $color-primary;
            outline-offset: 2px;
        }
    }

    &__group-count {
        font-size: $font-size-sm;
        font-weight: 400;
    }
}

@include dark-mode {
    .alerts__chart-center-value {
        color: $color-text-dark;

        &--muted {
            color: $color-text-muted;
        }
    }
}
</style>
