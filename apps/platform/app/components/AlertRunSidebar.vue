<script setup lang="ts">
// alerts 视图受影响运行 Sidebar（todo.md §M15.1 UX-R2 + §M16.2 C66-D "立即修复此仓库"）。
//
// 设计要点：
// - 详情侧栏从 alerts.vue 抽出（todo.md §M16.2 audit lint warning：alerts.vue > 800 行触发 max-lines）
// - 三态：fixingRunId 跟踪当前行修复进度，并发守卫防重复点击
// - "立即修复此仓库" 按钮（pi-bolt）：仅 report-only 模式的运行可触发 fix（fix 模式已是终态）
// - 复用既有 run_id：useFixNow composable 携带 reuseScanRunId，服务端 skip createPendingScanRun
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
        affectedRunIds?: string[]
        occurrenceCount?: number
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
                    max: alert.affectedRunIds?.length ?? 0,
                    total: alert.occurrenceCount ?? 1
                }) }}
            </p>
            <div v-if="loading" class="text-muted">
                {{ t('common.empty.loading') }}
            </div>
            <DataTable
                v-else-if="runs.length > 0"
                :value="runs"
                striped-rows
                size="small"
            >
                <Column :header="t('alerts.detailRunId')">
                    <template #body="{data}">
                        <div class="alerts-run-cell">
                            <code :title="data.id">{{ shortRunId(data.id) }}</code>
                            <span>{{ modeLabel(data.mode) }}</span>
                            <small class="text-muted">
                                {{ data.severityThreshold }} · {{ executorLabel(data.executorKind) }}
                            </small>
                        </div>
                    </template>
                </Column>
                <Column :header="t('alerts.detailRunStatus')" field="status">
                    <template #body="{data}">
                        <Tag :value="data.status" :severity="alertsRunStatusSeverity(data.status)" />
                    </template>
                </Column>
                <Column :header="t('alerts.detailRunStartedAt')" field="startedAt">
                    <template #body="{data}">
                        <div class="alerts-run-cell">
                            <span>{{ data.startedAt ? d(new Date(data.startedAt), 'long') : '—' }}</span>
                            <small class="text-muted">{{ formatDuration(data) }}</small>
                        </div>
                    </template>
                </Column>
                <Column :header="t('alerts.detailRunAlertsFound')">
                    <template #body="{data}">
                        {{ alertsFound(data.summary) }}
                    </template>
                </Column>
                <Column :header="t('common.actions.actions')" :style="{width: '180px'}">
                    <template #body="{data}">
                        <div class="alerts-sidebar-actions">
                            <Button
                                icon="pi pi-eye"
                                text
                                rounded
                                size="small"
                                :aria-label="t('common.actions.details')"
                                @click="emit('view-detail', data)"
                            />
                            <Button
                                v-if="data.mode === 'report-only'"
                                icon="pi pi-bolt"
                                text
                                rounded
                                size="small"
                                :loading="fixingRunId === data.id"
                                :aria-label="t('alerts.fixNow.action')"
                                :title="t('alerts.fixNow.action')"
                                @click="triggerFix(data)"
                            />
                            <a
                                v-if="data.executorKind === 'github-action' && data.runUrl"
                                :href="data.runUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {{ t('alerts.detailRunOpen') }}
                            </a>
                            <span v-else class="text-muted">—</span>
                        </div>
                    </template>
                </Column>
            </DataTable>
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
