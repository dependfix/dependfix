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
import type { DataTableColumn, DataTableSortMeta } from 'caomei-ui'

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

    // AI 研判评估结果（todo.md §M26.1 + platform-ai-integration.md §alerts 视图 AI 评估列）：
    // - aiEvaluated：true 表示本次扫描引擎触发 AI 研判；false 表示跳过（依赖未触发 / Organization 未配 Key 等）
    // - aiEvaluation：当 aiEvaluated=true 时携带结构化评估结果（confidence / breakingRisks / patchSuggestion）
    // - 触发范围由 Repository.aiTrigger 控制（failure / major / both）；默认不渲染整列内容，仅在 AI 启用过的扫描中显示 Tag
    aiEvaluated?: boolean
    aiEvaluation?: {
        confidence: number
        breakingRisks: string[]
        patchSuggestion: string | null
    } | null
}

/**
 * SSR-aware 数据获取（历史阶段记录见 docs/plan/archive/todo-archive-phases-m16-m17.md
 * 「M16.4 PrimeVue hydration 主线 #1 缓解」）：
 *
 * 历史：alerts 加载走 onMounted(fetchRepositories + fetchAlerts)，SSR 阶段 alerts.value 初值为
 * []，hydration 后从 [] 突变到 mock 数据，PrimeVue 4 DataTable 不重新计算 processedData，
 * rowGroup subheader 永不渲染（模式参考见 docs/standards/testing.md「PrimeVue 4 + Nuxt SSR
 * hydration 状态机分歧」）。page.reload() 后能渲染佐证非业务逻辑问题。
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
 * 切换视图模式：重置 multiSortMeta + expandedPackages，避免上一个视图的排序 / 折叠状态污染。
 *
 * 默认严重级别优先（severity desc）：
 * - 业务依据：docs/standards/platform.md §7.1（severity Rank 是 highest-first 设计，desc 才符合
 *   「critical 优先」的业务期望）
 * - 分组连续性由服务端负责（详见下方 multiSortMeta 注释），客户端不设分组字段次排序键
 */
const onViewModeChange = () => {
    // 仅严重级别降序；分组字段的相邻性由服务端 orderBy(groupBy) 保证（见 multiSortMeta 注释）
    multiSortMeta.value = [{ field: '_severityRank', order: -1 }]
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
const groupHeaderLabel = (data: AlertView): string => {
    if (viewMode.value === 'repository') {
        return data.repository ?? t('alerts.repositoryUnknown')
    }
    return data.packageName
}

// 行分组（rowGroup）与排序状态说明：
// - 折叠状态用 `string[]` 跟踪（分组键数组）；caomei 受控模式经 `@update:expanded-row-groups` 回写，
//   不回写则内建折叠按钮点击无效果
// - caomei 在 `expandableRowGroups` 下会在 `#groupheader` 槽之前渲染内建折叠按钮
//   （`.caomei-data-table__row-group-toggle`，含 aria-expanded），槽内不再叠加自定义 chevron，避免双 chevron
/**
 * 默认排序：仅严重级别降序。
 *
 * 分组连续性不靠客户端次排序键保证——caomei 的分组字段列已从 `columns` 中剔除，
 * TanStack 只对「列模型中存在的列」排序（`createSortedRowModel` 以 `getColumn(sort.id)` 为门槛），
 * 传入分组字段（packageName / repository）会被静默丢弃。分组所需的同组相邻由**服务端**保证：
 * `/api/alerts?groupBy=` 会 `orderBy(groupBy)`，客户端再按严重级别做稳定排序后，同 severity 内
 * 仍保持服务端的分组字段升序（等价 PrimeVue 双键 `[_severityRank desc, packageName asc]` 的结果）。
 * 详见 docs/design/governance/caomei-ui-migration.md §15.10
 */
const multiSortMeta = ref<DataTableSortMeta[]>([
    { field: '_severityRank', order: -1 },
])
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
 * 列定义：caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代 PrimeVue 的 `<Column>`。
 *
 * 等价性要点（迁移自 PrimeVue `<Column>`）：
 * - `key` 同时是排序字段，故严重级别 / 状态列用 rank 字段作 key（与 `multiSortMeta.field` 一致）
 * - **分组模式下剔除分组字段列**：PrimeVue 渲染 subheader 模式时省略 `groupRowsBy` 同名列
 *   （表头与单元格都不渲染，实测 14 列 / colspan=14）；caomei 对分组同名列保留单元格位但不渲染内容，
 *   为保持列数与表结构等价，这里按当前分组字段过滤（分组连续性改由服务端排序保证，见 `multiSortMeta` 注释）
 * - 原 PrimeVue `:export="false"` 是无效 prop（PrimeVue 无该字段），按迁移评估 §5.3 直接删除
 */
const columns = computed<DataTableColumn<AlertView>[]>(() => {
    const all: DataTableColumn<AlertView>[] = [
        { key: 'repository', header: t('alerts.colRepository'), sortable: true },
        { key: '_severityRank', header: t('alerts.colSeverity'), sortable: true },
        { key: 'packageName', header: t('alerts.colPackage'), sortable: true },
        { key: 'source', header: t('alerts.colSource'), sortable: true },
        { key: 'identifiers', header: t('alerts.colIdentifiers'), width: '180px' },
        { key: 'ruleId', header: t('alerts.colRuleId'), sortable: true, width: '180px' },
        { key: 'fixable', header: t('alerts.colFixable') },
        { key: 'recommendedVersion', header: t('alerts.colRecommended'), sortable: true },
        { key: '_fixStatusRank', header: t('alerts.colStatus'), sortable: true },
        { key: 'aiEvaluated', header: t('ai.alertsEvaluatedColumn') },
        { key: 'occurrenceCount', header: t('alerts.colOccurrenceCount'), sortable: true },
        { key: 'firstSeenAt', header: t('alerts.colFirstSeenAt'), sortable: true },
        { key: 'lastSeenAt', header: t('alerts.colLastSeenAt'), sortable: true },
        { key: 'link', header: t('alerts.colLink') },
        { key: 'actions', header: t('common.actions.details'), width: '100px' },
    ]
    const groupField = dataTableAttrs.value.groupRowsBy
    return groupField ? all.filter((column) => column.key !== groupField) : all
})

/**
 * 受控排序回写：提供 `multi-sort-meta` 时 caomei 进入受控模式，不回写则点击列头不改变排序
 * （等价 PrimeVue 的 `v-model:multi-sort-meta`）。
 *
 * 不用 caomei 的全局 `sort-desc-first`：实测该开关会把列头点击循环变成「desc → asc → 移除」，
 * 与 PrimeVue 的「asc → desc → 移除」不一致（且叠加首次点击纠正后 desc 状态不可达）。
 * 默认排序方向仅由 `multiSortMeta` 初值承载（severity desc）；分组连续性见上方注释，与 PrimeVue 逐项一致。
 */
const onUpdateMultiSortMeta = (meta: DataTableSortMeta[]) => {
    multiSortMeta.value = meta
}

/** 受控分组展开回写（等价 `v-model:expanded-row-groups`；不回写则内建折叠按钮点击无效果） */
const onUpdateExpandedRowGroups = (groups: string[]) => {
    expandedPackages.value = groups
}

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
                <CaomeiDataTable
                    :data="alerts"
                    :columns="columns"
                    row-key="id"
                    striped
                    sort-mode="multiple"
                    :multi-sort-meta="multiSortMeta"
                    :row-group-mode="dataTableAttrs.rowGroupMode"
                    :group-rows-by="dataTableAttrs.groupRowsBy"
                    :expandable-row-groups="dataTableAttrs.expandableRowGroups"
                    :expanded-row-groups="expandedPackages"
                    :empty-text="t('alerts.empty')"
                    @update:multi-sort-meta="onUpdateMultiSortMeta"
                    @update:expanded-row-groups="onUpdateExpandedRowGroups"
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
                    <template #cell-_severityRank="{row}">
                        <Tag :value="row.severity" :severity="alertsSeverityTagSeverity(row.severity)" />
                    </template>
                    <template #cell-source="{row}">
                        <Tag :value="row.source" severity="secondary" />
                    </template>
                    <template #cell-identifiers="{row}">
                        <!-- 依赖类告警：GHSA 优先（fetcher 透传到 ScanResult.ghsaId，reconcile 写入 DB） -->
                        <a
                            v-if="row.ghsaId"
                            :href="alertGhsaUrl(row.ghsaId)"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="alerts__identifier-link"
                            :title="row.ghsaId"
                        >
                            <Tag :value="row.ghsaId" severity="success" />
                        </a>
                        <!-- 无 GHSA 但有 CVE：fallback 显示第一个 CVE -->
                        <a
                            v-else-if="row.cveIds && row.cveIds.length > 0"
                            :href="alertCveUrl(row.cveIds[0] ?? '')"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="alerts__identifier-link"
                            :title="row.cveIds[0] ?? ''"
                        >
                            <Tag :value="row.cveIds[0] ?? ''" severity="warn" />
                        </a>
                        <!-- 多 CVE：剩余 N 个折叠显示（hover title 展示完整列表） -->
                        <span
                            v-if="row.cveIds && row.cveIds.length > 1"
                            class="alerts__identifier-more"
                            :title="row.cveIds.slice(1).join(', ')"
                        >
                            +{{ row.cveIds.length - 1 }}
                        </span>
                        <!-- code-scanning / code-quality 源无 GHSA/CVE 概念 -->
                        <span
                            v-if="!row.ghsaId && (!row.cveIds || row.cveIds.length === 0)"
                            class="text-muted"
                        >—</span>
                    </template>
                    <template #cell-ruleId="{row}">
                        <!-- 实测反馈：alert 行展示 GHSA/CVE/rule id；htmlUrl 存在时点击跳 advisory 详情 -->
                        <a
                            v-if="row.ruleId && row.htmlUrl"
                            :href="row.htmlUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="alerts__ruleid-link"
                            :title="row.ruleId"
                        >
                            <Tag :value="row.ruleId" :severity="alertsRuleIdTagSeverity(row.source)" />
                        </a>
                        <span
                            v-else-if="row.ruleId"
                            class="alerts__ruleid-plain"
                            :title="row.ruleId"
                        >
                            <Tag :value="row.ruleId" :severity="alertsRuleIdTagSeverity(row.source)" />
                        </span>
                        <span v-else class="text-muted">—</span>
                    </template>
                    <template #cell-fixable="{row}">
                        <Tag
                            :value="row.fixable ? t('common.yes') : t('common.no')"
                            :severity="row.fixable ? 'success' : 'secondary'"
                        />
                    </template>
                    <template #cell-_fixStatusRank="{row}">
                        <Tag :value="statusLabel(row)" severity="secondary" />
                    </template>
                    <template #cell-aiEvaluated="{row}">
                        <Tag
                            v-if="row.aiEvaluated"
                            :value="t('ai.alertsEvaluatedTag')"
                            severity="info"
                        />
                        <span
                            v-else-if="row.aiEvaluated === false"
                            class="text-muted"
                        >—</span>
                        <span
                            v-else
                            class="text-muted"
                        >—</span>
                    </template>
                    <!-- per-alert 模型下 ScanResult 字段直接绑定为默认列（不再 v-if 控制，见 todo.md §M20.3 + §M20.6） -->
                    <template #cell-occurrenceCount="{row}">
                        <Tag :value="String(row.occurrenceCount ?? 1)" severity="warn" />
                    </template>
                    <template #cell-firstSeenAt="{row}">
                        <span v-if="row.firstSeenAt" class="text-muted">
                            {{ d(new Date(row.firstSeenAt), 'long') }}
                        </span>
                        <span v-else class="text-muted">—</span>
                    </template>
                    <template #cell-lastSeenAt="{row}">
                        <span v-if="row.lastSeenAt" class="text-muted">
                            {{ d(new Date(row.lastSeenAt), 'long') }}
                        </span>
                        <span v-else class="text-muted">—</span>
                    </template>
                    <template #cell-link="{row}">
                        <a
                            v-if="row.htmlUrl"
                            :href="row.htmlUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {{ t('alerts.view') }}
                        </a>
                        <span v-else class="text-muted">—</span>
                    </template>
                    <template #cell-actions="{row}">
                        <Button
                            icon="pi pi-list"
                            text
                            rounded
                            size="small"
                            :aria-label="t('common.actions.details')"
                            @click="openRunSidebar(row)"
                        />
                    </template>
                </CaomeiDataTable>
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
