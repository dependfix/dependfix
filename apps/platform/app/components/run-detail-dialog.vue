<script setup lang="ts">
import type { DataTableColumn } from 'caomei-ui'
import {
    alertsFound,
    formatRunDuration,
    runExecutorLabel,
    runModeLabel,
    runThresholdLabel,
    shortRunId,
} from '~/utils/run-view'

interface RunResultView {
    id: string
    packageName: string
    severity: string
    source: string
    fixable: boolean
    recommendedVersion: string | null
    htmlUrl: string | null
}

interface RunDetailView {
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
    results: RunResultView[]
    /**
     * AI 研判用量聚合（todo.md §M26.1 + [platform-ai-integration.md §RunDetailDialog AI 用量 section](../design/governance/platform-ai-integration.md)）。
     * - 当次扫描未启用 AI 研判时为 null（前端条件渲染隐藏整个 section）
     * - 字段：calls / inputTokens / outputTokens / totalTokens / estimatedCostUsd
     */
    aiUsage?: {
        calls: number
        inputTokens: number
        outputTokens: number
        totalTokens: number
        estimatedCostUsd: number
    } | null
    logs?: Array<{ timestamp: string, level: string, message: string }>
    logsText?: string | null
}

const props = defineProps<{
    visible: boolean
    runId: string | null
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
}>()

const { t, d } = useI18n()

/** 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代 PrimeVue 的 `<Column>`） */
const resultColumns = computed<DataTableColumn<RunResultView>[]>(() => [
    { key: 'packageName', header: t('runs.colPackage') },
    { key: 'severity', header: t('runs.colSeverity') },
    { key: 'source', header: t('runs.colSource') },
    { key: 'fixable', header: t('runs.colFixable') },
    { key: 'recommendedVersion', header: t('runs.colRecommended') },
    { key: 'link', header: t('runs.colLink') },
])

const detail = ref<RunDetailView | null>(null)
const loading = ref(false)
const error = ref('')
let requestSequence = 0

const visible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
})

const modeLabel = (mode: string) => runModeLabel(mode, t)
const executorLabel = (executorKind: string) => runExecutorLabel(executorKind, t)
const thresholdLabel = (severityThreshold: string) => runThresholdLabel(severityThreshold, t)
const formatDuration = (startedAt: string | null, finishedAt: string | null) => formatRunDuration(startedAt, finishedAt, t)

const statusLabel = (status: string) => ({
    completed: t('runs.statusCompleted'),
    failed: t('runs.statusFailed'),
    dispatched: t('runs.statusDispatched'),
    running: t('runs.statusRunning'),
    degraded: t('runs.statusDegraded'),
})[status] ?? status

const statusSeverity = (status: string) => {
    switch (status) {
        case 'completed':
            return 'success' as const
        case 'failed':
            return 'danger' as const
        case 'dispatched':
            return 'info' as const
        default:
            return 'warn' as const
    }
}

const formatLogTime = (timestamp: string) => {
    try {
        const date = new Date(timestamp)
        return date.toLocaleTimeString('zh-CN', { hour12: false })
    } catch {
        return timestamp
    }
}

const copyLogs = async () => {
    if (!detail.value?.logsText) {
        return
    }
    try {
        await navigator.clipboard.writeText(detail.value.logsText)
    } catch {
        // 降级方案
        const textarea = document.createElement('textarea')
        textarea.value = detail.value.logsText
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
    }
}

const dialogTitle = computed(() => (
    props.runId ? `${t('runs.dialogTitle')} · ${shortRunId(props.runId)}` : t('runs.dialogTitle')
))

const reset = () => {
    requestSequence += 1
    detail.value = null
    loading.value = false
    error.value = ''
}

const loadDetail = async (runId: string) => {
    const sequence = ++requestSequence
    loading.value = true
    error.value = ''
    try {
        const response = await $fetch<RunDetailView>(`/api/runs/${runId}`)
        if (sequence === requestSequence) {
            detail.value = response
        }
    } catch (e: unknown) {
        if (sequence !== requestSequence) {
            return
        }
        const err = e as { data?: { message?: string }, message?: string }
        error.value = t('runs.errors.detailLoadFailed', {
            message: err.data?.message ?? err.message ?? t('common.errors.unknown'),
        })
    } finally {
        if (sequence === requestSequence) {
            loading.value = false
        }
    }
}

watch(() => props.runId, (runId) => {
    if (runId) {
        void loadDetail(runId)
    } else {
        reset()
    }
}, { immediate: true })
</script>

<template>
    <Dialog
        v-model:visible="visible"
        :header="dialogTitle"
        modal
        :draggable="false"
        :style="{width: '720px'}"
        :breakpoints="{'1199px': '75vw', '575px': '90vw'}"
        @hide="reset"
    >
        <div v-if="loading" class="text-muted">
            {{ t('common.empty.loading') }}
        </div>
        <Message
            v-else-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>
        <template v-else-if="detail">
            <div class="run-detail__meta">
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunId') }}</span>
                    <strong>{{ shortRunId(detail.id) }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunMode') }}</span>
                    <strong>{{ modeLabel(detail.mode) }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunThreshold') }}</span>
                    <strong>{{ thresholdLabel(detail.severityThreshold) }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunExecutor') }}</span>
                    <strong>{{ executorLabel(detail.executorKind) }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunAlertsFound') }}</span>
                    <strong>{{ alertsFound(detail.summary) }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunStartedAt') }}</span>
                    <strong>{{ detail.startedAt ? d(new Date(detail.startedAt), 'long') : '—' }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunDuration') }}</span>
                    <strong>{{ formatDuration(detail.startedAt, detail.finishedAt) }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('alerts.detailRunStatus') }}</span>
                    <Tag :value="statusLabel(detail.status)" :severity="statusSeverity(detail.status)" />
                </div>
            </div>
            <div
                v-if="detail.aiUsage"
                class="run-detail__ai-usage"
            >
                <h4 class="run-detail__ai-usage-title">
                    {{ t('ai.usageSectionTitle') }}
                </h4>
                <div class="run-detail__ai-usage-grid">
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('ai.usageCalls') }}</span>
                        <strong>{{ detail.aiUsage.calls }}</strong>
                    </div>
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('ai.usageInputTokens') }}</span>
                        <strong>{{ detail.aiUsage.inputTokens }}</strong>
                    </div>
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('ai.usageOutputTokens') }}</span>
                        <strong>{{ detail.aiUsage.outputTokens }}</strong>
                    </div>
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('ai.usageTotalTokens') }}</span>
                        <strong>{{ detail.aiUsage.totalTokens }}</strong>
                    </div>
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('ai.usageCostUsd') }}</span>
                        <strong>${{ detail.aiUsage.estimatedCostUsd.toFixed(4) }}</strong>
                    </div>
                </div>
            </div>
            <a
                v-if="detail.runUrl"
                class="run-detail__run-url"
                :href="detail.runUrl"
                target="_blank"
                rel="noopener noreferrer"
            >
                {{ t('alerts.detailRunOpen') }}
            </a>
            <Message
                v-if="detail.status === 'failed'"
                severity="error"
                :closable="false"
            >
                <strong>{{ t('runs.errorTitle', {code: detail.error?.code ?? 'UNKNOWN'}) }}</strong>
                <p v-if="detail.error" class="run-detail__error-message">
                    {{ detail.error.message }}
                </p>
                <p v-else class="run-detail__error-message text-muted">
                    {{ t('runs.errorNoDetail') }}
                </p>
            </Message>
            <div v-if="detail.logs && detail.logs.length > 0" class="run-detail__logs">
                <div class="run-detail__logs-header">
                    <span class="run-detail__logs-title">{{ t('runs.logsTitle') }}</span>
                    <Button
                        icon="pi pi-copy"
                        text
                        rounded
                        size="small"
                        :aria-label="t('runs.logsCopy')"
                        :title="t('runs.logsCopy')"
                        @click="copyLogs"
                    />
                </div>
                <div class="run-detail__logs-scroll" style="height: 200px; overflow: auto">
                    <div class="run-detail__logs-content">
                        <div
                            v-for="(entry, index) in detail.logs"
                            :key="index"
                            class="run-detail__log-entry"
                            :class="`run-detail__log-entry--${entry.level}`"
                        >
                            <span class="run-detail__log-time">{{ formatLogTime(entry.timestamp) }}</span>
                            <span class="run-detail__log-level">{{ entry.level.toUpperCase() }}</span>
                            <span class="run-detail__log-message">{{ entry.message }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <CaomeiDataTable
                :data="detail.results"
                :columns="resultColumns"
                row-key="id"
                striped
                :empty-text="t('runs.detailEmpty')"
            >
                <template #cell-severity="{row}">
                    <Tag
                        :value="row.severity"
                        :severity="row.severity === 'critical' ? 'danger' : row.severity === 'high' ? 'warn' : 'info'"
                    />
                </template>
                <template #cell-fixable="{row}">
                    <Tag
                        :value="row.fixable ? t('common.yes') : t('common.no')"
                        :severity="row.fixable ? 'success' : 'secondary'"
                    />
                </template>
                <template #cell-link="{row}">
                    <a
                        v-if="row.htmlUrl"
                        :href="row.htmlUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {{ t('runs.view') }}
                    </a>
                    <span v-else class="text-muted">—</span>
                </template>
            </CaomeiDataTable>
        </template>
    </Dialog>
</template>

<style lang="scss" scoped>
.run-detail {
    &__meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: $space-3;
        margin-bottom: $space-3;
    }

    &__meta-item {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        min-width: 0;
    }

    &__meta-label {
        color: $color-text-muted;
        font-size: $font-size-sm;
    }

    &__run-url {
        display: inline-flex;
        align-items: center;
        margin-bottom: $space-3;
        padding: $space-1 $space-2;
        background: rgba($color-primary, 0.1);
        border-radius: $radius-sm;
        color: $color-primary;
        text-decoration: none;
        font-size: $font-size-sm;
        transition: background 0.2s;

        &:hover {
            background: rgba($color-primary, 0.2);
        }
    }

    &__error-message {
        margin: $space-2 0 0;
        overflow-wrap: anywhere;
    }

    &__logs {
        margin-bottom: $space-3;
        border: 1px solid $color-border;
        border-radius: $radius-md;
        overflow: hidden;
    }

    &__logs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: $space-2 $space-3;
        background: $color-surface;
        border-bottom: 1px solid $color-border;
    }

    &__logs-title {
        font-weight: 600;
        font-size: $font-size-sm;
    }

    &__logs-content {
        padding: $space-2;
        font-family: monospace;
        font-size: $font-size-sm;
        line-height: 1.5;
    }

    &__log-entry {
        display: flex;
        gap: $space-2;
        padding: $space-1 0;
        border-bottom: 1px solid $color-border;

        &:last-child {
            border-bottom: none;
        }

        &--error {
            color: $color-danger;
        }

        &--warn {
            color: $color-warning;
        }

        &--info {
            color: $color-text;
        }

        &--debug {
            color: $color-text-muted;
        }
    }

    &__log-time {
        color: $color-text-muted;
        white-space: nowrap;
    }

    &__log-level {
        font-weight: 600;
        white-space: nowrap;
        min-width:40px;
    }

    &__log-message {
        overflow-wrap: anywhere;
    }
}
</style>
