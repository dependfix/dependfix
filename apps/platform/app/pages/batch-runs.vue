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
import type { BatchRunRun, BatchRunSummary, BatchRunView } from '~/types/platform'
import { reconcileBatchRuns } from '~/utils/reconcile-batch-runs'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

const BATCH_POLL_INTERVAL_MS = 60_000

// 三态分离（RG-B1 修复：UI 态与并发守卫必须解耦）：
// - firstLoad: 首屏骨架控制（true → 显示骨架；fetch 成功后 false → 显示 DataTable 且不再回滚）
// - loading: 手动刷新按钮 loading 反馈（首屏骨架由 firstLoad 单独控制，不影响 DataTable 折叠）
// - inflight: 实际请求是否 in-flight（并发守卫，与 UI 态解耦避免首屏请求被吞）
const firstLoad = ref(true)
const loading = ref(false)
const inflight = ref(false)
const error = ref('')
const batchRuns = ref<BatchRunView[]>([])
const expandedRows = ref<Record<string, boolean>>({})

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
        return { label: t('batchRuns.statusCompleted'), severity: 'success' as const }
    }
    if (status === 'failed') {
        return { label: t('batchRuns.statusFailed'), severity: 'danger' as const }
    }
    return { label: t('batchRuns.statusRunning'), severity: 'warn' as const }
}

const runStatusLabel = (status: string) => ({
    pending: t('batchRuns.runStatus.pending'),
    running: t('batchRuns.runStatus.running'),
    completed: t('batchRuns.runStatus.completed'),
    failed: t('batchRuns.runStatus.failed'),
    dispatched: t('batchRuns.runStatus.dispatched'),
})[status] ?? status

const runStatusSeverity = (status: string) => {
    if (status === 'completed') {
        return 'success' as const
    }
    if (status === 'failed') {
        return 'danger' as const
    }
    if (status === 'dispatched') {
        return 'info' as const
    }
    return 'warn' as const
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
        reconcileBatchRuns(batchRuns.value, fresh)
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
        // 同步列表行状态（详情聚合值覆盖存储值）
        const row = batchRuns.value.find((b) => b.id === id)
        if (row) {
            row.status = detail.status as BatchRunView['status']
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
            <Button
                icon="pi pi-refresh"
                :label="t('batchRuns.refresh')"
                severity="secondary"
                :loading="loading"
                @click="manualRefresh"
            />
        </div>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>

        <Card v-if="!firstLoad">
            <template #content>
                <DataTable
                    v-model:expanded-rows="expandedRows"
                    :value="batchRuns"
                    data-key="id"
                    striped-rows
                    size="small"
                    :empty-message="t('batchRuns.empty')"
                    @row-expand="onRowExpand"
                >
                    <Column expander style="width: 3rem" />
                    <Column :header="t('batchRuns.colSource')">
                        <template #body="{data}">
                            <Tag
                                :value="data.source === 'scheduled' ? t('batchRuns.sourceScheduled') : t('batchRuns.sourceManual')"
                                :severity="data.source === 'scheduled' ? 'info' : 'secondary'"
                            />
                        </template>
                    </Column>
                    <Column :header="t('batchRuns.colCreatedAt')">
                        <template #body="{data}">
                            {{ d(new Date(data.createdAt), 'long') }}
                        </template>
                    </Column>
                    <Column :header="t('batchRuns.colParams')">
                        <template #body="{data}">
                            {{ modeLabel(data.mode) }} · {{ severityLabel(data.severityThreshold) }}
                        </template>
                    </Column>
                    <Column :header="t('batchRuns.colProgress')">
                        <template #body="{data}">
                            <span v-if="data.pendingCount > 0" class="text-muted">
                                {{ t('batchRuns.progressPending', {done: data.completedCount + data.failedCount, total: data.repositoryCount}) }}
                            </span>
                            <span v-else>
                                {{ t('batchRuns.progressDone', {done: data.completedCount, total: data.repositoryCount}) }}
                                <span v-if="data.failedCount > 0" class="text-danger">{{ t('batchRuns.progressFailed', {count: data.failedCount}) }}</span>
                            </span>
                        </template>
                    </Column>
                    <Column :header="t('batchRuns.colStatus')">
                        <template #body="{data}">
                            <Tag :value="statusTag(data.status).label" :severity="statusTag(data.status).severity" />
                        </template>
                    </Column>
                    <Column :header="t('batchRuns.colFinishedAt')">
                        <template #body="{data}">
                            {{ data.finishedAt ? d(new Date(data.finishedAt), 'long') : '—' }}
                        </template>
                    </Column>
                    <template #expansion="{data}">
                        <div class="batch-runs__detail">
                            <div class="batch-runs__stats">
                                <div class="batch-runs__stat">
                                    <span class="batch-runs__stat-value">{{ detailMap[data.id]?.summary?.alertsTotal ?? '—' }}</span>
                                    <span class="batch-runs__stat-label">{{ t('batchRuns.statAlertsTotal') }}</span>
                                </div>
                                <div class="batch-runs__stat">
                                    <span class="batch-runs__stat-value">{{ detailMap[data.id]?.summary?.fixedCount ?? '—' }}</span>
                                    <span class="batch-runs__stat-label">{{ t('batchRuns.statFixedCount') }}</span>
                                </div>
                                <div class="batch-runs__stat">
                                    <span class="batch-runs__stat-value">
                                        {{ detailMap[data.id] ? `${detailMap[data.id]?.completedCount ?? '—'}/${detailMap[data.id]?.finishedCount ?? '—'}` : '—' }}
                                    </span>
                                    <span class="batch-runs__stat-label">{{ t('batchRuns.statSuccessFinished') }}</span>
                                </div>
                                <div
                                    v-for="(count, severity) in detailMap[data.id]?.summary?.severityCounts ?? {}"
                                    :key="severity"
                                    class="batch-runs__stat"
                                >
                                    <span class="batch-runs__stat-value">{{ count }}</span>
                                    <span class="batch-runs__stat-label">{{ severity }}</span>
                                </div>
                            </div>

                            <DataTable
                                :value="detailMap[data.id]?.runs ?? []"
                                size="small"
                                :empty-message="t('batchRuns.subEmpty')"
                            >
                                <Column :header="t('batchRuns.colRepo')">
                                    <template #body="{data: run}">
                                        {{ run.owner }}/{{ run.name }}
                                    </template>
                                </Column>
                                <Column :header="t('batchRuns.colStatus')">
                                    <template #body="{data: run}">
                                        <Tag :value="runStatusLabel(run.status)" :severity="runStatusSeverity(run.status)" />
                                    </template>
                                </Column>
                                <Column :header="t('batchRuns.colExecutor')">
                                    <template #body="{data: run}">
                                        {{ run.executorKind === 'github-action' ? t('repos.githubAction') : t('repos.platformContainer') }}
                                    </template>
                                </Column>
                                <Column :header="t('batchRuns.colAlerts')">
                                    <template #body="{data: run}">
                                        {{ (run.summary as {alertsFound?: number} | null)?.alertsFound ?? '—' }}
                                    </template>
                                </Column>
                                <Column :header="t('batchRuns.colResult')">
                                    <template #body="{data: run}">
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
                                    </template>
                                </Column>
                            </DataTable>
                        </div>
                    </template>
                </DataTable>
            </template>
        </Card>
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
