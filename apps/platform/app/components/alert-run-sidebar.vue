<script setup lang="ts">
// alerts 视图运行详情 Sidebar（todo.md §M15.1 UX-R2 + §M16.2 C66-D "立即修复此仓库"）。
//
// 设计要点：
// - 详情侧栏从 alerts.vue 抽出（todo.md §M16.2 audit lint warning：alerts.vue > 800 行触发 max-lines）
// - 三态：fixingRunId 跟踪当前行修复进度，并发守卫防重复点击
// - "立即修复此仓库" 按钮（pi-bolt）：仅 report-only 模式的运行可触发 fix（fix 模式已是终态）
// - 复用既有 run_id：useFixNow composable 携带 reuseScanRunId，服务端 skip createPendingScanRun
// - per-alert 模型下每个 alert 关联 1 个 run（todo.md §M20.3，runs.length 通常为 1）；
//   旧 todo.md §M13.2 §T1306 affectedRunIds 聚合字段已无意义，移除依赖
import type { DataTableColumn } from 'caomei-ui'
import { alertsFound, formatRunDuration, runExecutorLabel, runModeLabel, shortRunId } from '~/utils/run-view'
import { useFixNow } from '~/composables/use-fix-now'
import { alertsRunStatusSeverity } from '~/utils/alerts-view'

export interface AlertSidebarRun {
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

const { t, d } = useI18n()

defineProps<{
    visible: boolean
    alert: {
        packageName: string
        ruleId?: string | null
    } | null
    runs: AlertSidebarRun[]
    loading: boolean
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    hide: []
    'view-detail': [run: AlertSidebarRun]
}>()

const { fixingRunId, fixError, fixSuccess, triggerFix } = useFixNow()

const modeLabel = (mode: string) => runModeLabel(mode, t)
const executorLabel = (executorKind: string) => runExecutorLabel(executorKind, t)
const formatDuration = (run: AlertSidebarRun) => formatRunDuration(run.startedAt, run.finishedAt, t)

/** 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代 PrimeVue 的 `<Column>`） */
const columns = computed<DataTableColumn<AlertSidebarRun>[]>(() => [
    { key: 'runId', header: t('alerts.detailRunId') },
    { key: 'status', header: t('alerts.detailRunStatus') },
    { key: 'startedAt', header: t('alerts.detailRunStartedAt') },
    { key: 'alertsFound', header: t('alerts.detailRunAlertsFound') },
    { key: 'actions', header: t('common.actions.actions'), width: '180px' },
])

const onHide = () => {
    emit('hide')
}
</script>

<template>
    <Sidebar
        :visible="visible"
        position="right"
        :style="{width: '560px'}"
        @update:visible="(v: boolean) => emit('update:visible', v)"
        @hide="onHide"
    >
        <template v-if="alert" #header>
            <div class="alerts-sidebar-header">
                <strong>{{ alert.packageName }}</strong>
                <span v-if="alert.ruleId" class="text-muted">
                    · {{ alert.ruleId }}
                </span>
            </div>
        </template>
        <div v-if="alert" class="alerts-sidebar">
            <Message
                v-if="fixError"
                severity="error"
                :closable="false"
            >
                {{ fixError }}
            </Message>
            <Message
                v-if="fixSuccess"
                severity="success"
                :closable="false"
            >
                {{ fixSuccess }}
            </Message>
            <p class="alerts-sidebar-meta text-muted">
                {{ t('alerts.detailRunsTitle', {
                    total: runs.length
                }) }}
            </p>
            <div v-if="loading" class="text-muted">
                {{ t('common.empty.loading') }}
            </div>
            <CaomeiDataTable
                v-else-if="runs.length > 0"
                :data="runs"
                :columns="columns"
                row-key="id"
                striped
            >
                <template #cell-runId="{row}">
                    <div class="alerts-run-cell">
                        <code :title="row.id">{{ shortRunId(row.id) }}</code>
                        <span>{{ modeLabel(row.mode) }}</span>
                        <small class="text-muted">
                            {{ row.severityThreshold }} · {{ executorLabel(row.executorKind) }}
                        </small>
                    </div>
                </template>
                <template #cell-status="{row}">
                    <Tag :value="row.status" :severity="alertsRunStatusSeverity(row.status)" />
                </template>
                <template #cell-startedAt="{row}">
                    <div class="alerts-run-cell">
                        <span>{{ row.startedAt ? d(new Date(row.startedAt), 'long') : '—' }}</span>
                        <small class="text-muted">{{ formatDuration(row) }}</small>
                    </div>
                </template>
                <template #cell-alertsFound="{row}">
                    {{ alertsFound(row.summary) }}
                </template>
                <template #cell-actions="{row}">
                    <div class="alerts-sidebar-actions">
                        <Button
                            icon="pi pi-eye"
                            text
                            rounded
                            size="small"
                            :aria-label="t('common.actions.details')"
                            @click="emit('view-detail', row)"
                        />
                        <Button
                            v-if="row.mode === 'report-only'"
                            icon="pi pi-bolt"
                            text
                            rounded
                            size="small"
                            :loading="fixingRunId === row.id"
                            :aria-label="t('alerts.fixNow.action')"
                            :title="t('alerts.fixNow.action')"
                            @click="triggerFix(row)"
                        />
                        <a
                            v-if="row.executorKind === 'github-action' && row.runUrl"
                            :href="row.runUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {{ t('alerts.detailRunOpen') }}
                        </a>
                        <span v-else class="text-muted">—</span>
                    </div>
                </template>
            </CaomeiDataTable>
            <p v-else class="text-muted">
                {{ t('alerts.detailRunEmpty') }}
            </p>
        </div>
    </Sidebar>
</template>

<style lang="scss" scoped>
.alerts-sidebar {
    &-meta {
        margin-bottom: $space-3;
        font-size: $font-size-sm;
    }
}

.alerts-run-cell {
    display: flex;
    flex-direction: column;
    gap: $space-1;

    code {
        font-family: monospace;
        font-size: $font-size-sm;
    }
}

.alerts-sidebar-actions {
    display: flex;
    align-items: center;
    gap: $space-1;
}
</style>
