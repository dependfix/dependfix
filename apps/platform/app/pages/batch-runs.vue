<script setup lang="ts">
// 批量运行：列表 + 展开详情（跨仓库聚合统计 + 下属 ScanRun）——定时/手动批量触发的进度与结果
//
// 刷新策略：
// - 轮询节拍 60s（替代原 2s），仅 status==='running' 时启用，无运行中批次自动停止
// - 增量 reconcile：服务端返回 updatedAt，前端按 id 合并数组而非整表替换，
//   避免 PrimeVue DataTable 整表 reconcile 引发屏闪
// - 手动刷新按钮：点击立即拉取 + 重置下次轮询计时；in-flight 守卫防并发
// - 60s 节拍为 2026-08-19 用户反馈决策（backlog 原推荐 5s 实际仍嫌频繁；
//   running 批次平均 30s+ 进度变化有限，60s 已足够；保留 BATCH_POLL_INTERVAL_MS 常量便于后续微调）
// - sortable 字段：sortable + removableSort 三态（asc/desc/none）；与增量 reconcile 并存——
//   reconcile 只替换 updatedAt 变化行引用，不重排已排序数组；用户手动排序状态保留
import { CircleStop, RefreshCw } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
import type { BatchRunRun, BatchRunSummary, BatchRunView } from '~/types/platform'
import { reconcileBatchRuns } from '~/utils/reconcile-batch-runs'
import { updateStatusRank, withStatusRank } from '~/utils/sort-helpers'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

// 破坏性操作二次确认（caomei 内置 Confirm Dialog，provider 挂载在 app.vue）
const confirmDialog = useConfirm()

const BATCH_POLL_INTERVAL_MS = 60_000

// 三态分离（UI 态与并发守卫必须解耦）：
// - firstLoad: 首屏骨架控制（true → 显示骨架；fetch 成功后 false → 显示 DataTable 且不再回滚）
// - loading: 手动刷新按钮 loading 反馈（首屏骨架由 firstLoad 单独控制，不影响 DataTable 折叠）
// - inflight: 实际请求是否 in-flight（并发守卫，与 UI 态解耦避免首屏请求被吞）
const firstLoad = ref(true)
const loading = ref(false)
const inflight = ref(false)
const error = ref('')
const batchRuns = ref<BatchRunView[]>([])
// caomei DataTable 的行展开为「行 key 数组」（PrimeVue 的 `expandedRows` 是 Record<key, boolean>，
// 迁移时按 caomei 契约改写；row-key 同为 'id'）
const expandedRows = ref<string[]>([])
const onUpdateExpandedRows = (rows: string[]) => {
    expandedRows.value = rows
}

// 展开详情缓存（id → 详情响应；轮询时复用已展开行）
const detailMap = ref<Record<string, {
    summary: BatchRunSummary
    status: string
    finishedCount: number
    completedCount: number
    failedCount: number
    pendingCount: number
    finishedAt: string | null
    runs: BatchRunRun[]
}>>({})

const modeLabel = (mode: string) => ({
    'report-only': t('common.scanMode.reportOnly'),
    fix: t('common.scanMode.fix'),
    'fix-and-pr': t('common.scanMode.fixAndPr'),
})[mode] ?? mode

const severityLabel = (severity: string) => ({
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    all: t('common.severity.all'),
})[severity] ?? severity

const statusTag = (status: string) => {
    if (status === 'completed') {
        return { label: t('batchRuns.statusCompleted'), tone: 'success' as const }
    }
    if (status === 'failed') {
        return { label: t('batchRuns.statusFailed'), tone: 'danger' as const }
    }
    return { label: t('batchRuns.statusRunning'), tone: 'warning' as const }
}

const runStatusLabel = (status: string) => ({
    pending: t('batchRuns.runStatus.pending'),
    running: t('batchRuns.runStatus.running'),
    completed: t('batchRuns.runStatus.completed'),
    failed: t('batchRuns.runStatus.failed'),
    dispatched: t('batchRuns.runStatus.dispatched'),
})[status] ?? status

const runStatusTone = (status: string) => {
    if (status === 'completed') {
        return 'success' as const
    }
    if (status === 'failed') {
        return 'danger' as const
    }
    if (status === 'dispatched') {
        return 'primary' as const
    }
    return 'warning' as const
}

/** 列表加载（增量 reconcile 而非整表替换；in-flight 守卫与 UI 态解耦） */
const fetchBatchRuns = async () => {
    if (inflight.value) {
        return // 上一次尚未完成则跳过本轮（避免 setInterval 触发并发请求堆叠）
    }
    inflight.value = true
    loading.value = true
    error.value = ''
    try {
        const fresh = await $fetch<BatchRunView[]>('/api/batch-runs')
        // 排序键派生：status 走业务语义排序（running 优先）；reconcile 不重排已排序数组
        const enriched = withStatusRank(fresh)
        reconcileBatchRuns(batchRuns.value, enriched)
        firstLoad.value = false // 首次 fetch 成功后关闭骨架；失败保留骨架允许重试
    } catch (e: any) {
        error.value = t('batchRuns.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        inflight.value = false
        loading.value = false
    }
}

/** 已展开行详情刷新（轮询体与 manualRefresh 共用；收敛点见审计 RG-W1）
 * 仅刷新 prevRunningIds ∪ currentRunningIds 命中的展开行——终态后的展开行不重复拉取 */
const refreshOpenDetails = async (prevRunningIds: string[]) => {
    for (const id of Object.keys(detailMap.value)) {
        if (prevRunningIds.includes(id) || runningIds.value.includes(id)) {
            await fetchDetail(id)
        }
    }
}

/** 手动刷新：in-flight 守卫防并发；startPolling 内部 clearInterval 旧 timer 自然重置节拍 */
const manualRefresh = async () => {
    if (inflight.value) {
        return // 守卫：与 setInterval / 脚本触发重叠时跳过
    }
    const prevRunningIds = [...runningIds.value]
    await fetchBatchRuns()
    // 手动刷新后同步刷新展开详情，避免 reconcile 替换行引用导致聚合值退回存储值
    await refreshOpenDetails(prevRunningIds)
    if (runningIds.value.length > 0) {
        startPolling()
    }
}

/** 展开行 → 拉取详情（后端实时聚合写回，返回最新计数/状态/统计） */
const fetchDetail = async (id: string) => {
    try {
        const detail = await $fetch<{
            summary: BatchRunSummary
            status: string
            finishedCount: number
            completedCount: number
            failedCount: number
            pendingCount: number
            finishedAt: string | null
            runs: BatchRunRun[]
        }>(`/api/batch-runs/${id}`)
        detailMap.value[id] = detail
        // 同步列表行状态（详情聚合值覆盖存储值，同步派生 _statusRank）
        const row = batchRuns.value.find((b) => b.id === id)
        if (row) {
            updateStatusRank(row, detail.status)
            row.finishedCount = detail.finishedCount
            row.completedCount = detail.completedCount
            row.failedCount = detail.failedCount
            row.pendingCount = detail.pendingCount
            row.finishedAt = detail.finishedAt
            row.summary = detail.summary
        }
    } catch (e: any) {
        error.value = t('batchRuns.errors.detailLoadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    }
}

const onRowExpand = (event: { data: BatchRunView }) => {
    void fetchDetail(event.data.id)
}

/** 强制结束卡住的 BatchRun（应急逃生口）
 * 仅 admin 角色可触发；后端幂等（已终态直接返回）；成功后刷新列表 */
const forceFailing = ref<Record<string, boolean>>({})
const forceFail = async (id: string): Promise<void> => {
    if (forceFailing.value[id]) return
    if (!await confirmDialog.open({ title: t('batchRuns.forceFailConfirm'), tone: 'danger' })) return
    forceFailing.value[id] = true
    try {
        await $fetch(`/api/batch-runs/${id}/force-fail`, { method: 'POST' })
        // 成功后立刻刷新列表 + 清掉展开详情缓存（终态后详情陈旧）
        delete detailMap.value[id]
        await fetchBatchRuns()
    } catch (e: any) {
        error.value = t('batchRuns.errors.forceFailFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        forceFailing.value[id] = false
    }
}

// 进行中批次轮询（60s 间隔；组件卸载清理）——前端轮询详情即触发后端聚合收敛
let pollTimer: ReturnType<typeof setInterval> | null = null
const runningIds = computed(() => batchRuns.value.filter((b) => b.status === 'running').map((b) => b.id))

const startPolling = () => {
    if (pollTimer) {
        clearInterval(pollTimer)
    }
    pollTimer = setInterval(async () => {
        // 先记录本轮前仍运行中的批次（到达终态的那轮也要先刷新详情快照再停止）
        const prevRunningIds = [...runningIds.value]
        await fetchBatchRuns()
        await refreshOpenDetails(prevRunningIds)
        // 无进行中批次 → 停止轮询（终态后不再刷新）
        if (runningIds.value.length === 0) {
            stopPolling()
        }
    }, BATCH_POLL_INTERVAL_MS)
}

const stopPolling = () => {
    if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
    }
}

onMounted(async () => {
    await fetchBatchRuns()
    if (runningIds.value.length > 0) {
        startPolling()
    }
})

onUnmounted(stopPolling)

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代 PrimeVue 的 `<Column>`）。
 * - `expander: true` 列即 PrimeVue `<Column expander>`（表头留空，单元格渲染展开/收起按钮）
 * - `_statusRank` 保留为排序字段（与 sort-helpers 的 rank 注入一致）；原 `:default-sort-order="-1"`
 *   仅影响初始排序方向，而本页初始无排序，故迁移后行为一致
 */
const columns = computed<DataTableColumn<BatchRunView>[]>(() => [
    { key: 'expander', width: '3rem', expander: true },
    { key: 'source', header: t('batchRuns.colSource'), sortable: true },
    { key: 'createdAt', header: t('batchRuns.colCreatedAt'), sortable: true },
    { key: 'params', header: t('batchRuns.colParams') },
    { key: 'repositoryCount', header: t('batchRuns.colProgress'), sortable: true },
    { key: '_statusRank', header: t('batchRuns.colStatus'), sortable: true },
    { key: 'finishedAt', header: t('batchRuns.colFinishedAt'), sortable: true },
])

/**
 * 展开区嵌套表格列定义（与 PrimeVue `<Column>` 等价，均不可排序）。
 * 这些是**虚拟列**：单元格内容全部由 `#cell-*` 插槽渲染，不要设为 sortable（无对应可排序字段）。
 */
const nestedColumns = computed<DataTableColumn<BatchRunRun>[]>(() => [
    { key: 'repo', header: t('runs.colRepo') },
    { key: 'runStatus', header: t('runs.colStatus') },
    { key: 'executor', header: t('runs.colExecutor') },
    { key: 'alerts', header: t('runs.colAlerts') },
    { key: 'result', header: t('runs.colResult') },
])
</script>

<template>
    <div class="batch-runs">
        <div class="batch-runs__header">
            <div>
                <h2>{{ t('batchRuns.title') }}</h2>
                <p class="text-muted">
                    {{ t('batchRuns.subtitle') }}
                </p>
            </div>
            <CaomeiButton
                variant="primary"
                tone="neutral"
                :loading="loading"
                @click="manualRefresh"
            >
                <template #icon>
                    <CaomeiIcon :icon="RefreshCw" />
                </template>
                {{ t('batchRuns.refresh') }}
            </CaomeiButton>
        </div>

        <CaomeiMessage
            v-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>

        <CaomeiCard v-if="!firstLoad">
            <CaomeiDataTable
                :data="batchRuns"
                :columns="columns"
                row-key="id"
                striped
                :expanded-rows="expandedRows"
                :empty-text="t('batchRuns.empty')"
                @update:expanded-rows="onUpdateExpandedRows"
                @row-expand="onRowExpand"
            >
                <template #cell-source="{row}">
                    <CaomeiTag :tone="row.source === 'scheduled' ? 'primary' : 'neutral'">
                        {{ row.source === 'scheduled' ? t('batchRuns.sourceScheduled') : t('batchRuns.sourceManual') }}
                    </CaomeiTag>
                </template>
                <template #cell-createdAt="{row}">
                    {{ d(new Date(row.createdAt), 'long') }}
                </template>
                <template #cell-params="{row}">
                    {{ modeLabel(row.mode) }} · {{ severityLabel(row.severityThreshold) }}
                </template>
                <template #cell-repositoryCount="{row}">
                    <span v-if="row.pendingCount > 0" class="text-muted">
                        {{ t('batchRuns.progressPending', {done: row.completedCount + row.failedCount, total: row.repositoryCount}) }}
                    </span>
                    <span v-else>
                        {{ t('batchRuns.progressDone', {done: row.completedCount, total: row.repositoryCount}) }}
                        <span v-if="row.failedCount > 0" class="text-danger">{{ t('batchRuns.progressFailed', {count: row.failedCount}) }}</span>
                    </span>
                </template>
                <template #cell-_statusRank="{row}">
                    <div class="batch-runs__status-cell">
                        <CaomeiTag :tone="statusTag(row.status).tone">
                            {{ statusTag(row.status).label }}
                        </CaomeiTag>
                        <CaomeiButton
                            v-if="row.status === 'running'"
                            tone="danger"
                            variant="ghost"
                            size="sm"
                            :loading="forceFailing[row.id]"
                            @click="forceFail(row.id)"
                        >
                            <template #icon>
                                <CaomeiIcon :icon="CircleStop" />
                            </template>
                            {{ t('batchRuns.forceFail') }}
                        </CaomeiButton>
                    </div>
                </template>
                <template #cell-finishedAt="{row}">
                    {{ row.finishedAt ? d(new Date(row.finishedAt), 'long') : '—' }}
                </template>
                <template #expansion="{data: row}">
                    <div class="batch-runs__detail">
                        <div class="batch-runs__stats">
                            <div class="batch-runs__stat">
                                <span class="batch-runs__stat-value">{{ detailMap[row.id]?.summary?.alertsTotal ?? '—' }}</span>
                                <span class="batch-runs__stat-label">{{ t('batchRuns.statAlertsTotal') }}</span>
                            </div>
                            <div class="batch-runs__stat">
                                <span class="batch-runs__stat-value">{{ detailMap[row.id]?.summary?.fixedCount ?? '—' }}</span>
                                <span class="batch-runs__stat-label">{{ t('batchRuns.statFixedCount') }}</span>
                            </div>
                            <div class="batch-runs__stat">
                                <span class="batch-runs__stat-value">
                                    {{ detailMap[row.id] ? `${detailMap[row.id]?.completedCount ?? '—'}/${detailMap[row.id]?.finishedCount ?? '—'}` : '—' }}
                                </span>
                                <span class="batch-runs__stat-label">{{ t('batchRuns.statSuccessFinished') }}</span>
                            </div>
                            <div
                                v-for="(count, severity) in detailMap[row.id]?.summary?.severityCounts ?? {}"
                                :key="severity"
                                class="batch-runs__stat"
                            >
                                <span class="batch-runs__stat-value">{{ count }}</span>
                                <span class="batch-runs__stat-label">{{ severity }}</span>
                            </div>
                        </div>

                        <CaomeiDataTable
                            :data="detailMap[row.id]?.runs ?? []"
                            :columns="nestedColumns"
                            :empty-text="t('batchRuns.subEmpty')"
                        >
                            <template #cell-repo="{row: run}">
                                {{ run.owner }}/{{ run.name }}
                            </template>
                            <template #cell-runStatus="{row: run}">
                                <CaomeiTag :tone="runStatusTone(run.status)">
                                    {{ runStatusLabel(run.status) }}
                                </CaomeiTag>
                            </template>
                            <template #cell-executor="{row: run}">
                                {{ run.executorKind === 'github-action' ? t('repos.githubAction') : run.executorKind === 'sandbox' ? t('repos.sandboxContainer') : t('repos.platformContainer') }}
                            </template>
                            <template #cell-alerts="{row: run}">
                                {{ (run.summary as {alertsFound?: number} | null)?.alertsFound ?? '—' }}
                            </template>
                            <template #cell-result="{row: run}">
                                <span
                                    v-if="run.error"
                                    class="text-danger"
                                    :title="run.error.message"
                                >
                                    {{ run.error.code }}
                                </span>
                                <span v-else-if="run.runUrl">
                                    <a
                                        :href="run.runUrl"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {{ t('batchRuns.openRun') }}
                                    </a>
                                </span>
                                <span v-else>—</span>
                                <!-- A 模式 PR 创建失败 → dispatched + branch URL 兜底，提示手动开 PR（背景见 docs/plan/todo.md §PR 系列已闭环条目） -->
                                <small
                                    v-if="run.status === 'dispatched' && run.error?.code === 'pr_creation_failed'"
                                    class="d-block mt-1 text-warning"
                                >
                                    {{ t('batchRuns.openRunPrFailedHint') }}
                                </small>
                            </template>
                        </CaomeiDataTable>
                    </div>
                </template>
            </CaomeiDataTable>
        </CaomeiCard>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>
    </div>
</template>

<style lang="scss" scoped>
.batch-runs {
    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }

    &__detail {
        display: flex;
        flex-direction: column;
        gap: $space-3;
        padding: $space-3;
    }

    &__stats {
        display: flex;
        flex-wrap: wrap;
        gap: $space-3;
    }

    &__status-cell {
        display: flex;
        align-items: center;
        gap: $space-2;
    }

    &__stat {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        min-width: 96px;
        padding: $space-2 $space-3;
        background-color: rgba($color-primary, 0.05);
        border-radius: $radius-sm;
    }

    &__stat-value {
        font-size: $font-size-lg;
        font-weight: 600;
    }

    &__stat-label {
        font-size: $font-size-sm;
        color: $color-text-muted;
    }
}
</style>
