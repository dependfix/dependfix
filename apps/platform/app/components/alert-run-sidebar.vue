<script setup lang="ts">
// alerts 视图运行详情抽屉（含「立即修复此仓库」）。
//
// 设计要点：
// - 详情侧栏从 alerts.vue 抽出（避免 alerts.vue 超过 max-lines 800）
// - 三态：fixingRunId 跟踪当前行修复进度，并发守卫防重复点击
// - "立即修复此仓库" 按钮：仅 report-only 模式的运行可触发 fix（fix 模式已是终态）
// - 复用既有 run_id：useFixNow composable 携带 reuseScanRunId，服务端 skip createPendingScanRun
// - per-alert 模型下每个 alert 关联 1 个 run（runs.length 通常为 1）；
//   旧的 affectedRunIds 聚合字段已无意义，不再依赖
import type { DataTableColumn } from 'caomei-ui'
import { Eye, Zap } from '@lucide/vue'
import { alertsFound, formatRunDuration, runExecutorLabel, runModeLabel, shortRunId } from '~/utils/run-view'
import { useFixNow } from '~/composables/use-fix-now'
import { alertsRunStatusTone } from '~/utils/alerts-view'

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

const props = defineProps<{
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

/**
 * caomei Drawer 仅 emit `update:open`（无 `hide`）：用 computed 双向桥接既有 `visible` 契约，
 * 并由 `visible` 的 true→false 边沿补发 `hide`，覆盖「内建关闭按钮 / Esc / 遮罩」与
 * 「父级程序化置 false」两条路径（等价迁移前的 Sidebar 的 `hide` 语义，各发一次）。
 */
const drawerOpen = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
})

watch(() => props.visible, (value, previous) => {
    if (previous && !value) {
        emit('hide')
    }
})

const { fixingRunId, fixError, fixSuccess, triggerFix } = useFixNow()

const modeLabel = (mode: string) => runModeLabel(mode, t)
const executorLabel = (executorKind: string) => runExecutorLabel(executorKind, t)
const formatDuration = (run: AlertSidebarRun) => formatRunDuration(run.startedAt, run.finishedAt, t)

/** 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽） */
const columns = computed<DataTableColumn<AlertSidebarRun>[]>(() => [
    { key: 'runId', header: t('alerts.detailRunId') },
    { key: 'status', header: t('alerts.detailRunStatus') },
    { key: 'startedAt', header: t('alerts.detailRunStartedAt') },
    { key: 'alertsFound', header: t('alerts.detailRunAlertsFound') },
    { key: 'actions', header: t('common.actions.actions'), width: '180px' },
])
</script>

<template>
    <CaomeiDrawer
        v-model:open="drawerOpen"
        position="right"
        :style="{width: '560px'}"
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
            <CaomeiMessage
                v-if="fixError"
                tone="danger"
                :closable="false"
            >
                {{ fixError }}
            </CaomeiMessage>
            <CaomeiMessage
                v-if="fixSuccess"
                tone="success"
                :closable="false"
            >
                {{ fixSuccess }}
            </CaomeiMessage>
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
                    <CaomeiTag :tone="alertsRunStatusTone(row.status)">
                        {{ row.status }}
                    </CaomeiTag>
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
                        <CaomeiButton
                            variant="ghost"
                            rounded
                            size="sm"
                            :aria-label="t('common.actions.details')"
                            @click="emit('view-detail', row)"
                        >
                            <template #icon>
                                <CaomeiIcon :icon="Eye" />
                            </template>
                        </CaomeiButton>
                        <CaomeiButton
                            v-if="row.mode === 'report-only'"
                            variant="ghost"
                            rounded
                            size="sm"
                            :loading="fixingRunId === row.id"
                            :aria-label="t('alerts.fixNow.action')"
                            :title="t('alerts.fixNow.action')"
                            @click="triggerFix(row)"
                        >
                            <template #icon>
                                <CaomeiIcon :icon="Zap" />
                            </template>
                        </CaomeiButton>
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
    </CaomeiDrawer>
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
