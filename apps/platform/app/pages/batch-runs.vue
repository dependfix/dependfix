<script setup lang="ts">
// 批量运行：列表 + 展开详情（跨仓库聚合统计 + 下属 ScanRun）——定时/手动批量触发的进度与结果
import type { BatchRunRun, BatchRunSummary, BatchRunView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

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
    'report-only': '仅报告',
    fix: '修复',
    'fix-and-pr': '修复并建 PR',
})[mode] ?? mode

const severityLabel = (severity: string) => ({
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    all: '全部',
})[severity] ?? severity

const statusTag = (status: string) => {
    if (status === 'completed') {
        return { label: '已完成', severity: 'success' as const }
    }
    if (status === 'failed') {
        return { label: '失败', severity: 'danger' as const }
    }
    return { label: '进行中', severity: 'warn' as const }
}

const runStatusLabel = (status: string) => ({
    pending: '等待中',
    running: '执行中',
    completed: '成功',
    failed: '失败',
    dispatched: '已触发',
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
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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
        error.value = `详情加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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
                <h2>批量运行</h2>
                <p class="text-muted">
                    定时计划 / 手动批量触发的跨仓库扫描汇总（展开查看聚合统计与各仓库结果）
                </p>
            </div>
            <Button
                icon="pi pi-refresh"
                label="刷新"
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
                    :empty-message="'暂无批量运行记录，可在仓库页勾选批量扫描或配置定时计划触发'"
                    @row-expand="onRowExpand"
                >
                    <Column expander style="width: 3rem" />
                    <Column header="触发来源">
                        <template #body="{data}">
                            <Tag
                                :value="data.source === 'scheduled' ? '定时触发' : '手动批量'"
                                :severity="data.source === 'scheduled' ? 'info' : 'secondary'"
                            />
                        </template>
                    </Column>
                    <Column header="触发时间">
                        <template #body="{data}">
                            {{ new Date(data.createdAt).toLocaleString() }}
                        </template>
                    </Column>
                    <Column header="参数">
                        <template #body="{data}">
                            {{ modeLabel(data.mode) }} · {{ severityLabel(data.severityThreshold) }}
                        </template>
                    </Column>
                    <Column header="进度">
                        <template #body="{data}">
                            <span v-if="data.pendingCount > 0" class="text-muted">
                                {{ data.completedCount + data.failedCount }}/{{ data.repositoryCount }} 完成
                            </span>
                            <span v-else>
                                完成 {{ data.completedCount }}/{{ data.repositoryCount }}
                                <span v-if="data.failedCount > 0" class="text-danger">（失败 {{ data.failedCount }}）</span>
                            </span>
                        </template>
                    </Column>
                    <Column header="状态">
                        <template #body="{data}">
                            <Tag :value="statusTag(data.status).label" :severity="statusTag(data.status).severity" />
                        </template>
                    </Column>
                    <Column header="完成时间">
                        <template #body="{data}">
                            {{ data.finishedAt ? new Date(data.finishedAt).toLocaleString() : '—' }}
                        </template>
                    </Column>
                    <template #expansion="{data}">
                        <div class="batch-runs__detail">
                            <div class="batch-runs__stats">
                                <div class="batch-runs__stat">
                                    <span class="batch-runs__stat-value">{{ detailMap[data.id]?.summary?.alertsTotal ?? '—' }}</span>
                                    <span class="batch-runs__stat-label">告警总数</span>
                                </div>
                                <div class="batch-runs__stat">
                                    <span class="batch-runs__stat-value">{{ detailMap[data.id]?.summary?.fixedCount ?? '—' }}</span>
                                    <span class="batch-runs__stat-label">修复数</span>
                                </div>
                                <div class="batch-runs__stat">
                                    <span class="batch-runs__stat-value">
                                        {{ detailMap[data.id] ? `${detailMap[data.id]?.completedCount ?? '—'}/${detailMap[data.id]?.finishedCount ?? '—'}` : '—' }}
                                    </span>
                                    <span class="batch-runs__stat-label">成功/完成</span>
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
                                :empty-message="'暂无下属扫描记录'"
                            >
                                <Column header="仓库">
                                    <template #body="{data: run}">
                                        {{ run.owner }}/{{ run.name }}
                                    </template>
                                </Column>
                                <Column header="状态">
                                    <template #body="{data: run}">
                                        <Tag :value="runStatusLabel(run.status)" :severity="runStatusSeverity(run.status)" />
                                    </template>
                                </Column>
                                <Column header="执行方式">
                                    <template #body="{data: run}">
                                        {{ run.executorKind === 'github-action' ? 'GitHub Action' : '平台容器' }}
                                    </template>
                                </Column>
                                <Column header="告警数">
                                    <template #body="{data: run}">
                                        {{ (run.summary as {alertsFound?: number} | null)?.alertsFound ?? '—' }}
                                    </template>
                                </Column>
                                <Column header="结果">
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
                                                打开运行
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
            加载中…
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
