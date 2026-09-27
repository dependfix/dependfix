<script setup lang="ts">
/**
 * M30.6 V1: DataTable 核心交互复现 - batch-runs.vue 迁移验证页
 * 用 caomei-ui 0.3.0 复现 PrimeVue 行展开 + 嵌套表格
 * 仅做验证，不进入生产代码
 */

import { ref, computed, onMounted } from 'vue'
import { useI18n } from '#imports'
import type { DataTableRowExpandEvent } from 'caomei-ui'

const { t, d } = useI18n()

interface BatchRunItem {
    id: string
    source: 'scheduled' | 'manual'
    createdAt: string
    mode: 'report-only' | 'fix' | 'fix-and-pr'
    severityThreshold: string
    repositoryCount: number
    pendingCount: number
    completedCount: number
    failedCount: number
    status: 'pending' | 'running' | 'completed' | 'failed' | 'dispatched'
    finishedAt: string | null
    summary: Record<string, unknown> | null
    runs: NestedRun[]
}

interface NestedRun {
    id: string
    owner: string
    name: string
    status: string
    executorKind: 'github-action' | 'sandbox' | 'platform-container'
    alertsFound: number
    alertsFixed: number
    error: { code: string, message: string } | null
    runUrl: string | null
}

const mockBatchRuns: BatchRunItem[] = [
    {
        id: 'br-1',
        source: 'scheduled',
        createdAt: '2024-03-28T10:00:00Z',
        mode: 'fix',
        severityThreshold: 'high',
        repositoryCount: 5,
        pendingCount: 0,
        completedCount: 4,
        failedCount: 1,
        status: 'completed',
        finishedAt: '2024-03-28T10:15:00Z',
        summary: { alertsTotal: 23, fixedCount: 18, severityCounts: { critical: 2, high: 8, medium: 10, low: 3 } },
        runs: [
            { id: 'r-1', owner: 'foo', name: 'bar', status: 'completed', executorKind: 'github-action', alertsFound: 5, alertsFixed: 4, error: null, runUrl: 'https://github.com/foo/bar/actions/runs/123' },
            { id: 'r-2', owner: 'foo', name: 'baz', status: 'completed', executorKind: 'sandbox', alertsFound: 3, alertsFixed: 3, error: null, runUrl: null },
            { id: 'r-3', owner: 'foo', name: 'qux', status: 'failed', executorKind: 'platform-container', alertsFound: 8, alertsFixed: 5, error: { code: 'timeout', message: 'Executor timeout after 30min' }, runUrl: 'https://platform.example.com/runs/r-3' },
            { id: 'r-4', owner: 'foo', name: 'corge', status: 'completed', executorKind: 'github-action', alertsFound: 4, alertsFixed: 4, error: null, runUrl: 'https://github.com/foo/corge/actions/runs/456' },
            { id: 'r-5', owner: 'foo', name: 'grault', status: 'completed', executorKind: 'sandbox', alertsFound: 3, alertsFixed: 2, error: null, runUrl: null },
        ],
    },
    {
        id: 'br-2',
        source: 'manual',
        createdAt: '2024-03-27T14:30:00Z',
        mode: 'fix-and-pr',
        severityThreshold: 'critical',
        repositoryCount: 3,
        pendingCount: 1,
        completedCount: 1,
        failedCount: 1,
        status: 'running',
        finishedAt: null,
        summary: { alertsTotal: 12, fixedCount: 4, severityCounts: { critical: 5, high: 4, medium: 2, low: 1 } },
        runs: [
            { id: 'r-6', owner: 'bar', name: 'repo1', status: 'running', executorKind: 'github-action', alertsFound: 2, alertsFixed: 1, error: null, runUrl: 'https://github.com/bar/repo1/actions/runs/789' },
            { id: 'r-7', owner: 'bar', name: 'repo2', status: 'completed', executorKind: 'sandbox', alertsFound: 6, alertsFixed: 2, error: null, runUrl: null },
            { id: 'r-8', owner: 'bar', name: 'repo3', status: 'failed', executorKind: 'platform-container', alertsFound: 4, alertsFixed: 1, error: { code: 'permission_denied', message: 'GitHub App missing repo scope' }, runUrl: 'https://platform.example.com/runs/r-8' },
        ],
    },
    {
        id: 'br-3',
        source: 'scheduled',
        createdAt: '2024-03-26T02:00:00Z',
        mode: 'report-only',
        severityThreshold: 'all',
        repositoryCount: 2,
        pendingCount: 0,
        completedCount: 2,
        failedCount: 0,
        status: 'completed',
        finishedAt: '2024-03-26T02:10:00Z',
        summary: { alertsTotal: 8, fixedCount: 0, severityCounts: { high: 3, medium: 4, low: 1 } },
        runs: [
            { id: 'r-9', owner: 'baz', name: 'service-a', status: 'completed', executorKind: 'github-action', alertsFound: 4, alertsFixed: 0, error: null, runUrl: 'https://github.com/baz/service-a/actions/runs/999' },
            { id: 'r-10', owner: 'baz', name: 'service-b', status: 'completed', executorKind: 'github-action', alertsFound: 4, alertsFixed: 0, error: null, runUrl: 'https://github.com/baz/service-b/actions/runs/111' },
        ],
    },
    {
        id: 'br-4',
        source: 'manual',
        createdAt: '2024-03-25T18:00:00Z',
        mode: 'fix',
        severityThreshold: 'medium',
        repositoryCount: 4,
        pendingCount: 2,
        completedCount: 1,
        failedCount: 1,
        status: 'dispatched',
        finishedAt: null,
        summary: { alertsTotal: 15, fixedCount: 3, severityCounts: { critical: 1, high: 6, medium: 5, low: 3 } },
        runs: [
            { id: 'r-11', owner: 'qux', name: 'app1', status: 'dispatched', executorKind: 'github-action', alertsFound: 0, alertsFixed: 0, error: null, runUrl: 'https://github.com/qux/app1/actions/runs/222' },
            { id: 'r-12', owner: 'qux', name: 'app2', status: 'pending', executorKind: 'sandbox', alertsFound: 0, alertsFixed: 0, error: null, runUrl: null },
            { id: 'r-13', owner: 'qux', name: 'app3', status: 'completed', executorKind: 'platform-container', alertsFound: 5, alertsFixed: 2, error: null, runUrl: null },
            { id: 'r-14', owner: 'qux', name: 'app4', status: 'failed', executorKind: 'github-action', alertsFound: 10, alertsFixed: 1, error: { code: 'merge_conflict', message: 'Auto-fix branch has conflicts' }, runUrl: 'https://github.com/qux/app4/actions/runs/333' },
        ],
    },
]

const expandedRows = ref<string[]>([])
const sortMeta = ref<{ field: string, order: 1 | -1 }[]>([{ field: 'createdAt', order: -1 }])

const modeLabel = (mode: string) => ({ 'report-only': '仅报告', fix: '自动修复', 'fix-and-pr': '修复+PR' })[mode] ?? mode
const severityLabel = (s: string) => ({ critical: 'Critical', high: 'High', medium: 'Medium', all: '全部' })[s] ?? s

const statusTag = (status: string) => {
    if (status === 'completed') return { label: '已完成', tone: 'success' as const }
    if (status === 'failed') return { label: '失败', tone: 'danger' as const }
    if (status === 'dispatched') return { label: '已分发', tone: 'info' as const }
    return { label: '进行中', tone: 'warn' as const }
}

const runStatusLabel = (status: string) => ({
    pending: '等待中', running: '运行中', completed: '已完成',
    failed: '失败', dispatched: '已分发',
})[status] ?? status

const runStatusTone = (status: string) => {
    if (status === 'completed') return 'success' as const
    if (status === 'failed') return 'danger' as const
    if (status === 'dispatched') return 'info' as const
    return 'warn' as const
}

const executorLabel = (kind: string) => ({
    'github-action': 'GitHub Action',
    sandbox: '沙箱容器',
    'platform-container': '平台容器',
})[kind] ?? kind

const isRowExpanded = (id: string) => expandedRows.value.includes(id)
const toggleRow = (id: string) => {
    expandedRows.value = isRowExpanded(id)
        ? expandedRows.value.filter((r) => r !== id)
        : [...expandedRows.value, id]
}

const onRowExpand = (event: DataTableRowExpandEvent<BatchRunItem>) => {
    console.log('[V1] BatchRun Row expand:', event.data.id)
    pushEvent('row-expand', { id: event.data.id, repositoryCount: event.data.repositoryCount })
}
const onRowCollapse = (event: DataTableRowExpandEvent<BatchRunItem>) => {
    console.log('[V1] BatchRun Row collapse:', event.data.id)
    pushEvent('row-collapse', { id: event.data.id })
}

const onSort = (event: { sortField: string, sortOrder: string }) => {
    console.log('[V1] BatchRun Sort:', event)
    pushEvent('sort', event)
}

const events = ref<{ type: string, data: unknown, timestamp: number }[]>([])
const pushEvent = (type: string, data: unknown) => {
    events.value.unshift({ type, data, timestamp: Date.now() })
    if (events.value.length > 20) events.value.pop()
}

const nestedColumns = [
    { key: 'owner', header: '仓库', accessor: 'owner', sortable: false },
    { key: 'runStatus', header: '状态', accessor: 'status', sortable: true },
    { key: 'executor', header: '执行器', accessor: 'executorKind', sortable: false },
    { key: 'alerts', header: '告警数', accessor: 'alertsFound', sortable: true },
    { key: 'fixed', header: '已修复', accessor: 'alertsFixed', sortable: true },
    { key: 'result', header: '结果', sortable: false },
]

const columns = [
    { key: 'source', header: '来源', accessor: 'source', sortable: true },
    { key: 'createdAt', header: '创建时间', accessor: 'createdAt', sortable: true },
    { key: 'mode', header: '模式', accessor: 'mode', sortable: true },
    { key: 'params', header: '参数', sortable: false },
    { key: 'progress', header: '进度', accessor: 'repositoryCount', sortable: true },
    { key: 'status', header: '状态', accessor: 'status', sortable: true },
    { key: 'finishedAt', header: '完成时间', accessor: 'finishedAt', sortable: true },
]
</script>

<template>
    <div class="validation-page">
        <header class="validation-header">
            <h2>M30.6 V1: DataTable 核心交互验证 - batch-runs-table</h2>
            <p class="text-muted">
                caomei-ui 0.3.0 DataTable: 行展开 + 嵌套表格 + @row-expand
            </p>
        </header>

        <Card class="validation-table">
            <template #content>
                <CaomeiDataTable
                    :data="mockBatchRuns"
                    :columns="columns"
                    row-key="id"
                    :expanded-rows="expandedRows"
                    striped
                    hoverable
                    :empty-text="t('common.empty')"
                    size="sm"
                    @update:expanded-rows="(v: string[]) => expandedRows = v"
                    @row-expand="onRowExpand"
                    @row-collapse="onRowCollapse"
                >
                    <!-- Expander Column -->
                    <template #cell-source="{row}">
                        <div class="batch-source-cell">
                            <CaomeiButton
                                variant="ghost"
                                size="sm"
                                :aria-label="isRowExpanded(row.id) ? '收起' : '展开'"
                                @click.stop="toggleRow(row.id)"
                            >
                                <CaomeiIcon :name="isRowExpanded(row.id) ? 'chevron-down' : 'chevron-right'" size="xs" />
                            </CaomeiButton>
                            <CaomeiTag :tone="row.source === 'scheduled' ? 'info' : 'neutral'">
                                {{ row.source === 'scheduled' ? t('batchRuns.sourceScheduled') : t('batchRuns.sourceManual') }}
                            </CaomeiTag>
                        </div>
                    </template>

                    <template #cell-createdAt="{row}">
                        {{ d(new Date(row.createdAt), 'short') }}
                    </template>

                    <template #cell-mode="{row}">
                        {{ modeLabel(row.mode) }}
                    </template>

                    <template #cell-params="{row}">
                        {{ modeLabel(row.mode) }} · {{ severityLabel(row.severityThreshold) }}
                    </template>

                    <template #cell-progress="{row}">
                        <div class="progress-cell">
                            <span v-if="row.pendingCount > 0" class="text-muted">
                                {{ row.completedCount + row.failedCount }} / {{ row.repositoryCount }}
                            </span>
                            <span v-else>
                                {{ row.completedCount }} / {{ row.repositoryCount }}
                                <span v-if="row.failedCount > 0" class="text-danger"> (失败 {{ row.failedCount }}) </span>
                            </span>
                        </div>
                    </template>

                    <template #cell-status="{row}">
                        <div class="status-cell">
                            <CaomeiTag :tone="statusTag(row.status).tone">
                                {{ statusTag(row.status).label }}
                            </CaomeiTag>
                        </div>
                    </template>

                    <template #cell-finishedAt="{row}">
                        {{ row.finishedAt ? d(new Date(row.finishedAt), 'short') : '—' }}
                    </template>

                    <!-- Expansion Slot - 嵌套表格 -->
                    <template #expansion="{data, index}">
                        <div class="batch-expansion">
                            <div class="expansion-stats">
                                <div class="stat-item">
                                    <span class="stat-value">{{ data.summary?.alertsTotal ?? '—' }}</span>
                                    <span class="stat-label">{{ t('batchRuns.statAlertsTotal') }}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">{{ data.summary?.fixedCount ?? '—' }}</span>
                                    <span class="stat-label">{{ t('batchRuns.statFixedCount') }}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">{{ data.completedCount ?? '—' }} / {{ data.finishedCount ?? '—' }}</span>
                                    <span class="stat-label">{{ t('batchRuns.statSuccessFinished') }}</span>
                                </div>
                                <div
                                    v-for="(count, severity) in (data.summary?.severityCounts as Record<string, number> ?? {})"
                                    :key="severity"
                                    class="stat-item"
                                >
                                    <span class="stat-value">{{ count }}</span>
                                    <span class="stat-label">{{ severity }}</span>
                                </div>
                            </div>

                            <CaomeiDataTable
                                :data="data.runs"
                                :columns="nestedColumns"
                                row-key="id"
                                striped
                                hoverable
                                :empty-text="t('batchRuns.subEmpty')"
                                size="sm"
                            >
                                <template #cell-owner="{row}">
                                    {{ row.owner }}/{{ row.name }}
                                </template>
                                <template #cell-runStatus="{row}">
                                    <CaomeiTag :tone="runStatusTone(row.status)">
                                        {{ runStatusLabel(row.status) }}
                                    </CaomeiTag>
                                </template>
                                <template #cell-executor="{row}">
                                    {{ executorLabel(row.executorKind) }}
                                </template>
                                <template #cell-alerts="{row}">
                                    {{ row.alertsFound }}
                                </template>
                                <template #cell-fixed="{row}">
                                    {{ row.alertsFixed }}
                                </template>
                                <template #cell-result="{row}">
                                    <div class="result-cell">
                                        <span
                                            v-if="row.error"
                                            class="text-danger"
                                            :title="row.error.message"
                                        >{{ row.error.code }}</span>
                                        <a
                                            v-else-if="row.runUrl"
                                            :href="row.runUrl"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >{{ t('batchRuns.openRun') }}</a>
                                        <span v-else>—</span>
                                        <small v-if="row.status === 'dispatched' && row.error?.code === 'pr_creation_failed'" class="d-block mt-1 text-warning">
                                            PR 创建失败，请手动开 PR
                                        </small>
                                    </div>
                                </template>
                            </CaomeiDataTable>
                        </div>
                    </template>
                </CaomeiDataTable>
            </template>
        </Card>

        <!-- 事件日志面板 -->
        <Card class="validation-events">
            <template #header>
                交互事件日志 (最近 20 条)
            </template>
            <template #content>
                <div class="events-log">
                    <div
                        v-for="(e, i) in events"
                        :key="i"
                        class="event-entry"
                    >
                        <span class="event-time">{{ new Date(e.timestamp).toLocaleTimeString() }}</span>
                        <span class="event-type">{{ e.type }}</span>
                        <pre class="event-data">{{ JSON.stringify(e.data, null, 2) }}</pre>
                    </div>
                    <p v-if="events.length === 0" class="text-muted">
                        暂无交互事件
                    </p>
                </div>
            </template>
        </Card>
    </div>
</template>

<style lang="scss" scoped>
.validation-page {
    padding: $space-4 $space-5;
}

.validation-header {
    margin-bottom: $space-4;

    h2 {
        margin: 0 0 $space-1;
    }

    p {
        margin: 0;
        font-size: $font-size-sm;
    }
}

.validation-table {
    margin-bottom: $space-4;
}

.batch-source-cell {
    display: inline-flex;
    align-items: center;
    gap: $space-2;
}

.progress-cell {
    display: flex;
    align-items: center;
}

.status-cell {
    display: flex;
    align-items: center;
}

.batch-expansion {
    display: flex;
    flex-direction: column;
    gap: $space-3;
    padding: $space-3;
}

.expansion-stats {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
}

.stat-item {
    display: flex;
    flex-direction: column;
    gap: $space-1;
    min-width: 96px;
    padding: $space-2 $space-3;
    background-color: rgb(var(--caomei-color-primary), 0.05);
    border-radius: $radius-sm;
}

.stat-value {
    font-size: $font-size-lg;
    font-weight: 600;
}

.stat-label {
    font-size: $font-size-sm;
    color: var(--caomei-color-text-muted);
}

.result-cell {
    display: flex;
    flex-direction: column;
    gap: $space-1;
}

.validation-events {
    .events-log {
        max-height: 300px;
        overflow-y: auto;
    }

    .event-entry {
        display: flex;
        gap: $space-3;
        padding: $space-2 $space-3;
        border-bottom: 1px solid var(--caomei-color-border);
        font-size: $font-size-sm;

        &:last-child {
            border-bottom: none;
        }
    }

    .event-time {
        color: var(--caomei-color-text-muted);
        min-width: 80px;
    }

    .event-type {
        font-weight: 500;
        color: var(--caomei-color-primary);
        min-width: 180px;
    }

    .event-data {
        flex: 1;
        margin: 0;
        font-size: 10px;
        background: var(--caomei-color-bg-elevated);
        padding: $space-1 $space-2;
        border-radius: $radius-sm;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
    }
}
</style>
