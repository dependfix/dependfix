<script setup lang="ts">
// 告警视图：按仓库/严重级别/来源/视图模式筛选
// 顶部不渲染 dashboard 同款图表（todo.md §C65-D4：与 dashboard.vue 完全去重），
// 用户需要全局统计去 dashboard；alerts 聚焦表格 + 详情
//
// 详情侧栏已抽出为 components/alert-run-sidebar.vue（todo.md §M16.2 audit 触发的 max-lines 抽取）
// 一键修复状态机抽出为 composables/use-fix-now.ts
import { withFixStatusRank, withSeverityRank } from '~/utils/sort-helpers'
import {
    alertsRuleIdTagSeverity,
    alertsSeverityTagSeverity,
    alertsStatusLabel,
    buildAlertsQuery,
    type AlertsFilters,
    type AlertsViewMode,
} from '~/utils/alerts-view'
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
    // per-alert 模型下 ScanResult 字段直接绑定（不再 v-if 控制，见 todo.md §M20.3 + §M20.6）：
    // occurrenceCount 累加跨次扫描出现次数（业务语义："曾出现 N 次"）
    // firstSeenAt / lastSeenAt 分离首次发现 vs 最近见到时间
    // supersededAt 上游已关闭时由 reconcile 函数写入（决策 1：fixStatus=success 永不被 supersede）
    occurrenceCount?: number
    firstSeenAt?: string
    lastSeenAt?: string
    supersededAt?: string | null
    // 漏洞唯一标识（依赖类告警）：
    // - ghsaId：GitHub Security Advisory ID（如 GHSA-p6mc-m468-83gw），dependabot / pnpm-audit 源非 null
    // - cveIds：CVE 列表（如 ['CVE-2021-23337']），code-scanning / code-quality 源为空数组
    // 数据来源：fetcher 透传到 ScanResult.ghsaId / ScanResult.cveIds（JSON 序列化），reconcile 写入 DB；
    // 前端 Identifiers 列渲染依赖此二字段（详情见 todo.md §M23.3）。
    ghsaId?: string | null
    cveIds?: string[]
}

/**
 * SSR-aware 数据获取（todo.md §M16.4 PrimeVue hydration 缓解）：
 *
 * 历史：alerts 加载走 onMounted(fetchRepositories + fetchAlerts)，SSR 阶段 alerts.value 初值为
 * []，hydration 后从 [] 突变到 mock 数据，PrimeVue 4 DataTable 不重新计算 processedData，
 * rowGroup subheader 永不渲染（docs/plan/backlog.md §主线 #1 PrimeVue 4 + Nuxt hydration
 * rowGroup known-issue）。page.reload() 后能渲染佐证非业务逻辑问题。
 *
 * 修复路径：迁移到 useAsyncData，SSR 阶段 handler 就执行 fetch 并塞进 payload，hydration 时
 * data.value 已有完整数据 → PrimeVue DataTable processedData 在 hydration 阶段就有数据 →
 * rowGroup subheader 渲染。viewMode / filters 变化通过 watch: [...] 自动 refetch。
 *
 * useRequestFetch：SSR 阶段自动转发 cookie（Nuxt 4 官方 SSR 转发方案），否则 alerts 页有
 * auth middleware 鉴权，SSR 拿不到 session 会 401。
 */

const filters = reactive<AlertsFilters>({
    repositoryId: 'all',
    severity: 'all',
    source: 'all',
    /**
     * includeSuperseded 开关（todo.md §M20.6）：
     * - false（默认）：后端 result.supersededAt IS NULL 过滤，仅显示活跃告警
     * - true：返回全量（含已 superseded 上游已消失的告警）
     *
     * 替代旧 todo.md §M13.2 §T1306 的 dedupe 跨次去重 UI（per-alert 模型下 ScanResult 已天然 deduped，
     * occurrenceCount 字段直接来自 ScanResult，无需应用层 fingerprint 聚合）。
     *
     * 使用 reactive 而非 ref：useAsyncData watch 默认浅监听 ref 引用变化；
     * reactive 配合 getter source + deep watch 触发 includeSuperseded 字段变更 refetch。
     */
    includeSuperseded: false,
})

/**
 * 视图模式（todo.md §C65-D3）：按包 / 按项目 / 原始列表三选一。
 * - 'package'：rowGroupMode='subheader'，按 packageName 分组（默认）
 * - 'repository'：rowGroupMode='subheader'，按 repository 分组
 * - 'none'：原始列表，无分组
 * 切换视图会重置 expandedPackages / multiSortMeta 以避免 group 状态污染。
 */
const viewMode = ref<AlertsViewMode>('package')
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

const statusLabel = (alert: AlertView) => alertsStatusLabel(alert, t)

// useRequestFetch：SSR 阶段自动转发 cookie（Nuxt 4 官方 SSR 转发方案），
// 否则 alerts 页有 auth middleware 鉴权，SSR 拿不到 session 会 401
const requestFetch = useRequestFetch()

/** /api/repos 用于仓库 Select 选项；SSR 阶段就拉取，无 hydration 闪烁 */
const { data: reposData } = await useAsyncData<Array<{ id: string, owner: string, name: string }>>(
    'alerts-repositories',
    // 显式 generic 标注规避 TS 5.x 对 $fetch overload 路径推断的栈深度限制（Nuxt 4 已知问题）
    () => requestFetch<Array<{ id: string, owner: string, name: string }>>('/api/repos'),
    { default: () => [] },
)

/**
 * /api/alerts 列表（todo.md §M16.4 SSR-aware data fetching）
 *
 * watch: [viewMode, filters] 自动 refetch：viewMode 切换 / filters 任意字段变更都触发
 * useAsyncData 重跑 handler，避免 onViewModeChange / filterApply Button
 * 两处手动调用 fetchAlerts 的散落模式。
 *
 * handler 内用 buildAlertsQuery utility 派生 query（viewMode + filters → Record<string, string>），
 * 与 utils/alerts-view.test.ts 单测共用，避免 viewMode 无效值 / includeSuperseded 漏加等
 * silent fallback 类 bug。
 */
const {
    data: alertsData,
    error: alertsError,
    refresh: refreshAlerts,
    pending: alertsPending,
} = await useAsyncData<AlertView[]>(
    'alerts-list',
    () => requestFetch<AlertView[]>('/api/alerts', {
        query: buildAlertsQuery(viewMode.value, filters),
    }),
    {
        // 单独监听 viewMode（ref 引用变化）；filters reactive 字段变化通过下方显式 watch 触发 refetch
        // （Vue 3 + Nuxt useAsyncData watch 默认浅监听，对 nested field 修改不触发；M20.6 新增
        // includeSuperseded 开关 toggle 后必须显式 deep watch —— 测试已实证默认 watch 不触发）
        watch: [viewMode],
        default: () => [],
    },
)

// 显式监听 filters reactive 字段变化触发 refetch（深 watch；M20.6 引入 includeSuperseded 开关后必须）
// 注：依赖 Nuxt 4.x useAsyncData 默认 `dedupe: 'cancel'` 抑制双触发（useAsyncData 内置 watch + 此显式 watch
// 都可能触发 refresh，但 abortController 会取消旧 execute）；改 dedupe 策略前需重新评估
watch(filters, () => {
    void refreshAlerts()
}, { deep: true })

/** repositories 派生：注入 allRepositories 选项 + 防御性空值 fallback */
const repositories = computed<{ id: string, name: string }[]>(() => [
    { id: 'all', name: t('alerts.allRepositories') },
    ...((reposData.value ?? []).map((r) => ({ id: r.id, name: `${r.owner}/${r.name}` }))),
])

/** alerts 派生：排序键派生（severity / fixStatus 走业务语义排序，非字典序） */
const alerts = computed<AlertView[]>(() => withFixStatusRank(withSeverityRank(alertsData.value ?? [])))

/** loading / error 派生自 useAsyncData 状态（保持现有模板契约） */
const loading = computed(() => alertsPending.value)
const error = computed(() => {
    if (!alertsError.value) {
        return ''
    }
    // useAsyncData error 形状：{ statusCode, statusMessage, data, message }（来自 h3 createError 序列化）
    const err = alertsError.value as { data?: { message?: string }, message?: string }
    return t('alerts.errors.loadFailed', {
        message: err.data?.message ?? err.message ?? t('common.errors.unknown'),
    })
})

/**
 * 切换视图模式：仅重置 multiSortMeta + expandedPackages 避免 group 状态污染。
 * multiSortMeta 必须用 v-model 形式（不能用 sortField/sortOrder，参见 PrimeVue 4 rowGroup 数据流必现 TypeError）。
 * 数据 refetch 由 useAsyncData 的 watch: [viewMode] 自动触发，无需手动调用。
 */
const onViewModeChange = () => {
    multiSortMeta.value = viewMode.value === 'none'
        ? [{ field: '_severityRank', order: -1 }]
        : [{ field: viewMode.value === 'package' ? 'packageName' : 'repository', order: 1 }]
    expandedPackages.value = []
}

// per-alert 模型下每行 1 个 runId（todo.md §M20.3）；详情侧栏（PrimeVue Sidebar 右侧滑出，
// 显示该告警关联 run 列表 + 立即修复此仓库按钮）
interface RunDetailView {
    id: string
    repositoryId: string
    mode: string
    severityThreshold: string
    executorKind: string
    status: string
    startedAt: string | null
    finishedAt: string | null
    runUrl: string | null
    summary: Record<string, unknown> | null
    error: { code: string, message: string } | null
}
const sidebarVisible = ref(false)
const sidebarAlert = ref<AlertView | null>(null)
const sidebarRuns = ref<RunDetailView[]>([])
const sidebarLoading = ref(false)
const runDetailVisible = ref(false)
const selectedRunId = ref<string | null>(null)

/**
 * 一键修复（todo.md §M16.2 C66-D）：
 * - 复用既有 run_id：服务端 skip createPendingScanRun，直接以复用 run 进入 fix 流程
 * - 状态机（fixingRunId / fixError / fixSuccess）抽出到 composables/use-fix-now.ts
 *   （参考 todo.md §M15.1 utility 抽取的反向时机 —— audit warning 触发的单向提前抽取）
 * - 成功后 toast 提示并跳转到扫描历史（/scans?repository=）查看 fix 进度
 */
const { fixingRunId, fixError, fixSuccess, triggerFix } = useFixNow()

const openRunSidebar = async (alert: AlertView) => {
    sidebarAlert.value = alert
    sidebarVisible.value = true
    sidebarLoading.value = true
    runDetailVisible.value = false
    selectedRunId.value = null
    try {
        // per-alert 模型下每行 1 个 runId（todo.md §M20.3）；直接拉取该 run 详情显示 sidebar
        // （旧 todo.md §M13.2 §T1306 实现从 affectedRunIds 拉取多个 runs 已无意义）
        if (alert.runId) {
            const res = await $fetch<RunDetailView>(`/api/runs/${alert.runId}`)
            sidebarRuns.value = [res]
        } else {
            sidebarRuns.value = []
        }
    } catch {
        sidebarRuns.value = []
    } finally {
        sidebarLoading.value = false
    }
}

const openRunDetail = (run: RunDetailView) => {
    selectedRunId.value = run.id
    runDetailVisible.value = true
}

const closeSidebar = () => {
    sidebarVisible.value = false
    sidebarAlert.value = null
    sidebarRuns.value = []
    runDetailVisible.value = false
    selectedRunId.value = null
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

/**
 * Identifiers 列 URL 构造（todo.md §M23.3 C66-C）：
 * - GHSA → GitHub Advisory Database（github.com/advisories/{GHSA-id}）
 * - CVE → NVD（nvd.nist.gov/vuln/detail/{CVE-id}）
 * 内联实现：alerts.vue 单调用方，未来若 dashboard / 详情页复用再抽 utility（reverse timing）。
 */
const alertGhsaUrl = (ghsaId: string): string => `https://github.com/advisories/${ghsaId}`
const alertCveUrl = (cveId: string): string => `https://nvd.nist.gov/vuln/detail/${cveId}`
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
                        <label for="include-superseded">{{ t('alerts.filter.includeSuperseded') }}</label>
                        <ToggleSwitch
                            id="include-superseded"
                            v-model="filters.includeSuperseded"
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <Button
                            :label="t('alerts.filterApply')"
                            icon="pi pi-filter"
                            @click="() => {
                                void refreshAlerts()
                            }"
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
                            <Tag :value="data.severity" :severity="alertsSeverityTagSeverity(data.severity)" />
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
                    <Column
                        :header="t('alerts.colIdentifiers')"
                        :export="false"
                        :style="{width: '180px'}"
                    >
                        <template #body="{data}">
                            <!-- 依赖类告警：GHSA 优先（fetcher 透传到 ScanResult.ghsaId，reconcile 写入 DB） -->
                            <a
                                v-if="data.ghsaId"
                                :href="alertGhsaUrl(data.ghsaId)"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="alerts__identifier-link"
                                :title="data.ghsaId"
                            >
                                <Tag :value="data.ghsaId" severity="success" />
                            </a>
                            <!-- 无 GHSA 但有 CVE：fallback 显示第一个 CVE -->
                            <a
                                v-else-if="data.cveIds && data.cveIds.length > 0"
                                :href="alertCveUrl(data.cveIds[0] ?? '')"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="alerts__identifier-link"
                                :title="data.cveIds[0] ?? ''"
                            >
                                <Tag :value="data.cveIds[0] ?? ''" severity="warn" />
                            </a>
                            <!-- 多 CVE：剩余 N 个折叠显示（hover title 展示完整列表） -->
                            <span
                                v-if="data.cveIds && data.cveIds.length > 1"
                                class="alerts__identifier-more"
                                :title="data.cveIds.slice(1).join(', ')"
                            >
                                +{{ data.cveIds.length - 1 }}
                            </span>
                            <!-- code-scanning / code-quality 源无 GHSA/CVE 概念 -->
                            <span
                                v-if="!data.ghsaId && (!data.cveIds || data.cveIds.length === 0)"
                                class="text-muted"
                            >—</span>
                        </template>
                    </Column>
                    <Column
                        field="ruleId"
                        :header="t('alerts.colRuleId')"
                        :export="false"
                        sortable
                        :style="{width: '180px'}"
                    >
                        <template #body="{data}">
                            <!-- 实测反馈：alert 行展示 GHSA/CVE/rule id；htmlUrl 存在时点击跳 advisory 详情 -->
                            <a
                                v-if="data.ruleId && data.htmlUrl"
                                :href="data.htmlUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="alerts__ruleid-link"
                                :title="data.ruleId"
                            >
                                <Tag :value="data.ruleId" :severity="alertsRuleIdTagSeverity(data.source)" />
                            </a>
                            <span
                                v-else-if="data.ruleId"
                                class="alerts__ruleid-plain"
                                :title="data.ruleId"
                            >
                                <Tag :value="data.ruleId" :severity="alertsRuleIdTagSeverity(data.source)" />
                            </span>
                            <span v-else class="text-muted">—</span>
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
                            <Tag :value="statusLabel(data)" severity="secondary" />
                        </template>
                    </Column>
                    <!-- per-alert 模型下 ScanResult 字段直接绑定为默认列（不再 v-if 控制，见 todo.md §M20.3 + §M20.6） -->
                    <Column
                        field="occurrenceCount"
                        :header="t('alerts.colOccurrenceCount')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="String(data.occurrenceCount ?? 1)" severity="warn" />
                        </template>
                    </Column>
                    <Column
                        field="firstSeenAt"
                        :header="t('alerts.colFirstSeenAt')"
                        sortable
                    >
                        <template #body="{data}">
                            <span v-if="data.firstSeenAt" class="text-muted">
                                {{ d(new Date(data.firstSeenAt), 'long') }}
                            </span>
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                    <Column
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
                        :header="t('common.actions.details')"
                        :style="{width: '100px'}"
                    >
                        <template #body="{data}">
                            <Button
                                icon="pi pi-list"
                                text
                                rounded
                                size="small"
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

        <!-- 详情侧栏（抽出为 components/alert-run-sidebar.vue，todo.md §M16.2 audit max-lines 触发） -->
        <alert-run-sidebar
            v-model:visible="sidebarVisible"
            :alert="sidebarAlert"
            :runs="sidebarRuns"
            :loading="sidebarLoading"
            @hide="closeSidebar"
            @view-detail="openRunDetail"
        />
        <run-detail-dialog
            v-model:visible="runDetailVisible"
            :run-id="selectedRunId"
        />
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

    // ruleId 列：长 GHSA/CVE/URL 不撑列宽（实测反馈）
    &__ruleid-link {
        text-decoration: none;
        display: inline-flex;
        max-width: 100%;
    }

    &__ruleid-plain {
        display: inline-flex;
        max-width: 100%;
    }

    &__ruleid-link :deep(.p-tag-label),
    &__ruleid-plain :deep(.p-tag-label) {
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
    }

    // identifiers 列（todo.md §M23.3 C66-C）：与 ruleId 列同源视觉（最长 GHSA/CVE 截断）
    &__identifier-link {
        text-decoration: none;
        display: inline-flex;
        max-width: 100%;
    }

    &__identifier-link :deep(.p-tag-label) {
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
    }

    // 多 CVE 折叠徽章：与主标识同行，title 属性展示完整列表
    &__identifier-more {
        margin-left: $space-1;
        font-size: $font-size-sm;
        color: $color-text-muted;
        cursor: help;
    }
}
</style>
