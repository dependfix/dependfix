<script setup lang="ts">
import type { DataTableColumn } from 'caomei-ui'
import { Copy, Download, RefreshCw } from '@lucide/vue'
import {
    alertsFound,
    deliverySkipDraftPrs,
    deliverySkipIssues,
    deliverySkipped,
    environmentalFailureCount,
    failureKindLabel,
    failureStageLabel,
    formatBuildLabel,
    formatBytes,
    formatRunDuration,
    isRunResultMissing,
    runExecutorLabel,
    runModeLabel,
    shortRunId,
    unfixedAlerts,
    verificationSkipSummary,
    networkViolations,
    networkViolationSummary,
    runDelivery,
    verificationsSkipped,
} from '~/utils/run-view'
import { scanSeverityLabel } from '~/utils/scan-options'
import { downloadFile } from '~/utils/download'

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
    /** 运行结果可信度：旧数据 / B 模式为 null */
    exitCode: number | null
    environmentalFailureCount: number | null
    /**
     * 构建版本回执（本次 run 由哪个部署产物执行）：构建期未注入为 `unknown`，
     * 存量行（列上线前）为 null——两者都按「未知」降级展示，不是错误态。
     */
    buildVersion: string | null
    buildCommit: string | null
    /** 执行资源 / OOM 归因：null = 不可采集（原因在 resource.degradedReason） */
    memoryMaxBytes: number | null
    peakRssBytes: number | null
    oomKilled: boolean | null
    resource: {
        source?: string
        degradedReason?: string
        samples?: number
        sigkillDetected?: boolean
    } | null
    error: { code: string, message: string } | null
    /** 失败分类三列（口径见 docs/design/governance/run-failure-taxonomy.md §5.5）：非失败终态为 null */
    failureCode: string | null
    failureStage: string | null
    failureKind: string | null
    /** 重试来源 run id（由服务端写入；非重试触发为 null） */
    retriedFromRunId: string | null
    results: RunResultView[]
    /**
     * AI 研判用量聚合（设计见 [platform-ai-integration.md §RunDetailDialog AI 用量 section](../design/governance/platform-ai-integration.md)）。
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
    /** 重试触发成功（未合并）后发出：携带新运行 id 与仓库 id，供父级跳转扫描历史（与「立即修复」同去向口径） */
    retried: [payload: { repositoryId: string, runId: string }]
}>()

const { t, d } = useI18n()

/** 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽） */
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
const downloadingLogs = ref(false)
let requestSequence = 0

const visible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
})

/** 重试入口状态机（四态分离；口径见 docs/design/governance/run-failure-taxonomy.md §5.5） */
const confirm = useConfirm()
const { retryingRunId, retryError, retryMerged, retrySuccess, retryRun, resetMessages } = useRunRetry({
    onRetried: (response) => {
        const repositoryId = detail.value?.repositoryId
        if (repositoryId) {
            emit('retried', { repositoryId, runId: response.id })
        }
    },
})

/** 仅「可重试」类失败呈现入口（与后端守卫同一判据；前端不可见 ≠ 后端可绕过） */
const canRetry = computed(() => detail.value?.failureKind === 'transient')

/**
 * 构建版本回执（`scan_run.build_version/build_commit`）。
 * 构建期未注入（`unknown`）与存量行（null）统一按「未知」降级展示——这是诊断信息缺失的正常形态，
 * 不进入错误态、不改变任何判定。口径见 docs/standards/platform.md §10.7。
 */
const verificationSkipSummaryText = computed(() => verificationSkipSummary(detail.value?.summary ?? null, t))
const networkViolationText = computed(() => networkViolationSummary(detail.value?.summary ?? null, t))
/** 自包含交付记录（branch + commit）；无记录时不渲染该项 */
const deliveryInfo = computed(() => runDelivery(detail.value?.summary ?? null))
const deliveryText = computed(() => {
    const info = deliveryInfo.value
    if (!info?.branch) {
        return ''
    }
    const commit = info.commitSha ? ` @ ${info.commitSha.slice(0, 7)}` : ''
    return `${t('runs.deliveryBranch', { branch: info.branch })}${commit}`
})

/** 失败横幅文案：已知错误码走本地化，其余保持引擎原文（附 code 便于排查）。 */
const localizedRunError = (error: { code?: string | null, message?: string }): string =>
    error.code === 'network_violation' ? t('runs.networkViolationFailure') : (error.message ?? '')

const buildInfo = computed(() =>
    formatBuildLabel(detail.value?.buildVersion, detail.value?.buildCommit, t('runs.buildUnknown')),
)

/** 二次确认后触发重试：参数与来源均由服务端按来源运行派生，前端只传 runId */
const requestRetry = async () => {
    const run = detail.value
    if (!run) {
        return
    }
    const confirmed = await confirm.open({
        title: t('runs.retry.confirmTitle'),
        description: t('runs.retry.confirmBody', {
            mode: modeLabel(run.mode),
            threshold: thresholdLabel(run.severityThreshold),
        }),
        tone: 'neutral',
    })
    if (!confirmed) {
        return
    }
    await retryRun(run.id)
}

const modeLabel = (mode: string) => runModeLabel(mode, t)
const executorLabel = (executorKind: string) => runExecutorLabel(executorKind, t)
const thresholdLabel = (severityThreshold: string) => scanSeverityLabel(severityThreshold, t)
const formatDuration = (startedAt: string | null, finishedAt: string | null) => formatRunDuration(startedAt, finishedAt, t)

const statusLabel = (status: string) => ({
    completed: t('runs.statusCompleted'),
    failed: t('runs.statusFailed'),
    dispatched: t('runs.statusDispatched'),
    running: t('runs.statusRunning'),
    degraded: t('runs.statusDegraded'),
})[status] ?? status

const statusTone = (status: string) => {
    switch (status) {
        case 'completed':
            return 'success' as const
        case 'failed':
            return 'danger' as const
        case 'dispatched':
            return 'primary' as const
        default:
            return 'warning' as const
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

/** 下载单个 run 的执行日志（服务端 txt 附件；无日志时入口隐藏） */
const downloadLogs = async () => {
    const run = detail.value
    if (!run) {
        return
    }
    downloadingLogs.value = true
    error.value = ''
    try {
        await downloadFile(`/api/runs/${run.id}/logs`, `run-${run.id}.txt`)
    } catch (e: unknown) {
        error.value = t('runs.errors.logsDownloadFailed', {
            message: e instanceof Error ? e.message : t('common.errors.unknown'),
        })
    } finally {
        downloadingLogs.value = false
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
    // 重试三态随详情生命周期清理（避免 5s 窗口内切换运行看到上一运行的提示）
    resetMessages()
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
    <CaomeiDialog
        v-model:open="visible"
        :title="dialogTitle"
        modal
        :style="{'--caomei-dialog-width': '720px'}"
        @hide="reset"
    >
        <div v-if="loading" class="text-muted">
            {{ t('common.empty.loading') }}
        </div>
        <CaomeiMessage
            v-else-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>
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
                    <strong v-if="!isRunResultMissing(detail)">{{ alertsFound(detail.summary) }}</strong>
                    <strong
                        v-else
                        class="text-muted"
                        :title="t('runs.resultMissingHint')"
                    >
                        {{ t('runs.resultMissing') }}
                    </strong>
                </div>
                <div v-if="!isRunResultMissing(detail) && unfixedAlerts(detail.summary) > 0" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.unfixedAlertsLabel') }}</span>
                    <strong>{{ unfixedAlerts(detail.summary) }}</strong>
                </div>
                <div v-if="!isRunResultMissing(detail) && deliverySkipped(detail.summary) > 0" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.deliverySkippedLabel') }}</span>
                    <strong :title="t('runs.deliverySkippedHint')">
                        {{ t('runs.deliverySkipped', {count: deliverySkipped(detail.summary)}) }}
                        <template v-if="deliverySkipIssues(detail.summary) > 0">
                            · {{ t('runs.deliverySkipIssues', {count: deliverySkipIssues(detail.summary)}) }}
                        </template>
                        <template v-if="deliverySkipDraftPrs(detail.summary) > 0">
                            · {{ t('runs.deliverySkipDraftPrs', {count: deliverySkipDraftPrs(detail.summary)}) }}
                        </template>
                    </strong>
                </div>
                <div v-if="!isRunResultMissing(detail) && verificationsSkipped(detail.summary) > 0" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.verificationsSkippedLabel') }}</span>
                    <strong :title="t('runs.verificationsSkippedHint')">
                        {{ t('runs.verificationsSkipped', {count: verificationsSkipped(detail.summary)}) }}
                        <template v-if="verificationSkipSummaryText">
                            · {{ verificationSkipSummaryText }}
                        </template>
                    </strong>
                </div>
                <div v-if="!isRunResultMissing(detail) && networkViolations(detail.summary) > 0" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.networkViolationsLabel') }}</span>
                    <strong :title="networkViolationText || t('runs.networkViolationsHint')">
                        {{ t('runs.networkViolations', {count: networkViolations(detail.summary)}) }}
                    </strong>
                </div>
                <div v-if="deliveryInfo?.status === 'pushed' && deliveryInfo.branch && (detail.status === 'completed' || detail.status === 'degraded')" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.deliveryLabel') }}</span>
                    <strong>{{ deliveryText }}</strong>
                </div>
                <div v-if="!isRunResultMissing(detail) && environmentalFailureCount(detail) > 0" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.environmentalFailuresLabel') }}</span>
                    <strong>{{ environmentalFailureCount(detail) }}</strong>
                </div>
                <div v-if="!isRunResultMissing(detail) && detail.exitCode !== null && detail.exitCode !== undefined" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.exitCode') }}</span>
                    <strong>{{ detail.exitCode }}</strong>
                </div>
                <div class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.buildVersion') }}</span>
                    <strong
                        :class="{'text-muted': buildInfo.unknown}"
                        :title="t('runs.buildVersionHint')"
                    >
                        {{ buildInfo.label }}
                    </strong>
                </div>
                <div v-if="detail.memoryMaxBytes !== null" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.memoryLimit') }}</span>
                    <strong>{{ formatBytes(detail.memoryMaxBytes) }}</strong>
                </div>
                <div v-if="detail.peakRssBytes !== null || detail.oomKilled !== null || detail.resource?.degradedReason" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.peakMemory') }}</span>
                    <strong
                        v-if="detail.peakRssBytes !== null"
                        :title="t('runs.peakMemoryHint')"
                    >
                        {{ formatBytes(detail.peakRssBytes) }}
                    </strong>
                    <strong
                        v-else
                        class="text-muted"
                        :title="detail.resource?.degradedReason || ''"
                    >
                        {{ t('runs.resourceUnavailable') }}
                    </strong>
                </div>
                <div v-if="detail.oomKilled !== null || detail.resource?.degradedReason" class="run-detail__meta-item">
                    <span class="run-detail__meta-label">{{ t('runs.oomKilled') }}</span>
                    <CaomeiTag
                        v-if="detail.oomKilled !== null"
                        :tone="detail.oomKilled ? 'danger' : 'neutral'"
                        :title="t('runs.oomKilledHint')"
                    >
                        {{ detail.oomKilled ? t('common.yes') : t('common.no') }}
                    </CaomeiTag>
                    <strong
                        v-else
                        class="text-muted"
                        :title="detail.resource?.degradedReason || ''"
                    >
                        {{ t('runs.resourceUnavailable') }}
                    </strong>
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
                    <CaomeiTag :tone="statusTone(detail.status)">
                        {{ statusLabel(detail.status) }}
                    </CaomeiTag>
                </div>
            </div>
            <run-outcome-breakdown v-if="!isRunResultMissing(detail)" :summary="detail.summary" />
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
            <CaomeiMessage
                v-if="isRunResultMissing(detail)"
                tone="warning"
                :closable="false"
            >
                <strong>{{ t('runs.resultMissing') }}</strong>
                <p class="run-detail__error-message text-muted">
                    {{ t('runs.resultMissingHint') }}
                </p>
            </CaomeiMessage>
            <CaomeiMessage
                v-if="detail.status === 'failed'"
                tone="danger"
                :closable="false"
            >
                <strong>{{ t('runs.errorTitle', {code: detail.error?.code ?? 'UNKNOWN'}) }}</strong>
                <p v-if="detail.error" class="run-detail__error-message">
                    {{ localizedRunError(detail.error) }}
                </p>
                <p v-else class="run-detail__error-message text-muted">
                    {{ t('runs.errorNoDetail') }}
                </p>
            </CaomeiMessage>
            <div
                v-if="detail.status === 'failed'"
                class="run-detail__failure"
            >
                <div class="run-detail__failure-header">
                    <h4 class="run-detail__failure-title">
                        {{ t('runs.retry.failureDetail') }}
                    </h4>
                    <CaomeiButton
                        v-if="canRetry"
                        variant="primary"
                        size="sm"
                        :loading="retryingRunId === detail.id"
                        @click="requestRetry"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="RefreshCw" />
                        </template>
                        {{ t('runs.retry.action') }}
                    </CaomeiButton>
                </div>
                <div class="run-detail__meta">
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('scans.runList.filterFailureStage') }}</span>
                        <strong>{{ failureStageLabel(detail.failureStage, t) ?? '—' }}</strong>
                    </div>
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('scans.runList.filterFailureKind') }}</span>
                        <strong>{{ failureKindLabel(detail.failureKind, t) ?? '—' }}</strong>
                    </div>
                    <div class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('runs.retry.failureCodeLabel') }}</span>
                        <strong>{{ detail.failureCode ?? '—' }}</strong>
                    </div>
                    <div v-if="detail.retriedFromRunId" class="run-detail__meta-item">
                        <span class="run-detail__meta-label">{{ t('runs.retry.source') }}</span>
                        <strong>{{ shortRunId(detail.retriedFromRunId) }}</strong>
                    </div>
                </div>
                <p v-if="canRetry" class="run-detail__failure-hint">
                    {{ t('runs.retry.hint') }}
                </p>
                <CaomeiMessage
                    v-if="retryError"
                    tone="danger"
                    closable
                    @close="resetMessages"
                >
                    {{ retryError }}
                </CaomeiMessage>
                <CaomeiMessage
                    v-if="retryMerged"
                    tone="warning"
                    closable
                    @close="resetMessages"
                >
                    {{ retryMerged }}
                </CaomeiMessage>
                <CaomeiMessage
                    v-if="retrySuccess"
                    tone="success"
                    closable
                    @close="resetMessages"
                >
                    {{ retrySuccess }}
                </CaomeiMessage>
            </div>
            <div v-if="detail.logs && detail.logs.length > 0" class="run-detail__logs">
                <div class="run-detail__logs-header">
                    <span class="run-detail__logs-title">{{ t('runs.logsTitle') }}</span>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :aria-label="t('runs.logsCopy')"
                        :title="t('runs.logsCopy')"
                        @click="copyLogs"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Copy" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :loading="downloadingLogs"
                        :aria-label="t('runs.logsDownload')"
                        :title="t('runs.logsDownload')"
                        @click="downloadLogs"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Download" />
                        </template>
                    </CaomeiButton>
                </div>
                <div class="run-detail__logs-scroll">
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
                :empty-text="isRunResultMissing(detail) ? t('runs.resultMissing') : t('runs.detailEmpty')"
            >
                <template #cell-severity="{row}">
                    <CaomeiTag
                        :tone="row.severity === 'critical' ? 'danger' : row.severity === 'high' ? 'warning' : 'primary'"
                    >
                        {{ row.severity }}
                    </CaomeiTag>
                </template>
                <template #cell-fixable="{row}">
                    <CaomeiTag
                        :tone="row.fixable ? 'success' : 'neutral'"
                    >
                        {{ row.fixable ? t('common.yes') : t('common.no') }}
                    </CaomeiTag>
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
    </CaomeiDialog>
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

    &__failure {
        margin: $space-3 0;
        padding: $space-3;
        border: 1px solid $color-border;
        border-radius: $radius-md;
    }

    &__failure-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-2;
        margin-bottom: $space-2;
    }

    &__failure-title {
        margin: 0;
        font-weight: 600;
        font-size: $font-size-sm;
    }

    &__failure-hint {
        margin: 0 0 $space-2;
        color: $color-text-muted;
        font-size: $font-size-sm;
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

    /* 日志滚动区高度自适应（原固定 200px）：视口比例 clamp —— 下限 240px 保证可视区不小于旧值，
       上限 520px 避免大屏过高；中档 40vh 随弹窗可用空间（85vh 预算）缩放（与 repo-history-dialog 同口径）。 */
    &__logs-scroll {
        height: clamp(240px, 40vh, 520px);
        overflow: auto;
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
