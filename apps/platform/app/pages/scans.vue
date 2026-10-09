<script setup lang="ts">
// /scans 独立页面：
// - 顶部 4 块汇总卡片（totalRuns / totalAlerts / totalFixed / 最近扫描）
// - 按仓库聚合列表（byRepo DataTable，可点击"仅查看此仓库"过滤）
// - 全运行列表（runList DataTable，分页 + 可点击进入详情 dialog）
//
// 三种 query 组合：
// - /scans：全量展示
// - /scans?repository=xxx：按仓库过滤（来自 repos.vue 跳转）
// - /scans?run=xxx：直接打开单 run 详情（`repo-history-dialog` query-key='run'）
//
// 依赖：/api/runs（已闭环分页 + ids 过滤 + organizationId 隔离）
//      /api/scan-history/summary（聚合端点）
//      `repo-history-dialog` 组件（queryKey='run' mode 直接打开 detail）
//
// 非目标：
// - 不引入多组织；不重写后端聚合；不动 dashboard.vue；不动 batch-runs 跨仓库视图
// - 不破坏既有 alerts-rowgroup / history-dialog / 视图切换 / dedupe 行为
import { Eye, Funnel, RefreshCw, X } from '@lucide/vue'
import type { DataTableColumn, DataTablePageEvent } from 'caomei-ui'
import {
    alertsFound,
    failureKindLabel,
    failureStageLabel,
    RUN_FAILURE_KIND_OPTIONS,
    RUN_FAILURE_STAGE_OPTIONS,
    runExecutorLabel,
    runModeLabel,
} from '~/utils/run-view'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()

// 三态分离（与 alerts.vue / batch-runs.vue 同模式）：
// - firstLoad: 首屏骨架控制
// - loading: 手动刷新按钮 loading 反馈
// - inflight: 实际请求是否 in-flight（并发守卫）
const firstLoad = ref(true)
const loading = ref(false)
const inflight = ref(false)
const summaryLoading = ref(false)
const summaryInflight = ref(false)
const error = ref('')
const summaryError = ref('')

interface SummaryResponse {
    byStatus: Record<string, number>
    byFailureStage: Record<string, number>
    totals: { runs: number, totalAlerts: number, totalFixed: number }
    repositories: Array<{
        repositoryId: string
        owner: string
        name: string
        runCount: number
        alertCount: number
        fixedCount: number
        lastRunAt: string | null
        lastStatus: string | null
        lastFailureStage: string | null
    }>
    window: { start: string | null, end: string | null, included: number, limit: number }
    filtered: { repositoryId: string | null, lastStatus: string | null }
}

interface SummaryView extends SummaryResponse {
    lastRunAt: string | null
}

const summary = ref<SummaryView | null>(null)

interface RunView {
    id: string
    repositoryId: string
    owner: string | null
    name: string | null
    mode: string
    severityThreshold: string
    executorKind: string
    status: string
    startedAt: string | null
    finishedAt: string | null
    runUrl: string | null
    summary: Record<string, unknown> | null
    error: { code: string, message: string } | null
    failureCode: string | null
    failureStage: string | null
    failureKind: string | null
}

/**
 * 运行列表筛选：状态 / 失败阶段 / 处置建议三维度。
 * 「全部」用哨兵值而非空串——caomei Select 的 SelectItem 不允许 `value` 为空字符串
 * （空串被组件保留用于「清除选择显示占位符」，传入会直接抛错）；提交查询前哨兵值不传递。
 * 阶段与建议选项由 `~/utils/run-view` 提供（与服务端分类枚举同序）。
 */
const FILTER_ALL = '__all__'

const filters = reactive({
    status: FILTER_ALL,
    failureStage: FILTER_ALL,
    failureKind: FILTER_ALL,
})

/** 状态下拉选项（顺序与 `SCAN_RUN_STATUSES` 一致；哨兵值 = 全部） */
const SCAN_RUN_STATUS_OPTIONS = ['pending', 'running', 'completed', 'failed', 'dispatched', 'degraded'] as const

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

/**
 * 页面分区（Tabs）：默认「全部运行」——与既有首屏语义（runs 列表可见）一致；
 * 「按仓库」聚合列表的「最近状态」筛选与分页状态独立于 runs 列表的三维筛选。
 * 类型放宽到 `string | number | undefined` 以匹配 `CaomeiTabs` 的受控 `modelValue`（Tab 值恒为字符串）。
 */
const activeTab = ref<string | number | undefined>('runs')

/** byRepo「最近状态」筛选（哨兵值 = 全部）：命中时仅过滤聚合列表，不改 runs 列表筛选 */
const byRepoStatus = ref(FILTER_ALL)

/** byRepo 客户端分页（受控）：聚合列表窗口有界（≤ SUMMARY_RUN_LIMIT 条 run），客户端分页足够 */
const byRepoPage = ref(1)
const byRepoRows = ref(10)

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

/** 状态 / 失败阶段 / 处置建议三维筛选是否有任一激活（用于「清除筛选」按钮可见性） */
const hasActiveFilters = computed(() => (
    filters.status !== FILTER_ALL || filters.failureStage !== FILTER_ALL || filters.failureKind !== FILTER_ALL
))

/** 清除运行列表筛选（变更由 watch(filters) 统一驱动重新拉取并回到第 1 页） */
const clearRunFilters = () => {
    filters.status = FILTER_ALL
    filters.failureStage = FILTER_ALL
    filters.failureKind = FILTER_ALL
}

const runs = ref<RunView[]>([])
const total = ref(0)
const pageSize = ref(10)
const first = ref(0)

/**
 * caomei DataTable 受控分页为 1 基 `page`（迁移前组件库为 0 基 `first`）。
 * 由既有 `first` / `pageSize` 状态换算，`@page` 回写 `first` 即驱动页码；
 * `pageSize` / `first` 的语义与下游 `fetchRuns` 用法保持不变。
 */
const page = computed(() => Math.floor(first.value / pageSize.value) + 1)

// query ?repository= 与 query ?run= 解析（scans 页面三态入口）
const repositoryIdQuery = computed(() => {
    const raw = route.query.repository
    return typeof raw === 'string' && raw.length > 0 ? raw : null
})

const filteredRepository = ref<{ id: string, owner: string, name: string } | null>(null)

/**
 * summary 聚合加载（顶部 4 卡 + byRepo 表）。
 *
 * 请求在途时的并发调用不静默丢弃（与 `fetchRuns` 的 `queuedRunFetch` 同模式）：否则
 * `summaryInflight` 短路会让「最近状态」筛选 / repositoryId 变更的刷新被吞掉，列表停留在旧结果。
 */
let queuedSummaryFetch = false

const fetchSummary = async () => {
    if (summaryInflight.value) {
        queuedSummaryFetch = true
        return
    }
    summaryInflight.value = true
    summaryLoading.value = true
    summaryError.value = ''
    try {
        const query: Record<string, string> = {}
        if (repositoryIdQuery.value) {
            query.repositoryId = repositoryIdQuery.value
        }
        // byRepo「最近状态」筛选（哨兵值不传；服务端白名单校验非法值 400）
        if (byRepoStatus.value !== FILTER_ALL) {
            query.lastStatus = byRepoStatus.value
        }
        const res = await $fetch('/api/scan-history/summary', { query })
        const data = res as SummaryResponse
        const lastRunAt = data.window.end
        summary.value = { ...data, lastRunAt }
        // 当 repositoryIdQuery 命中时，从聚合中查找目标仓库信息显示面包屑
        if (repositoryIdQuery.value) {
            const found = data.repositories.find((r) => r.repositoryId === repositoryIdQuery.value)
            filteredRepository.value = found
                ? { id: found.repositoryId, owner: found.owner, name: found.name }
                : null
        } else {
            filteredRepository.value = null
        }
    } catch (e: any) {
        summaryError.value = t('scans.runList.errors.summaryFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        summaryLoading.value = false
        summaryInflight.value = false
        if (queuedSummaryFetch) {
            queuedSummaryFetch = false
            await fetchSummary()
        }
    }
}

/**
 * 请求在途时的并发调用不静默丢弃（如快速切换筛选）：记录最后一次请求参数，当前请求收尾后补跑一次。
 * 否则 in-flight 短路会让「下拉已选、列表未过滤」持续到用户下一次交互。
 */
let queuedRunFetch: { page: number, rows: number } | null = null

/** runs 列表加载（paginated /api/runs） */
const fetchRuns = async (page = 1, rows = pageSize.value) => {
    if (inflight.value) {
        queuedRunFetch = { page, rows }
        return
    }
    inflight.value = true
    loading.value = true
    error.value = ''
    try {
        const query: Record<string, string | number> = {
            page,
            pageSize: rows,
        }
        if (repositoryIdQuery.value) {
            query.repositoryId = repositoryIdQuery.value
        }
        // 失败分类筛选：哨兵值（全部）不传，服务端按逗号分隔多值解析
        if (filters.status !== FILTER_ALL) {
            query.status = filters.status
        }
        if (filters.failureStage !== FILTER_ALL) {
            query.failureStage = filters.failureStage
        }
        if (filters.failureKind !== FILTER_ALL) {
            query.failureKind = filters.failureKind
        }
        const res = await $fetch('/api/runs', { query })
        const data = res as { items: RunView[], total: number }
        runs.value = data.items
        total.value = data.total
    } catch (e: any) {
        error.value = t('scans.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
        inflight.value = false
        firstLoad.value = false
        const queued = queuedRunFetch
        queuedRunFetch = null
        if (queued) {
            await fetchRuns(queued.page, queued.rows)
        }
    }
}

/** 并发刷新 summary + runs（保留 in-flight 守卫） */
const refresh = async () => {
    await Promise.all([fetchSummary(), fetchRuns(1, pageSize.value)])
    first.value = 0
}

/** caomei DataTable @page 事件：page 1-based（对齐后端 page 参数，不再 +1）；既有重新请求副作用不变 */
const onPage = async (event: DataTablePageEvent) => {
    pageSize.value = event.rows
    first.value = event.first
    await fetchRuns(event.page, event.rows)
}

/** byRepo 客户端分页：受控 page / rows 回写（「最近状态」筛选变化时由 watch 重置到第 1 页） */
const onByRepoPage = (event: DataTablePageEvent) => {
    byRepoPage.value = event.page
    byRepoRows.value = event.rows
}

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

/** 进入 run 详情（list 行点击 → 跳 /scans?run=） */
const openRunDetail = (runId: string) => {
    void router.push({ path: '/scans', query: { ...route.query, run: runId } })
}

/** 按仓库过滤（byRepo 行点击"仅查看此仓库"按钮）：切到「全部运行」分区查看该仓库运行列表 */
const filterByRepository = (repo: { id: string }) => {
    activeTab.value = 'runs'
    void router.push({ path: '/scans', query: { repository: repo.id } })
}

/** 清除仓库过滤（回到 /scans） */
const clearFilter = () => {
    void router.push({ path: '/scans' })
}

/** 汇总聚合行类型（byRepo 表） */
type SummaryRepository = SummaryResponse['repositories'][number]

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽表达单元格）。
 * 非排序列（lastRun / lastStatus / actions）也需唯一 key；`key` 即排序字段。
 */
const byRepoColumns = computed<DataTableColumn<SummaryRepository>[]>(() => [
    { key: 'owner', header: t('scans.byRepo.colOwner') },
    { key: 'name', header: t('scans.byRepo.colName') },
    { key: 'runCount', header: t('scans.byRepo.colRuns'), sortable: true },
    { key: 'alertCount', header: t('scans.byRepo.colAlerts'), sortable: true },
    { key: 'fixedCount', header: t('scans.byRepo.colFixed'), sortable: true },
    { key: 'lastRun', header: t('scans.byRepo.colLastRun') },
    { key: 'lastStatus', header: t('scans.byRepo.colLastStatus') },
    { key: 'actions', header: t('scans.byRepo.colActions'), width: '180px' },
])

/** 列定义（全运行列表 runList 表） */
const runListColumns = computed<DataTableColumn<RunView>[]>(() => [
    { key: 'repo', header: t('runs.colRepo') },
    { key: 'status', header: t('runs.colStatus') },
    { key: 'mode', header: t('runs.colMode') },
    { key: 'threshold', header: t('runs.colThreshold') },
    { key: 'executor', header: t('runs.colExecutor') },
    { key: 'startedAt', header: t('runs.colStartedAt') },
    { key: 'alerts', header: t('runs.colAlerts') },
    { key: 'fixed', header: t('runs.colFixed') },
    { key: 'actions', header: t('runs.colActions'), width: '120px' },
])

// 监听 repositoryIdQuery 变化（用户点 byRepo 过滤 / 清除过滤）
watch(repositoryIdQuery, async () => {
    first.value = 0
    pageSize.value = 10
    byRepoPage.value = 1
    await refresh()
})

// 失败分类三维筛选变化：回到第 1 页并重新拉取列表（不动 summary 全量窗口）
watch(filters, async () => {
    first.value = 0
    await fetchRuns(1, pageSize.value)
})

// byRepo「最近状态」筛选变化：重置聚合列表分页到第 1 页并仅刷新 summary（不动 runs 列表筛选）
watch(byRepoStatus, async () => {
    byRepoPage.value = 1
    await fetchSummary()
})

onMounted(refresh)
</script>

<template>
    <div class="scans">
        <div class="scans__header">
            <div>
                <h2>{{ t('scans.title') }}</h2>
                <p class="text-muted">
                    {{ t('scans.subtitle') }}
                </p>
            </div>
            <div class="scans__header-actions">
                <CaomeiButton
                    tone="neutral"
                    :loading="loading || summaryLoading"
                    @click="refresh"
                >
                    <template #icon>
                        <CaomeiIcon :icon="RefreshCw" />
                    </template>
                    {{ t('common.actions.refresh') }}
                </CaomeiButton>
            </div>
        </div>

        <!-- 仓库过滤面包屑（scans?repository=xxx） -->
        <CaomeiMessage
            v-if="filteredRepository"
            tone="primary"
            :closable="false"
            class="scans__filter-banner"
        >
            <div class="scans__filter-row">
                <span>
                    {{ t('scans.repoFilterActive', {owner: filteredRepository.owner, name: filteredRepository.name}) }}
                </span>
                <CaomeiButton
                    tone="neutral"
                    variant="ghost"
                    size="sm"
                    @click="clearFilter"
                >
                    <template #icon>
                        <CaomeiIcon :icon="X" />
                    </template>
                    {{ t('scans.clearFilter') }}
                </CaomeiButton>
            </div>
        </CaomeiMessage>

        <CaomeiMessage
            v-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>
        <CaomeiMessage
            v-if="summaryError"
            tone="warning"
            :closable="false"
        >
            {{ summaryError }}
        </CaomeiMessage>

        <!-- 4 块汇总卡片 -->
        <div class="scans__summary">
            <CaomeiCard class="scans__stat">
                <div class="scans__stat-value">
                    {{ summary?.totals.runs ?? 0 }}
                </div>
                <div class="scans__stat-label text-muted">
                    {{ t('scans.summary.totalRuns') }}
                </div>
            </CaomeiCard>
            <CaomeiCard class="scans__stat">
                <div class="scans__stat-value">
                    {{ summary?.totals.totalAlerts ?? 0 }}
                </div>
                <div class="scans__stat-label text-muted">
                    {{ t('scans.summary.totalAlerts') }}
                </div>
            </CaomeiCard>
            <CaomeiCard class="scans__stat">
                <div class="scans__stat-value">
                    {{ summary?.totals.totalFixed ?? 0 }}
                </div>
                <div class="scans__stat-label text-muted">
                    {{ t('scans.summary.totalFixed') }}
                </div>
            </CaomeiCard>
            <CaomeiCard class="scans__stat">
                <div class="scans__stat-value scans__stat-value--sm">
                    {{ summary?.lastRunAt ? d(new Date(summary.lastRunAt), 'short') : '—' }}
                </div>
                <div class="scans__stat-label text-muted">
                    {{ t('scans.summary.lastRunAt') }}
                </div>
            </CaomeiCard>
        </div>

        <CaomeiTabs v-model="activeTab" class="scans__tabs">
            <CaomeiTabList>
                <CaomeiTabTrigger value="runs">
                    {{ t('scans.runList.title') }}
                </CaomeiTabTrigger>
                <CaomeiTabTrigger value="repo">
                    {{ t('scans.byRepo.title') }}
                </CaomeiTabTrigger>
            </CaomeiTabList>

            <!-- 按仓库聚合（byRepo DataTable，可点击"仅查看此仓库"过滤）：
                 「最近状态」筛选 + 客户端分页 + 统计窗口提示 -->
            <CaomeiTabContent value="repo">
                <CaomeiCard class="scans__byrepo-toolbar">
                    <div class="scans__run-filter-row">
                        <div class="scans__run-filter-field">
                            <label for="byrepo-status">{{ t('scans.byRepo.filterStatus') }}</label>
                            <CaomeiSelect
                                id="byrepo-status"
                                v-model="byRepoStatus"
                                :options="byRepoStatusOptions"
                                option-label="label"
                                option-value="value"
                            />
                        </div>
                    </div>
                    <p class="scans__window-hint text-muted">
                        {{ t('scans.byRepo.windowHint', {included: summary?.window.included ?? 0, limit: summary?.window.limit ?? 0}) }}
                    </p>
                </CaomeiCard>
                <CaomeiCard>
                    <CaomeiDataTable
                        :data="summary?.repositories ?? []"
                        :columns="byRepoColumns"
                        row-key="repositoryId"
                        striped
                        paginator
                        :page="byRepoPage"
                        :rows="byRepoRows"
                        :rows-per-page-options="[10, 25, 50]"
                        :empty-text="t('scans.byRepo.empty')"
                        @page="onByRepoPage"
                    >
                        <template #cell-lastRun="{row}">
                            {{ row.lastRunAt ? d(new Date(row.lastRunAt), 'short') : '—' }}
                        </template>
                        <template #cell-lastStatus="{row}">
                            <CaomeiTag
                                v-if="row.lastStatus"
                                :tone="statusTone(row.lastStatus)"
                            >
                                {{ statusLabelWithStage(row.lastStatus, row.lastFailureStage) }}
                            </CaomeiTag>
                            <span v-else class="text-muted">—</span>
                        </template>
                        <template #cell-actions="{row}">
                            <CaomeiButton
                                variant="ghost"
                                rounded
                                size="sm"
                                :label="t('scans.byRepo.actionFilterThis')"
                                :title="t('scans.byRepo.actionFilterThis')"
                                :disabled="!!repositoryIdQuery && repositoryIdQuery === row.repositoryId"
                                @click="filterByRepository({id: row.repositoryId})"
                            >
                                <template #icon>
                                    <CaomeiIcon :icon="Funnel" />
                                </template>
                            </CaomeiButton>
                        </template>
                    </CaomeiDataTable>
                </CaomeiCard>
            </CaomeiTabContent>

            <!-- 全部运行（paginated DataTable；点击行进入 ?run= 详情）：
                 失败分类筛选条（状态 / 失败阶段 / 处置建议三维度 + 阶段分布计数） -->
            <CaomeiTabContent value="runs">
                <CaomeiCard class="scans__run-filters">
                    <div class="scans__run-filter-row">
                        <div class="scans__run-filter-field">
                            <label for="run-status">{{ t('scans.runList.filterStatus') }}</label>
                            <CaomeiSelect
                                id="run-status"
                                v-model="filters.status"
                                :options="statusFilterOptions"
                                option-label="label"
                                option-value="value"
                            />
                        </div>
                        <div class="scans__run-filter-field">
                            <label for="run-failure-stage">{{ t('scans.runList.filterFailureStage') }}</label>
                            <CaomeiSelect
                                id="run-failure-stage"
                                v-model="filters.failureStage"
                                :options="failureStageFilterOptions"
                                option-label="label"
                                option-value="value"
                            />
                        </div>
                        <div class="scans__run-filter-field">
                            <label for="run-failure-kind">{{ t('scans.runList.filterFailureKind') }}</label>
                            <CaomeiSelect
                                id="run-failure-kind"
                                v-model="filters.failureKind"
                                :options="failureKindFilterOptions"
                                option-label="label"
                                option-value="value"
                            />
                        </div>
                        <div v-if="hasActiveFilters" class="scans__run-filter-field scans__run-filter-field--action">
                            <CaomeiButton
                                tone="neutral"
                                variant="ghost"
                                size="sm"
                                @click="clearRunFilters"
                            >
                                <template #icon>
                                    <CaomeiIcon :icon="X" />
                                </template>
                                {{ t('scans.runList.clearFilters') }}
                            </CaomeiButton>
                        </div>
                    </div>
                    <div v-if="failureStageCounts.length > 0" class="scans__failure-summary">
                        <span class="text-muted">{{ t('scans.runList.failureStageSummary') }}</span>
                        <CaomeiTag
                            v-for="item in failureStageCounts"
                            :key="item.stage"
                            tone="neutral"
                        >
                            {{ item.label }} · {{ item.count }}
                        </CaomeiTag>
                    </div>
                </CaomeiCard>
                <CaomeiCard v-if="!firstLoad" class="scans__run-list">
                    <CaomeiDataTable
                        :data="runs"
                        :columns="runListColumns"
                        row-key="id"
                        lazy
                        paginator
                        :page="page"
                        :rows="pageSize"
                        :total-records="total"
                        :rows-per-page-options="[10, 25, 50]"
                        :loading="loading"
                        striped
                        :empty-text="t('scans.runList.empty')"
                        @page="onPage"
                    >
                        <template #cell-repo="{row}">
                            <span v-if="row.owner && row.name">{{ row.owner }}/{{ row.name }}</span>
                            <span v-else class="text-muted">—</span>
                        </template>
                        <template #cell-status="{row}">
                            <span
                                v-if="row.error"
                                class="scans__status-wrap"
                                :title="row.error.message"
                            >
                                <CaomeiTag :tone="statusTone(row.status)">
                                    {{ statusLabelWithStage(row.status, row.failureStage) }}
                                </CaomeiTag>
                            </span>
                            <CaomeiTag
                                v-else
                                :tone="statusTone(row.status)"
                            >
                                {{ statusLabelWithStage(row.status, row.failureStage) }}
                            </CaomeiTag>
                        </template>
                        <template #cell-mode="{row}">
                            {{ runModeLabel(row.mode, t) }}
                        </template>
                        <template #cell-threshold="{row}">
                            {{ row.severityThreshold === 'all' ? t('common.severity.all') : row.severityThreshold }}
                        </template>
                        <template #cell-executor="{row}">
                            <CaomeiTag tone="neutral">
                                {{ runExecutorLabel(row.executorKind, t) }}
                            </CaomeiTag>
                        </template>
                        <template #cell-startedAt="{row}">
                            {{ row.startedAt ? d(new Date(row.startedAt), 'long') : '—' }}
                        </template>
                        <template #cell-alerts="{row}">
                            {{ alertsFound(row.summary) }}
                        </template>
                        <template #cell-fixed="{row}">
                            {{ (row.summary as Record<string, number> | null)?.alertsFixed ?? 0 }}
                        </template>
                        <template #cell-actions="{row}">
                            <CaomeiButton
                                variant="ghost"
                                rounded
                                size="sm"
                                :label="t('runs.actionViewDetail')"
                                :title="t('runs.actionViewDetail')"
                                @click="openRunDetail(row.id)"
                            >
                                <template #icon>
                                    <CaomeiIcon :icon="Eye" />
                                </template>
                            </CaomeiButton>
                        </template>
                    </CaomeiDataTable>
                </CaomeiCard>
                <p
                    v-else
                    class="text-muted"
                >
                    {{ t('common.empty.loading') }}
                </p>
            </CaomeiTabContent>
        </CaomeiTabs>

        <!-- 详情 dialog 兜底（/scans?run=xxx 触发；queryKey='run' 直接打开 detail） -->
        <repo-history-dialog query-key="run" />
    </div>
</template>

<style lang="scss" scoped>
.scans {
    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-5;

        h2 {
            margin: 0 0 $space-1;
        }

        p {
            margin: 0;
            font-size: $font-size-sm;
        }
    }

    &__header-actions {
        display: flex;
        align-items: center;
        gap: $space-2;
    }

    &__filter-banner {
        margin-bottom: $space-4;
    }

    &__filter-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-2;
    }

    &__summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: $space-4;
        margin-bottom: $space-5;
    }

    &__stat-value {
        font-size: $font-size-xl;
        font-weight: 600;
        color: var(--caomei-color-primary);

        &--sm {
            font-size: $font-size-base;
            font-weight: 500;
        }
    }

    &__stat-label {
        margin-top: $space-1;
        font-size: $font-size-sm;
    }

    &__tabs {
        margin-top: $space-2;
    }

    &__byrepo-toolbar {
        margin-bottom: $space-3;
    }

    &__window-hint {
        margin: $space-3 0 0;
        font-size: $font-size-sm;
    }

    &__run-filters {
        margin-bottom: $space-3;
    }

    &__run-filter-row {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: $space-3;
    }

    &__run-filter-field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        min-width: 180px;

        label {
            font-size: $font-size-sm;
        }

        &--action {
            min-width: 0;
        }
    }

    &__failure-summary {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: $space-2;
        margin-top: $space-3;
        font-size: $font-size-sm;
    }

    &__status-wrap {
        display: inline-flex;
        cursor: help;
    }
}

@media (width <= 900px) {
    .scans__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
