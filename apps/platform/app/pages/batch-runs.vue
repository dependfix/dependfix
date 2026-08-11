<script setup lang="ts">
// 批量运行：列表 + 展开详情（跨仓库聚合统计 + 下属 ScanRun）——定时/手动批量触发的进度与结果
import type { BatchRunRun, BatchRunSummary, BatchRunView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

const loading = ref(true)
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

/** 列表加载（存储值；详情展开时实时聚合） */
const fetchBatchRuns = async () => {
    loading.value = true
    error.value = ''
    try {
        batchRuns.value = await $fetch<BatchRunView[]>('/api/batch-runs')
    } catch (e: any) {
        error.value = t('batchRuns.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
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

// 进行中批次轮询（2s 间隔；组件卸载清理）——前端轮询详情即触发后端聚合收敛
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
        // 刷新已展开行的详情（保持聚合统计最新；含本轮刚到达终态的批次）
        for (const id of Object.keys(detailMap.value)) {
            if (prevRunningIds.includes(id) || runningIds.value.includes(id)) {
                await fetchDetail(id)
            }
        }
        // 无进行中批次 → 停止轮询（终态后不再刷新）
        if (runningIds.value.length === 0) {
            stopPolling()
        }
    }, 2000)
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
                @click="fetchBatchRuns"
            />
        </div>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>

        <Card v-if="!loading">
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
