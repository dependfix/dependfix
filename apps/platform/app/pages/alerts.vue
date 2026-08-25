<script setup lang="ts">
// 告警视图：按仓库/严重级别/来源/视图模式筛选
// 顶部不渲染 dashboard 同款图表（todo.md §C65-D4：与 dashboard.vue 完全去重），
// 用户需要全局统计去 dashboard；alerts 聚焦表格 + 详情
import { withFixStatusRank, withSeverityRank } from '~/utils/sort-helpers'
import type { DataTableSortMeta } from 'primevue/datatable'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

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
    // dedupe=true 聚合字段（todo.md §T1306）：occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds
    // dedupe=false 时不存在（undefined）
    occurrenceCount?: number
    firstSeenAt?: string
    lastSeenAt?: string
    affectedRunIds?: string[]
}

const loading = ref(true)
const error = ref('')
const alerts = ref<AlertView[]>([])
const repositories = ref<{ id: string, name: string }[]>([])

const filters = ref({
    repositoryId: 'all',
    severity: 'all',
    source: 'all',
    dedupe: 'off',
})

/** dedupe 模式（todo.md §T1306）：
 * - off：返回全量 ScanResult（默认，向后兼容）
 * - across：跨次扫描去重，按 fingerprint (repositoryId + packageName + ruleId) 聚合
 */
type DedupeMode = 'off' | 'across'
const dedupeMode = ref<DedupeMode>('off')
const dedupeOptions = computed(() => [
    { label: t('alerts.dedupeOff'), value: 'off' as const },
    { label: t('alerts.dedupeAcross'), value: 'across' as const },
])

/**
 * 视图模式（todo.md §C65-D3）：按包 / 按项目 / 原始列表三选一。
 * - 'package'：rowGroupMode='subheader'，按 packageName 分组（默认）
 * - 'repository'：rowGroupMode='subheader'，按 repository 分组
 * - 'none'：原始列表，无分组
 * 切换视图会重置 expandedPackages / multiSortMeta 以避免 group 状态污染。
 */
type ViewMode = 'package' | 'repository' | 'none'
const viewMode = ref<ViewMode>('package')
const viewModeOptions = computed(() => [
    { label: t('alerts.viewModePackage'), value: 'package' as const },
    { label: t('alerts.viewModeRepository'), value: 'repository' as const },
    { label: t('alerts.viewModeNone'), value: 'none' as const },
])

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
    { label: t('alerts.sourceCodeQuality'), value: 'code-quality' },
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

// dedupe 详情侧栏 RunDetailView status → Tag severity 映射
const fixStatusSeverity = (status: string) => {
    switch (status) {
        case 'completed':
            return 'success'
        case 'failed':
            return 'danger'
        case 'dispatched':
            return 'info'
        default:
            return 'warn'
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
        // viewMode='none' 不传 groupBy（后端等价于原始顺序）；
        // 'package'/'repository' 携带 groupBy 让后端预排序以满足 PrimeVue rowGroup subheader 要求。
        const query: Record<string, string> = viewMode.value === 'none' ? {} : { groupBy: viewMode.value }
        if (filters.value.repositoryId !== 'all') {
            query.repositoryId = filters.value.repositoryId
        }
        if (filters.value.severity !== 'all') {
            query.severity = filters.value.severity
        }
        if (filters.value.source !== 'all') {
            query.source = filters.value.source
        }
        // dedupe=across 时携带 dedupe=true 触发后端跨次扫描去重聚合（todo.md §T1306）
        if (filters.value.dedupe === 'across') {
            query.dedupe = 'true'
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

/**
 * 切换视图模式：重置 multiSortMeta + expandedPackages 避免 group 状态污染 + 触发 fetchAlerts。
 * multiSortMeta 必须用 v-model 形式（不能用 sortField/sortOrder，参见 PrimeVue 4 rowGroup 数据流必现 TypeError）。
 */
const onViewModeChange = () => {
    multiSortMeta.value = viewMode.value === 'none'
        ? [{ field: '_severityRank', order: -1 }]
        : [{ field: viewMode.value === 'package' ? 'packageName' : 'repository', order: 1 }]
    expandedPackages.value = []
    void fetchAlerts()
}

/** dedupe 切换：触发 fetchAlerts 重新查询（无需重置排序状态） */
const onDedupeChange = () => {
    void fetchAlerts()
}

// dedupe=true 时详情侧栏（PrimeVue Sidebar 右侧滑出，显示该告警 affected runIds 详情）
interface RunDetailView {
    id: string
    repositoryId: string
    mode: string
    severityThreshold: string
    status: string
    startedAt: string | null
    finishedAt: string | null
    runUrl: string | null
}
const sidebarVisible = ref(false)
const sidebarAlert = ref<AlertView | null>(null)
const sidebarRuns = ref<RunDetailView[]>([])
const sidebarLoading = ref(false)

const openRunSidebar = async (alert: AlertView) => {
    sidebarAlert.value = alert
    sidebarVisible.value = true
    sidebarLoading.value = true
    try {
        // 按 affectedRunIds 批量拉取 run 详情（todo.md §T1306：详情侧栏查询 /api/runs）
        if (alert.affectedRunIds && alert.affectedRunIds.length > 0) {
            const res = await $fetch('/api/runs', {
                query: { ids: alert.affectedRunIds.join(',') },
            })
            sidebarRuns.value = res as RunDetailView[]
        } else {
            sidebarRuns.value = []
        }
    } catch {
        sidebarRuns.value = []
    } finally {
        sidebarLoading.value = false
    }
}

const closeSidebar = () => {
    sidebarVisible.value = false
    sidebarAlert.value = null
    sidebarRuns.value = []
}

// rowGroup 模式：按 viewMode 聚合计数（subheader 显示该组告警数）
// viewMode='none' 时不渲染 subheader，该 computed 仅用于 package/repository 模式。
const groupKeyOf = (a: AlertView): string => {
    if (viewMode.value === 'repository') {
        return a.repository ?? t('alerts.repositoryUnknown')
    }
    return a.packageName
}
const groupCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const a of alerts.value) {
        const key = groupKeyOf(a)
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
})
// groupHeader 显示的标签：package 模式显示 packageName，repository 模式显示 repository 字段
const groupHeaderLabel = (data: Record<string, unknown>): string => {
    if (viewMode.value === 'repository') {
        return (data.repository as string | null) ?? t('alerts.repositoryUnknown')
    }
    return data.packageName as string
}

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

// DataTable 动态属性：rowGroupMode / groupRowsBy / expandableRowGroups 按 viewMode 切换
const dataTableAttrs = computed(() => {
    if (viewMode.value === 'none') {
        return {
            rowGroupMode: undefined,
            groupRowsBy: undefined,
            expandableRowGroups: false,
        }
    }
    return {
        rowGroupMode: 'subheader' as const,
        groupRowsBy: viewMode.value === 'package' ? 'packageName' : 'repository',
        expandableRowGroups: true,
    }
})

onMounted(async () => {
    await fetchRepositories()
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

        <!-- 顶部图表区块已删除（todo.md §C65-D4）：与 dashboard.vue 完全重复，全量聚合与 alerts 过滤无关，
             用户需要全局统计去 dashboard；alerts 聚焦表格 + 详情 -->

        <Card class="alerts__filters">
            <template #content>
                <div class="alerts__filter-row">
                    <div class="alerts__filter-field">
                        <label for="view-mode">{{ t('alerts.viewMode') }}</label>
                        <Select
                            id="view-mode"
                            v-model="viewMode"
                            :options="viewModeOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                            @change="onViewModeChange"
                        />
                    </div>
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
                        <label for="dedupe">{{ t('alerts.dedupe') }}</label>
                        <Select
                            id="dedupe"
                            v-model="filters.dedupe"
                            :options="dedupeOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                            @change="onDedupeChange"
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
                    :row-group-mode="dataTableAttrs.rowGroupMode"
                    :group-rows-by="dataTableAttrs.groupRowsBy"
                    :expandable-row-groups="dataTableAttrs.expandableRowGroups"
                    :empty-message="t('alerts.empty')"
                >
                    <template v-if="viewMode !== 'none'" #groupheader="{data}">
                        <span
                            class="alerts__group-header"
                            role="button"
                            tabindex="0"
                            :aria-expanded="isPackageExpanded(groupHeaderLabel(data))"
                            @click="togglePackage(groupHeaderLabel(data))"
                            @keydown.enter.prevent="togglePackage(groupHeaderLabel(data))"
                            @keydown.space.prevent="togglePackage(groupHeaderLabel(data))"
                        >
                            <strong>{{ groupHeaderLabel(data) }}</strong>
                            <span class="alerts__group-count text-muted">
                                {{ t('alerts.groupHeaderCount', {count: groupCounts.get(groupHeaderLabel(data)) ?? 0}) }}
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
                    <!-- dedupe=true 时显示聚合列（todo.md §T1306） -->
                    <Column
                        v-if="filters.dedupe === 'across'"
                        field="occurrenceCount"
                        :header="t('alerts.colOccurrenceCount')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="String(data.occurrenceCount ?? 1)" severity="warn" />
                        </template>
                    </Column>
                    <Column
                        v-if="filters.dedupe === 'across'"
                        field="lastSeenAt"
                        :header="t('alerts.colLastSeenAt')"
                        sortable
                    >
                        <template #body="{data}">
                            <span v-if="data.lastSeenAt" class="text-muted">
                                {{ d(new Date(data.lastSeenAt), 'long') }}
                            </span>
                            <span v-else class="text-muted">—</span>
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
                    <Column
                        v-if="filters.dedupe === 'across'"
                        :header="t('common.actions.details')"
                        :style="{width: '100px'}"
                    >
                        <template #body="{data}">
                            <Button
                                icon="pi pi-list"
                                text
                                rounded
                                size="small"
                                :disabled="!data.affectedRunIds || data.affectedRunIds.length === 0"
                                :aria-label="t('common.actions.details')"
                                @click="openRunSidebar(data)"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <!-- dedupe=true 详情侧栏（PrimeVue Sidebar 右侧滑出）：显示该告警 affected runs 列表 -->
        <Sidebar
            v-model:visible="sidebarVisible"
            position="right"
            :style="{width: '560px'}"
            @hide="closeSidebar"
        >
            <template v-if="sidebarAlert" #header>
                <div class="alerts__sidebar-header">
                    <strong>{{ sidebarAlert.packageName }}</strong>
                    <span v-if="sidebarAlert.ruleId" class="text-muted">
                        · {{ sidebarAlert.ruleId }}
                    </span>
                </div>
            </template>
            <div v-if="sidebarAlert" class="alerts__sidebar">
                <p class="alerts__sidebar-meta text-muted">
                    {{ t('alerts.detailRunsTitle', {
                        max: sidebarAlert.affectedRunIds?.length ?? 0,
                        total: sidebarAlert.occurrenceCount ?? 1
                    }) }}
                </p>
                <div v-if="sidebarLoading" class="text-muted">
                    {{ t('common.empty.loading') }}
                </div>
                <DataTable
                    v-else-if="sidebarRuns.length > 0"
                    :value="sidebarRuns"
                    striped-rows
                    size="small"
                >
                    <Column :header="t('alerts.detailRunStatus')" field="status">
                        <template #body="{data}">
                            <Tag :value="data.status" :severity="fixStatusSeverity(data.status)" />
                        </template>
                    </Column>
                    <Column :header="t('alerts.detailRunStartedAt')" field="startedAt">
                        <template #body="{data}">
                            {{ data.startedAt ? d(new Date(data.startedAt), 'long') : '—' }}
                        </template>
                    </Column>
                    <Column :header="t('common.actions.actions')" :style="{width: '100px'}">
                        <template #body="{data}">
                            <a
                                v-if="data.runUrl"
                                :href="data.runUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {{ t('alerts.detailRunOpen') }}
                            </a>
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                </DataTable>
                <p v-else class="text-muted">
                    {{ t('alerts.detailRunEmpty') }}
                </p>
            </div>
        </Sidebar>
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

    // dedupe 详情侧栏样式
    &__sidebar-header {
        display: flex;
        align-items: baseline;
        gap: $space-2;
    }

    &__sidebar {
        padding: $space-4;
        display: flex;
        flex-direction: column;
        gap: $space-3;
    }

    &__sidebar-meta {
        margin: 0;
        font-size: $font-size-sm;
    }
}
</style>
