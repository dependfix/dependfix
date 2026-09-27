<script setup lang="ts">
/**
 * M30.6 V1: DataTable 核心交互复现 - alerts.vue 迁移验证页
 * 用 caomei-ui 0.3.0 复现 PrimeVue 行分组/折叠/多列排序
 * 仅做验证，不进入生产代码
 */

import { ref, computed, onMounted } from 'vue'
import { useI18n } from '#imports'
import type { DataTableSortMeta, DataTableRowGroupEvent, DataTableRowExpandEvent } from 'caomei-ui'

const { t } = useI18n()

// 模拟告警数据
interface AlertItem {
    id: string
    repository: string
    packageName: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    source: string
    ruleId: string
    fixable: boolean
    recommendedVersion: string
    fixStatus: string
    occurrenceCount: number
    firstSeenAt: string
    lastSeenAt: string
    _severityRank: number
}

const mockAlerts: AlertItem[] = [
    // lodash (high)
    { id: '1', repository: 'foo/bar', packageName: 'lodash', severity: 'high', source: 'dependabot', ruleId: 'GHSA-123', fixable: true, recommendedVersion: '4.17.21', fixStatus: 'pending', occurrenceCount: 3, firstSeenAt: '2024-01-15', lastSeenAt: '2024-03-20', _severityRank: 4 },
    { id: '2', repository: 'foo/bar', packageName: 'lodash', severity: 'medium', source: 'code-scanning', ruleId: 'CVE-2021', fixable: true, recommendedVersion: '4.17.21', fixStatus: 'fixed', occurrenceCount: 2, firstSeenAt: '2024-02-10', lastSeenAt: '2024-02-15', _severityRank: 3 },
    { id: '3', repository: 'foo/bar', packageName: 'lodash', severity: 'high', source: 'pnpm-audit', ruleId: 'GHSA-456', fixable: false, recommendedVersion: '4.17.21', fixStatus: 'failed', occurrenceCount: 1, firstSeenAt: '2024-03-01', lastSeenAt: '2024-03-01', _severityRank: 4 },
    // axios (low)
    { id: '4', repository: 'foo/baz', packageName: 'axios', severity: 'low', source: 'dependabot', ruleId: 'GHSA-789', fixable: true, recommendedVersion: '1.6.0', fixStatus: 'pending', occurrenceCount: 1, firstSeenAt: '2024-01-20', lastSeenAt: '2024-01-20', _severityRank: 2 },
    { id: '5', repository: 'foo/baz', packageName: 'axios', severity: 'low', source: 'code-quality', ruleId: 'CVE-2022', fixable: false, recommendedVersion: '1.6.0', fixStatus: 'pending', occurrenceCount: 1, firstSeenAt: '2024-02-05', lastSeenAt: '2024-02-05', _severityRank: 2 },
    // minimist (critical)
    { id: '6', repository: 'foo/bar', packageName: 'minimist', severity: 'critical', source: 'dependabot', ruleId: 'GHSA-000', fixable: true, recommendedVersion: '1.2.7', fixStatus: 'pending', occurrenceCount: 5, firstSeenAt: '2023-12-01', lastSeenAt: '2024-03-25', _severityRank: 5 },
    // express (high)
    { id: '7', repository: 'foo/qux', packageName: 'express', severity: 'high', source: 'dependabot', ruleId: 'GHSA-111', fixable: true, recommendedVersion: '4.18.2', fixStatus: 'pending', occurrenceCount: 2, firstSeenAt: '2024-02-15', lastSeenAt: '2024-03-10', _severityRank: 4 },
    { id: '8', repository: 'foo/qux', packageName: 'express', severity: 'medium', source: 'code-scanning', ruleId: 'CVE-2023', fixable: true, recommendedVersion: '4.18.2', fixStatus: 'fixed', occurrenceCount: 1, firstSeenAt: '2024-03-01', lastSeenAt: '2024-03-01', _severityRank: 3 },
    // react (critical)
    { id: '9', repository: 'foo/corge', packageName: 'react', severity: 'critical', source: 'dependabot', ruleId: 'GHSA-222', fixable: true, recommendedVersion: '18.2.0', fixStatus: 'pending', occurrenceCount: 4, firstSeenAt: '2024-01-01', lastSeenAt: '2024-03-28', _severityRank: 5 },
    { id: '10', repository: 'foo/corge', packageName: 'react', severity: 'high', source: 'pnpm-audit', ruleId: 'CVE-2024', fixable: false, recommendedVersion: '18.2.0', fixStatus: 'failed', occurrenceCount: 1, firstSeenAt: '2024-03-20', lastSeenAt: '2024-03-20', _severityRank: 4 },
]

const viewMode = ref<'package' | 'repository' | 'none'>('package')

// 多列排序：默认 severity desc + packageName asc
const multiSortMeta = ref<DataTableSortMeta[]>([
    { field: '_severityRank', order: -1 },
    { field: 'packageName', order: 1 },
])

// 可折叠分组
const expandedRowGroups = ref<string[]>([])

// 行展开（用于展示详情）
const expandedRows = ref<string[]>([])

const sortMode = ref<'single' | 'multiple'>('multiple')
const sortDescFirst = ref(true)

const viewModeOptions = computed(() => [
    { label: '按包', value: 'package' as const },
    { label: '按项目', value: 'repository' as const },
    { label: '原始列表', value: 'none' as const },
])

const severityOptions = computed(() => [
    { label: '全部', value: 'all' },
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
])

const sourceOptions = computed(() => [
    { label: '全部', value: 'all' },
    { label: 'Dependabot', value: 'dependabot' },
    { label: 'Code Scanning', value: 'code-scanning' },
    { label: 'Code Quality', value: 'code-quality' },
    { label: 'pnpm audit', value: 'pnpm-audit' },
])

const filteredAlerts = computed(() => mockAlerts)

const groupRowsBy = computed(() => viewMode.value === 'package' ? 'packageName' : 'repository')
const rowGroupMode = computed(() => viewMode.value === 'none' ? undefined : 'subheader')
const expandableRowGroups = computed(() => viewMode.value !== 'none')

const onViewModeChange = () => {
    const severityFirst: DataTableSortMeta = { field: '_severityRank', order: -1 }
    const groupField = viewMode.value === 'package' ? 'packageName' : 'repository'
    multiSortMeta.value = viewMode.value === 'none'
        ? [severityFirst]
        : [severityFirst, { field: groupField, order: 1 }]
    expandedRowGroups.value = []
}

const groupKeyOf = (a: AlertItem): string => {
    if (viewMode.value === 'repository') {
        return a.repository
    }
    return a.packageName
}

const groupCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const a of filteredAlerts.value) {
        const key = groupKeyOf(a)
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
})

const groupHeaderLabel = (data: Record<string, unknown>): string => {
    if (viewMode.value === 'repository') {
        return data.repository as string
    }
    return data.packageName as string
}

const isGroupExpanded = (key: string) => expandedRowGroups.value.includes(key)
const toggleGroup = (key: string) => {
    expandedRowGroups.value = isGroupExpanded(key)
        ? expandedRowGroups.value.filter((p) => p !== key)
        : [...expandedRowGroups.value, key]
}

const isRowExpanded = (id: string) => expandedRows.value.includes(id)
const toggleRow = (id: string) => {
    expandedRows.value = isRowExpanded(id)
        ? expandedRows.value.filter((r) => r !== id)
        : [...expandedRows.value, id]
}

const onGroupExpand = (event: DataTableRowGroupEvent) => {
    console.log('[V1] Group expand:', event.data)
}
const onGroupCollapse = (event: DataTableRowGroupEvent) => {
    console.log('[V1] Group collapse:', event.data)
}
const onRowExpand = (event: DataTableRowExpandEvent<AlertItem>) => {
    console.log('[V1] Row expand:', event.data.packageName)
}
const onRowCollapse = (event: DataTableRowExpandEvent<AlertItem>) => {
    console.log('[V1] Row collapse:', event.data.packageName)
}
const onSort = (event: { sortField: string, sortOrder: string, multiSortMeta?: DataTableSortMeta[] }) => {
    console.log('[V1] Sort:', event)
}
const onUpdateMultiSortMeta = (meta: DataTableSortMeta[]) => {
    console.log('[V1] Update multiSortMeta:', meta)
}
const onUpdateExpandedRowGroups = (groups: string[]) => {
    console.log('[V1] Update expandedRowGroups:', groups)
}
const onUpdateExpandedRows = (rows: string[]) => {
    console.log('[V1] Update expandedRows:', rows)
}

const severityTagMap: Record<string, string> = {
    critical: 'danger',
    high: 'warn',
    medium: 'info',
    low: 'success',
}
const severityLabel = (s: string) => ({ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' })[s] ?? s
const fixStatusLabel = (s: string) => ({ pending: '待处理', fixed: '已修复', failed: '失败' })[s] ?? s

// 用于验证的状态追踪
const events = ref<{ type: string, data: unknown, timestamp: number }[]>([])
const pushEvent = (type: string, data: unknown) => {
    events.value.unshift({ type, data, timestamp: Date.now() })
    if (events.value.length > 20) events.value.pop()
}
// 列定义
const columns = [
    {
        key: 'repository',
        header: '仓库',
        accessor: 'repository',
        sortable: true,
        width: '180px',
        expander: false, // 使用自定义 expander 列
    },
    {
        key: 'severity',
        header: '严重级别',
        accessor: '_severityRank',
        sortable: true,
        sortFn: 'basic',
    },
    {
        key: 'packageName',
        header: '包名',
        accessor: 'packageName',
        sortable: true,
    },
    {
        key: 'source',
        header: '来源',
        accessor: 'source',
        sortable: true,
    },
    {
        key: 'ruleId',
        header: 'Rule ID',
        accessor: 'ruleId',
        sortable: true,
        width: '150px',
    },
    {
        key: 'fixable',
        header: '可修复',
        accessor: 'fixable',
        sortable: true,
    },
    {
        key: 'recommendedVersion',
        header: '推荐版本',
        accessor: 'recommendedVersion',
        sortable: true,
    },
    {
        key: 'fixStatus',
        header: '修复状态',
        accessor: 'fixStatus',
        sortable: true,
    },
    {
        key: 'occurrenceCount',
        header: '出现次数',
        accessor: 'occurrenceCount',
        sortable: true,
    },
    {
        key: 'firstSeenAt',
        header: '首次发现',
        accessor: 'firstSeenAt',
        sortable: true,
    },
    {
        key: 'lastSeenAt',
        header: '最近发现',
        accessor: 'lastSeenAt',
        sortable: true,
    },
]

</script>

<template>
    <div class="validation-page">
        <header class="validation-header">
            <h2>M30.6 V1: DataTable 核心交互验证 - alerts-table</h2>
            <p class="text-muted">
                caomei-ui 0.3.0 DataTable: 行分组/折叠/多列排序/行展开
            </p>
        </header>

        <Card class="validation-controls">
            <template #content>
                <div class="controls-row">
                    <div class="control-field">
                        <label>视图模式</label>
                        <CaomeiSelect
                            v-model="viewMode"
                            :options="viewModeOptions"
                            option-label="label"
                            option-value="value"
                            @update:model-value="onViewModeChange"
                        />
                    </div>
                    <div class="control-field">
                        <label>排序模式</label>
                        <CaomeiSelect
                            v-model="sortMode"
                            :options="[
                                {label: '单列', value: 'single'},
                                {label: '多列', value: 'multiple'}
                            ]"
                            option-label="label"
                            option-value="value"
                        />
                    </div>
                    <div class="control-field">
                        <label>首次点击降序</label>
                        <CaomeiSwitch v-model="sortDescFirst" />
                    </div>
                    <div class="control-field">
                        <button class="btn-reset" @click="multiSortMeta = [{field: '_severityRank', order: -1}, {field: 'packageName', order: 1}]; expandedRowGroups = []">
                            重置排序/折叠
                        </button>
                    </div>
                </div>
            </template>
        </Card>

        <Card class="validation-table">
            <template #content>
                <CaomeiDataTable
                    :data="filteredAlerts"
                    :columns="columns"
                    row-key="id"
                    :multi-sort-meta="multiSortMeta"
                    :sort-mode="sortMode"
                    :sort-desc-first="sortDescFirst"
                    :row-group-mode="rowGroupMode"
                    :group-rows-by="groupRowsBy"
                    :expandable-row-groups="expandableRowGroups"
                    :expanded-row-groups="expandedRowGroups"
                    :expanded-rows="expandedRows"
                    striped
                    hoverable
                    size="sm"
                    :empty-text="t('common.empty')"
                    @update:multi-sort-meta="onUpdateMultiSortMeta"
                    @sort="onSort"
                    @update:expanded-row-groups="onUpdateExpandedRowGroups"
                    @row-group-expand="onGroupExpand"
                    @row-group-collapse="onGroupCollapse"
                    @update:expanded-rows="onUpdateExpandedRows"
                    @row-expand="onRowExpand"
                    @row-collapse="onRowCollapse"
                >
                    <!-- Group Header Slot -->
                    <template v-if="viewMode !== 'none'" #groupheader="{data}">
                        <div
                            class="validation-group-header"
                            tabindex="0"
                            @click="toggleGroup(groupHeaderLabel(data))"
                            @keydown.enter.prevent="toggleGroup(groupHeaderLabel(data))"
                        >
                            <span class="validation-group-toggle" :class="{expanded: isGroupExpanded(groupHeaderLabel(data))}">
                                <CaomeiIcon :name="isGroupExpanded(groupHeaderLabel(data)) ? 'chevron-down' : 'chevron-right'" size="sm" />
                            </span>
                            <strong>{{ groupHeaderLabel(data) }}</strong>
                            <span class="validation-group-count">{{ groupCounts.get(groupHeaderLabel(data)) ?? 0 }} 项</span>
                        </div>
                    </template>

                    <!-- Row Expander Column -->
                    <template #cell-repository="{row}">
                        <div class="validation-repo-cell">
                            <CaomeiButton
                                v-if="!isRowExpanded(row.id)"
                                variant="ghost"
                                size="sm"
                                aria-label="展开详情"
                                @click.stop="toggleRow(row.id)"
                            >
                                <CaomeiIcon name="chevron-right" size="xs" />
                            </CaomeiButton>
                            <CaomeiButton
                                v-else
                                variant="ghost"
                                size="sm"
                                aria-label="收起详情"
                                @click.stop="toggleRow(row.id)"
                            >
                                <CaomeiIcon name="chevron-down" size="xs" />
                            </CaomeiButton>
                            <span>{{ row.repository }}</span>
                        </div>
                    </template>

                    <template #cell-severity="{row}">
                        <CaomeiTag :tone="severityTagMap[row.severity]" :rounded="true">
                            {{ severityLabel(row.severity) }}
                        </CaomeiTag>
                    </template>

                    <template #cell-source="{row}">
                        <CaomeiTag tone="neutral">
                            {{ row.source }}
                        </CaomeiTag>
                    </template>

                    <template #cell-fixStatus="{row}">
                        <CaomeiTag tone="neutral">
                            {{ fixStatusLabel(row.fixStatus) }}
                        </CaomeiTag>
                    </template>

                    <!-- Expansion Slot for Row Detail -->
                    <template #expansion="{data}">
                        <div class="validation-expansion">
                            <div class="expansion-grid">
                                <div><strong>Rule ID:</strong> {{ data.ruleId }}</div>
                                <div><strong>Fixable:</strong> {{ data.fixable ? '是' : '否' }}</div>
                                <div><strong>Recommended:</strong> {{ data.recommendedVersion }}</div>
                                <div><strong>Occurrences:</strong> {{ data.occurrenceCount }}</div>
                                <div><strong>First Seen:</strong> {{ data.firstSeenAt }}</div>
                                <div><strong>Last Seen:</strong> {{ data.lastSeenAt }}</div>
                                <div><strong>Severity Rank:</strong> {{ data._severityRank }}</div>
                            </div>
                        </div>
                    </template>
                </CaomeiDataTable>
            </template>
        </Card>

        <!-- 事件日志面板（验证交互触发） -->
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

.validation-controls {
    margin-bottom: $space-4;

    .controls-row {
        display: flex;
        align-items: flex-end;
        gap: $space-4;
        flex-wrap: wrap;
    }

    .control-field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        min-width: 160px;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }

    .btn-reset {
        padding: $space-2 $space-3;
        background: var(--caomei-color-bg-elevated);
        border: 1px solid var(--caomei-color-border);
        border-radius: $radius-sm;
        font-size: $font-size-sm;
        cursor: pointer;

        &:hover {
            background: var(--caomei-color-border);
        }
    }
}

.validation-table {
    margin-bottom: $space-4;
}

.validation-group-header {
    display: inline-flex;
    align-items: baseline;
    gap: $space-2;
    cursor: pointer;
    user-select: none;

    &:focus-visible {
        outline: 2px solid var(--caomei-color-primary);
        outline-offset: 2px;
    }
}

.validation-group-toggle {
    display: inline-flex;
    transition: transform 0.2s;

    &.expanded {
        transform: rotate(90deg);
    }
}

.validation-group-count {
    font-size: $font-size-sm;
    color: var(--caomei-color-text-muted);
}

.validation-repo-cell {
    display: inline-flex;
    align-items: center;
    gap: $space-2;
}

.validation-expansion {
    padding: $space-3 0;
}

.expansion-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: $space-2 $space-4;
    font-size: $font-size-sm;
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
