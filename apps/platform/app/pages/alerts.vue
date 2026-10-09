<script setup lang="ts">
// 告警视图：按仓库/严重级别/来源/视图模式筛选
// 顶部不渲染 dashboard 同款图表（与 dashboard.vue 完全去重），
// 用户需要全局统计去 dashboard；alerts 聚焦表格 + 详情
//
// 详情侧栏已抽出为 components/alert-run-sidebar.vue（audit 触发的 max-lines 抽取）
// 一键修复状态机抽出为 composables/use-fix-now.ts
import { Funnel, List } from '@lucide/vue'
import { SEVERITY_RANK, withFixStatusRank, withSeverityRank } from '~/utils/sort-helpers'
import {
    alertsRuleIdTone,
    alertsSeverityTone,
    alertsStatusLabel,
    buildAlertsQuery,
    summarizePackageGroups,
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
    // per-alert 模型下 ScanResult 字段直接绑定（不再 v-if 控制）：
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
    // 前端 Identifiers 列渲染依赖此二字段。
    ghsaId?: string | null
    cveIds?: string[]

    // AI 研判评估结果（platform-ai-integration.md §alerts 视图 AI 评估列）：
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
 * SSR-aware 数据获取（历史背景见 docs/plan/archive/todo-archive-phases-m16-m17.md）：
 *
 * 历史：alerts 加载走 onMounted(fetchRepositories + fetchAlerts)，SSR 阶段 alerts.value 初值为
 * []，hydration 后从 [] 突变到数据，表格不重新计算 processedData，rowGroup subheader 永不渲染
 * （模式参考见 docs/standards/testing.md「SSR hydration 状态机分歧」）。page.reload() 后能渲染
 * 佐证非业务逻辑问题。
 *
 * 修复路径：迁移到 useAsyncData，SSR 阶段 handler 就执行 fetch 并塞进 payload，hydration 时
 * data.value 已有完整数据 → 表格 processedData 在 hydration 阶段就有数据 → rowGroup subheader
 * 渲染。viewMode / filters 变化通过 watch: [...] 自动 refetch。
 *
 * useRequestFetch：SSR 阶段自动转发 cookie（Nuxt 4 官方 SSR 转发方案），否则 alerts 页有
 * auth middleware 鉴权，SSR 拿不到 session 会 401。
 */

const filters = reactive<AlertsFilters>({
    repositoryId: 'all',
    severity: 'all',
    source: 'all',
    /**
     * includeSuperseded 开关：
     * - false（默认）：后端 result.supersededAt IS NULL 过滤，仅显示活跃告警
     * - true：返回全量（含已 superseded 上游已消失的告警）
     *
     * 替代旧的 dedupe 跨次去重 UI（per-alert 模型下 ScanResult 已天然 deduped，
     * occurrenceCount 字段直接来自 ScanResult，无需应用层 fingerprint 聚合）。
     *
     * 使用 reactive 而非 ref：useAsyncData watch 默认浅监听 ref 引用变化；
     * reactive 配合 getter source + deep watch 触发 includeSuperseded 字段变更 refetch。
     */
    includeSuperseded: false,
})

/**
 * 视图模式：按包 / 按项目 / 原始列表三选一。
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
 * /api/alerts 列表（SSR-aware data fetching）
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
        // （Vue 3 + Nuxt useAsyncData watch 默认浅监听，对 nested field 修改不触发；新增
        // includeSuperseded 开关 toggle 后必须显式 deep watch —— 测试已实证默认 watch 不触发）
        watch: [viewMode],
        default: () => [],
    },
)

// 显式监听 filters reactive 字段变化触发 refetch（深 watch；includeSuperseded 开关引入后必须）
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
const rankedAlerts = computed(() => withFixStatusRank(withSeverityRank(alertsData.value ?? [])))

/**
 * 「按包」组信息：包名 → 组内最高 severity + 组排序键（聚合逻辑见 `summarizePackageGroups`）。
 * 数据源为**过滤后**的 `alertsData`：组信息应反映当前可见集合，而非全量。
 */
const packageGroupSummary = computed(() => summarizePackageGroups(alertsData.value ?? []))

/**
 * 告警数组派生（含业务语义排序键）。
 *
 * 「按包」模式预排序为「包名升序 → 组内 severity 降序」：作为「无排序键」（用户清空排序）时的
 * 展示基线，并为组内稳定排序提供行级 severity 降序的基线顺序（组排序键组间唯一，同包各行同值 →
 * 稳定保留本顺序）。其它视图模式（repository / none）保持服务端原始顺序，行为不变。
 */
const alerts = computed<AlertView[]>(() => {
    const rows = rankedAlerts.value
    if (viewMode.value !== 'package') {
        return rows
    }
    return [...rows].sort((a, b) => {
        if (a.packageName !== b.packageName) {
            return a.packageName < b.packageName ? -1 : 1
        }
        return (b._severityRank ?? 0) - (a._severityRank ?? 0)
    })
})

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
 * - 分组连续性由**组排序键**保证（详见下方 multiSortMeta 注释），客户端不设分组字段次排序键
 */
const onViewModeChange = () => {
    // 仅严重级别降序；「按包」的组内相邻性由组排序键保证（见 multiSortMeta 注释）
    multiSortMeta.value = [{ field: '_severityRank', order: -1 }]
    expandedPackages.value = []
}

// per-alert 模型下每行 1 个 runId；详情侧栏（右侧滑出，
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
 * 一键修复：
 * - 复用既有 run_id：服务端 skip createPendingScanRun，直接以复用 run 进入 fix 流程
 * - 状态机（fixingRunId / fixError / fixSuccess）抽出到 composables/use-fix-now.ts
 *   （utility 抽取的反向时机 —— audit warning 触发的单向提前抽取）
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
        // per-alert 模型下每行 1 个 runId；直接拉取该 run 详情显示 sidebar
        // （旧的从 affectedRunIds 拉取多个 runs 已无意义）
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
/** 「按包」模式该组的最高严重级别（组头 Tag 展示）；非按包模式不展示。 */
const groupMaxSeverity = (data: AlertView): string | null => packageGroupSummary.value.get(data.packageName)?.severity ?? null

// 行分组（rowGroup）与排序状态说明：
// - 折叠状态用 `string[]` 跟踪（分组键数组）；caomei 受控模式经 `@update:expanded-row-groups` 回写，
//   不回写则内建折叠按钮点击无效果
// - caomei 在 `expandableRowGroups` 下会在 `#groupheader` 槽之前渲染内建折叠按钮
//   （`.caomei-data-table__row-group-toggle`，含 aria-expanded），槽内不再叠加自定义 chevron，避免双 chevron
/**
 * 默认排序：严重级别降序。
 *
 * 分组连续性由**组排序键**保证：caomei 的相邻行分组要求同组行相邻，而分组字段列已从
 * `columns` 剔除，TanStack 只对「列模型中存在的列」排序（`createSortedRowModel` 以 `getColumn(sort.id)`
 * 为门槛），无法直接以 `packageName` 作排序键。改为让「严重级别」列在「按包」模式下返回**组排序键**
 * （组间唯一，含最高级别 rank 与包名序号，见 `packageGroupSummary`）→ 同包所有行共享同一排序值且
 * 键组间唯一，任何排序下同包行都相邻 → 「一个包一组」为硬不变量。`alerts` 预排序提供同值内的稳定基线
 * （包名升序 → 组内 severity 降序）。「按仓库」视图沿用既有口径（服务端 `orderBy` + 行级 severity 降序），
 * 本条目不改其分组行为。
 * 详见 docs/design/governance/caomei-ui-migration.md §15.10
 */
const multiSortMeta = ref<DataTableSortMeta[]>([
    { field: '_severityRank', order: -1 },
])
const expandedPackages = ref<string[]>([])
// 自定义 span 整体可点击 + 键盘 enter/space 触发（验收要求）。
// 迁移前组件库 4.x 的 rowToggleButton 在 groupheader 之前渲染（渲染顺序实证见迁移评估 §15.10），
// 自定义 toggle 与其内部 toggle 走不同路径但修改同一 ref，不会重复 toggle。
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
 * 「严重级别」列的排序取值。
 *
 * 「按包」分组模式取**组排序键** `packageGroupSummary.sortKey`（组间唯一，见其上注释）——这是
 * 「一个包一组」的关键：行级 severity 排序会把同包跨档行拆到不同 severity 区块，相邻性破坏后
 * 同名分组头重复出现；组间唯一键则保证任何排序下同包行都相邻。非分组模式（repository / none）
 * 仍取行级 rank。展示不受影响：`#cell-_severityRank` 槽读行级 `severity`。
 * 注：`??` 回退为防御性分支——行数据均来自 `alertsData`，其包名必在 `packageGroupSummary` 中（当前不可达）。
 */
const groupSeveritySortValue = (row: AlertView): number => {
    if (viewMode.value === 'package') {
        return packageGroupSummary.value.get(row.packageName)?.sortKey ?? (SEVERITY_RANK[row.severity] ?? 0)
    }
    return SEVERITY_RANK[row.severity] ?? 0
}

/**
 * 列定义：caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代迁移前的 `<Column>`。
 *
 * 等价性要点（由迁移前 `<Column>` 迁移而来）：
 * - `key` 同时是排序字段，故严重级别 / 状态列用 rank 字段作 key（与 `multiSortMeta.field` 一致）
 * - **分组模式下剔除分组字段列**：迁移前组件库渲染 subheader 模式时省略 `groupRowsBy` 同名列
 *   （表头与单元格都不渲染，实测 14 列 / colspan=14）；caomei 对分组同名列保留单元格位但不渲染内容，
 *   为保持列数与表结构等价，这里按当前分组字段过滤（「按包」的组内相邻改由组排序键保证，见 `multiSortMeta` 注释）
 * - 原迁移前组件库 `:export="false"` 是无效 prop（迁移前组件库无该字段），按迁移评估 §5.3 直接删除
 */
const columns = computed<DataTableColumn<AlertView>[]>(() => {
    const all: DataTableColumn<AlertView>[] = [
        { key: 'repository', header: t('alerts.colRepository'), sortable: true },
        { key: '_severityRank', header: t('alerts.colSeverity'), sortable: true, accessor: groupSeveritySortValue },
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
 * （等价迁移前的 `v-model:multi-sort-meta`）。
 *
 * 不用 caomei 的全局 `sort-desc-first`：实测该开关会把列头点击循环变成「desc → asc → 移除」，
 * 与迁移前组件库的「asc → desc → 移除」不一致（且叠加首次点击纠正后 desc 状态不可达）。
 * 默认排序方向仅由 `multiSortMeta` 初值承载（severity desc）。
 *
 * 「按包」模式：把严重级别（组排序键）固定为第一排序键——迁移前组件库在多列排序下会自动
 * 保留 `groupRowsBy` 为首键以免分组被打散，本仓库以「严重级别列排序取值 = 组排序键（组间唯一）」
 * 等价实现。用户移除严重级别键但保留其它键时补回默认降序（保证「一个包一组」）；全部清空时交由
 * `alerts` 预排序基线（同包同值稳定），分组仍连续。
 */
const onUpdateMultiSortMeta = (meta: DataTableSortMeta[]) => {
    if (viewMode.value !== 'package') {
        multiSortMeta.value = meta
        return
    }
    const severity = meta.find((item) => item.field === '_severityRank')
    const others = meta.filter((item) => item.field !== '_severityRank')
    multiSortMeta.value = others.length > 0
        ? [{ field: '_severityRank', order: severity?.order ?? -1 }, ...others]
        : meta
}

/** 受控分组展开回写（等价 `v-model:expanded-row-groups`；不回写则内建折叠按钮点击无效果） */
const onUpdateExpandedRowGroups = (groups: string[]) => {
    expandedPackages.value = groups
}

/**
 * Identifiers 列 URL 构造：
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

        <!-- 顶部图表区块已删除：与 dashboard.vue 完全重复，全量聚合与 alerts 过滤无关，
             用户需要全局统计去 dashboard；alerts 聚焦表格 + 详情 -->

        <CaomeiCard class="alerts__filters">
            <div class="alerts__filter-row">
                <div class="alerts__filter-field">
                    <label for="view-mode">{{ t('alerts.viewMode') }}</label>
                    <CaomeiSelect
                        id="view-mode"
                        v-model="viewMode"
                        :options="viewModeOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="onViewModeChange"
                    />
                </div>
                <div class="alerts__filter-field">
                    <label for="repo">{{ t('alerts.filterRepository') }}</label>
                    <CaomeiSelect
                        id="repo"
                        v-model="filters.repositoryId"
                        :options="repositories"
                        option-label="name"
                        option-value="id"
                        :placeholder="t('alerts.allRepositories')"
                    />
                </div>
                <div class="alerts__filter-field">
                    <label for="severity">{{ t('alerts.filterSeverity') }}</label>
                    <CaomeiSelect
                        id="severity"
                        v-model="filters.severity"
                        :options="severityOptions"
                        option-label="label"
                        option-value="value"
                    />
                </div>
                <div class="alerts__filter-field">
                    <label for="source">{{ t('alerts.filterSource') }}</label>
                    <CaomeiSelect
                        id="source"
                        v-model="filters.source"
                        :options="sourceOptions"
                        option-label="label"
                        option-value="value"
                    />
                </div>
                <div class="alerts__filter-field">
                    <label for="include-superseded">{{ t('alerts.filter.includeSuperseded') }}</label>
                    <div class="alerts__filter-control">
                        <CaomeiSwitch
                            id="include-superseded"
                            v-model="filters.includeSuperseded"
                        />
                    </div>
                </div>
                <div class="alerts__filter-field">
                    <CaomeiButton
                        @click="() => {
                            void refreshAlerts()
                        }"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Funnel" />
                        </template>
                        {{ t('alerts.filterApply') }}
                    </CaomeiButton>
                </div>
            </div>
        </CaomeiCard>

        <CaomeiMessage
            v-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>

        <CaomeiCard v-if="!loading" class="alerts__table">
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
                        <CaomeiTag
                            v-if="viewMode === 'package' && groupMaxSeverity(data)"
                            :tone="alertsSeverityTone(groupMaxSeverity(data) ?? 'unknown')"
                        >
                            {{ groupMaxSeverity(data) }}
                        </CaomeiTag>
                        <span class="alerts__group-count text-muted">
                            {{ t('alerts.groupHeaderCount', {count: groupCounts.get(groupHeaderLabel(data)) ?? 0}) }}
                        </span>
                    </span>
                </template>
                <template #cell-_severityRank="{row}">
                    <CaomeiTag :tone="alertsSeverityTone(row.severity)">
                        {{ row.severity }}
                    </CaomeiTag>
                </template>
                <template #cell-source="{row}">
                    <CaomeiTag tone="neutral">
                        {{ row.source }}
                    </CaomeiTag>
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
                        <CaomeiTag tone="success">
                            {{ row.ghsaId }}
                        </CaomeiTag>
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
                        <CaomeiTag tone="warning">
                            {{ row.cveIds[0] ?? '' }}
                        </CaomeiTag>
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
                        <CaomeiTag :tone="alertsRuleIdTone(row.source)">
                            {{ row.ruleId }}
                        </CaomeiTag>
                    </a>
                    <span
                        v-else-if="row.ruleId"
                        class="alerts__ruleid-plain"
                        :title="row.ruleId"
                    >
                        <CaomeiTag :tone="alertsRuleIdTone(row.source)">
                            {{ row.ruleId }}
                        </CaomeiTag>
                    </span>
                    <span v-else class="text-muted">—</span>
                </template>
                <template #cell-fixable="{row}">
                    <CaomeiTag :tone="row.fixable ? 'success' : 'neutral'">
                        {{ row.fixable ? t('common.yes') : t('common.no') }}
                    </CaomeiTag>
                </template>
                <template #cell-_fixStatusRank="{row}">
                    <CaomeiTag tone="neutral">
                        {{ statusLabel(row) }}
                    </CaomeiTag>
                </template>
                <template #cell-aiEvaluated="{row}">
                    <CaomeiTag
                        v-if="row.aiEvaluated"
                        tone="primary"
                    >
                        {{ t('ai.alertsEvaluatedTag') }}
                    </CaomeiTag>
                    <span
                        v-else-if="row.aiEvaluated === false"
                        class="text-muted"
                    >—</span>
                    <span
                        v-else
                        class="text-muted"
                    >—</span>
                </template>
                <!-- per-alert 模型下 ScanResult 字段直接绑定为默认列 -->
                <template #cell-occurrenceCount="{row}">
                    <CaomeiTag tone="warning">
                        {{ String(row.occurrenceCount ?? 1) }}
                    </CaomeiTag>
                </template>
                <!-- 首次发现 / 最近见到时间：值派生自 fixtures 注入时间，属视觉回归的动态区域，
                     以 data-visual-mask 显式遮蔽（selector 见 apps/platform/tests/visual/helpers/visual.ts），
                     不依赖像素容差兜底 -->
                <template #cell-firstSeenAt="{row}">
                    <span
                        v-if="row.firstSeenAt"
                        class="text-muted"
                        data-visual-mask
                    >
                        {{ d(new Date(row.firstSeenAt), 'long') }}
                    </span>
                    <span v-else class="text-muted">—</span>
                </template>
                <template #cell-lastSeenAt="{row}">
                    <span
                        v-if="row.lastSeenAt"
                        class="text-muted"
                        data-visual-mask
                    >
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
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="t('common.actions.details')"
                        @click="openRunSidebar(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="List" />
                        </template>
                    </CaomeiButton>
                </template>
            </CaomeiDataTable>
        </CaomeiCard>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <!-- 详情侧栏（抽出为 components/alert-run-sidebar.vue，audit max-lines 触发） -->
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
        @include field-stack;

        min-width: 160px;
    }

    /* Switch 本体高度低于控件档高度（`--caomei-switch-height` < `--caomei-control-height-md`）：
       直接放进字段会让该字段整体变矮，在行 flex-end 对齐下其 label 被下压。控件区统一按
       控制档高度补足并垂直居中，使同排各字段的 label 与控件上下缘都对齐。 */
    &__filter-control {
        display: flex;
        align-items: center;
        min-height: var(--caomei-control-height-md);
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

    &__ruleid-link :deep(.caomei-tag__content),
    &__ruleid-plain :deep(.caomei-tag__content) {
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
    }

    // identifiers 列：与 ruleId 列同源视觉（最长 GHSA/CVE 截断）
    &__identifier-link {
        text-decoration: none;
        display: inline-flex;
        max-width: 100%;
    }

    &__identifier-link :deep(.caomei-tag__content) {
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
