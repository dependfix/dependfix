<script setup lang="ts">
// 扫描历史 Dialog（应用层修复：替代 unrouting 0.2.x 子路由 /repos/[id]/runs，
// 用 query 传仓库 id，绕开 `:id()` dynamic segment 与 path-to-regexp 8.x 不兼容的根因）。
//
// 当前由两种调用方消费：
// - repos.vue 老路径 `/repos?history={id}`：保留 queryKey='history' 默认值兼容
// - scans.vue 新路径 `/scans?run={id}`：通过 :query-key="'run'" 注入
//
// 分页：服务端分页（lazy DataTable + Paginator）。
// 默认 pageSize=10，rows-per-page-options=[10, 25, 50]，最大 200 由 server 钳制。
import type { DataTableColumn, DataTablePageEvent } from 'caomei-ui'
import { ArrowLeft, Copy, ExternalLink, Eye, X } from '@lucide/vue'

const props = withDefaults(defineProps<{
    /**
     * 触发 Dialog 的 query 键：
     * - 'history'：兼容老路径 /repos?history={id}（按仓库过滤）
     * - 'run'：新路径 /scans?run={id}（直接打开单 run 详情）
     *
     * 注意：queryKey 决定触发方式与关闭时清理行为，但不影响内部 list/detail 视图；
     * list 视图仍按 repositoryId 过滤（从 /api/runs/{id} 详情推断），detail 视图无需仓库上下文。
     */
    queryKey?: 'history' | 'run'
}>(), { queryKey: 'history' })

const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()

interface HistoryRunView {
    id: string
    repositoryId: string
    owner: string | null
    name: string | null
    mode: string
    severityThreshold: string
    status: string
    startedAt: string | null
    finishedAt: string | null
    runUrl: string | null
    summary: Record<string, unknown> | null
    error: { code: string, message: string } | null
}

const dialogVisible = ref(false)
// run mode 时直接打开 detail，不进入 list
const detailMode = ref(props.queryKey === 'run')
const repoId = ref<string | null>(null)
const runs = ref<HistoryRunView[]>([])
const total = ref(0)
const pageSize = ref(10)
const first = ref(0)
const loading = ref(false)
const error = ref('')
// detail 含 status + error（用于 Error Banner 展示失败原因）+ results + logs + runUrl
// 实测反馈：详情面板需展示执行级错误，否则失败 run 详情仅能看到空 alerts 表
interface DetailView {
    id?: string
    owner?: string | null
    name?: string | null
    mode?: string
    severityThreshold?: string
    executorKind?: string
    status: string
    startedAt?: string | null
    finishedAt?: string | null
    runUrl?: string | null
    summary?: Record<string, unknown> | null
    error: { code: string, message: string } | null
    results: unknown[]
    logs?: Array<{ timestamp: string, level: string, message: string }>
    logsText?: string | null
}
const detail = ref<DetailView | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

/**
 * detail.results 行的显式形状（value 曾以内联 `as` 断言；抽出接口供 `columns` 复用，避免断言与列定义类型漂移）。
 */
interface DetailResultRow {
    id: string
    packageName: string
    severity: string
    source: string
    fixable: boolean
    fixStrategy: string | null
    recommendedVersion: string | null
    htmlUrl: string | null
}

/** caomei DataTable 受控分页为 1 基 `page`；由既有 0 基 `first` 与 `pageSize` 换算 */
const page = computed(() => Math.floor(first.value / pageSize.value) + 1)

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽）。
 * detail 表 value 由内联断言改为 computed `detailResults`（强类型）。
 */
const detailResults = computed<DetailResultRow[]>(() => (detail.value?.results ?? []) as DetailResultRow[])
const detailColumns = computed<DataTableColumn<DetailResultRow>[]>(() => [
    { key: 'packageName', header: t('runs.colPackage') },
    { key: 'severity', header: t('runs.colSeverity') },
    { key: 'source', header: t('runs.colSource') },
    { key: 'fixable', header: t('runs.colFixable') },
    { key: 'recommendedVersion', header: t('runs.colRecommended') },
    { key: 'link', header: t('runs.colLink') },
])

/** 列定义（历史 run 列表 list 表） */
const listColumns = computed<DataTableColumn<HistoryRunView>[]>(() => [
    { key: 'status', header: t('runs.colStatus') },
    { key: 'mode', header: t('runs.colMode') },
    // key 即默认取值字段，须与 HistoryRunView 字段名一致（severityThreshold）
    { key: 'severityThreshold', header: t('runs.colThreshold') },
    { key: 'startedAt', header: t('runs.colStartedAt') },
    { key: 'alerts', header: t('runs.colAlerts') },
    { key: 'fixed', header: t('runs.colFixed') },
    { key: 'actions', header: t('runs.colActions'), width: '200px' },
])

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const

const resetDetail = () => {
    detail.value = null
    detailError.value = ''
    detailLoading.value = false
}

const statusTone = (status: string) => {
    switch (status) {
        case 'completed': return 'success'
        case 'failed': return 'danger'
        case 'dispatched': return 'primary'
        default: return 'warning'
    }
}

const statusLabel = (status: string) => ({
    completed: t('runs.statusCompleted'),
    failed: t('runs.statusFailed'),
    dispatched: t('runs.statusDispatched'),
    running: t('runs.statusRunning'),
})[status] ?? status

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

const fetchRuns = async (id: string, page = 1, rows = pageSize.value) => {
    loading.value = true
    error.value = ''
    try {
        const res = await $fetch('/api/runs', {
            query: { repositoryId: id, page, pageSize: rows },
        })
        const data = res as { items: HistoryRunView[], total: number }
        runs.value = data.items
        total.value = data.total
    } catch (e: any) {
        error.value = t('runs.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

// caomei DataTable @page 事件：page 1-based（对齐后端 page 参数，不再 +1）
const onPage = async (event: DataTablePageEvent) => {
    pageSize.value = event.rows
    first.value = event.first
    if (repoId.value) {
        await fetchRuns(repoId.value, event.page, event.rows)
    }
}

const openDetail = async (run: HistoryRunView) => {
    resetDetail()
    detailLoading.value = true
    try {
        const res = await $fetch(`/api/runs/${run.id}`)
        // 实测反馈：detail 类型扩展为含 status + error 以支持失败 Error Banner
        detail.value = res as { status: string, error: { code: string, message: string } | null, results: unknown[] }
    } catch (e: any) {
        detailError.value = t('runs.errors.detailLoadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        detailLoading.value = false
    }
}

/**
 * 直接打开单 run 详情（queryKey='run' 模式）：
 * - 跳过 list 视图，直接展示 detail
 * - 无需 repositoryId 过滤
 * - 关闭时由 closeDialog 一并清理 query
 */
const openRunDetail = async (runId: string) => {
    resetDetail()
    detailLoading.value = true
    detailMode.value = true
    try {
        const res = await $fetch(`/api/runs/${runId}`)
        detail.value = res as { status: string, error: { code: string, message: string } | null, results: unknown[] }
    } catch (e: any) {
        detailError.value = t('runs.errors.detailLoadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        detailLoading.value = false
    }
}

const openRunUrl = (url: string) => {
    window.open(url, '_blank')
}

const closeDialog = async () => {
    dialogVisible.value = false
    repoId.value = null
    runs.value = []
    total.value = 0
    pageSize.value = 10
    first.value = 0
    error.value = ''
    detailMode.value = props.queryKey === 'run'
    resetDetail()
    if (route.query[props.queryKey] !== undefined) {
        const { [props.queryKey]: _drop, ...rest } = route.query
        await router.replace({ query: rest })
    }
}

// 监听 URL ?<queryKey>={id} → 自动打开 Dialog
// - queryKey='history'：按仓库过滤列表（向后兼容）
// - queryKey='run'：直接打开单 run 详情
watch(() => route.query[props.queryKey], async (newVal) => {
    const id = typeof newVal === 'string'
        ? newVal
        : Array.isArray(newVal) ? newVal[0] : null
    if (id) {
        if (props.queryKey === 'run') {
            // run 模式：直接打开 detail，不进入 list
            dialogVisible.value = true
            await openRunDetail(id)
        } else {
            // history 模式：按仓库过滤 list（向后兼容）
            if (repoId.value !== id) {
                repoId.value = id
                // 切换仓库：重置 first 与 pageSize（保留首次进入默认；避免切换后 UI 高亮页与 server 数据不一致）
                first.value = 0
                pageSize.value = 10
                detailMode.value = false
                resetDetail()
                await fetchRuns(id, 1, pageSize.value)
            }
            dialogVisible.value = true
        }
    } else if (dialogVisible.value) {
        // query 被外部清空（如浏览器后退），同步关闭
        await closeDialog()
    }
}, { immediate: true })
</script>

<template>
    <CaomeiDialog
        v-model:open="dialogVisible"
        :title="t('runs.title')"
        modal
        :closable="!detail || queryKey === 'run'"
        :close-on-esc="!detail || queryKey === 'run'"
        :style="{width: '720px'}"
        @hide="closeDialog"
    >
        <div v-if="loading && runs.length === 0 && !detailMode" class="text-muted">
            {{ t('common.empty.loading') }}
        </div>
        <CaomeiMessage
            v-else-if="error && !detailMode"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>
        <div v-else-if="detailLoading" class="text-muted">
            {{ t('common.empty.loading') }}
        </div>
        <CaomeiMessage
            v-else-if="detailError"
            tone="danger"
            :closable="false"
        >
            {{ detailError }}
        </CaomeiMessage>
        <!-- 实测反馈：detail.status === 'failed' 时在 results 表格上方展示执行级 Error Banner，
             即使 detail.error 为空（数据损坏 / 旧数据迁移 / 后端 errorJson 缺失）也显示降级提示。
             caomei DataTable 无表级 #header 插槽，故原 #header 内容（返回/关闭按钮 + Error Banner + PR 链接）
             与日志区一并上移到表格容器前（仍处于 v-else-if="detail" 分支）。 -->
        <template v-else-if="detail">
            <div class="repo-history__detail-header">
                <!-- list mode：返回列表按钮 -->
                <CaomeiButton
                    v-if="!detailMode"
                    variant="ghost"
                    size="sm"
                    @click="resetDetail"
                >
                    <template #icon>
                        <CaomeiIcon :icon="ArrowLeft" />
                    </template>
                    {{ t('runs.backToList') }}
                </CaomeiButton>
                <!-- run mode（queryKey='run'）：列表不可用，提供关闭按钮；history mode 但已无列表上下文时也降级到关闭 -->
                <CaomeiButton
                    v-else-if="queryKey === 'run'"
                    variant="ghost"
                    size="sm"
                    @click="closeDialog"
                >
                    <template #icon>
                        <CaomeiIcon :icon="X" />
                    </template>
                    {{ t('common.actions.close') }}
                </CaomeiButton>
                <CaomeiMessage
                    v-if="detail.status === 'failed'"
                    tone="danger"
                    :closable="false"
                    class="repo-history__error-banner"
                >
                    <strong>{{ t('runs.errorTitle', {code: detail.error?.code ?? 'UNKNOWN'}) }}</strong>
                    <p v-if="detail.error" class="repo-history__error-message">
                        {{ detail.error.message }}
                    </p>
                    <p v-else class="repo-history__error-message text-muted">
                        {{ t('runs.errorNoDetail') }}
                    </p>
                </CaomeiMessage>
                <!-- PR 链接（右手边） -->
                <a
                    v-if="detail.runUrl"
                    :href="detail.runUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="repo-history__run-url"
                >
                    {{ t('alerts.detailRunOpen') }}
                </a>
            </div>
            <!-- 日志区域（原生滚动容器 + CSS） -->
            <div v-if="detail.logs && detail.logs.length > 0" class="repo-history__logs">
                <div class="repo-history__logs-header">
                    <span class="repo-history__logs-title">{{ t('runs.logsTitle') }}</span>
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
                </div>
                <div class="repo-history__logs-scroll" style="height: 200px; overflow: auto">
                    <div class="repo-history__logs-content">
                        <div
                            v-for="(entry, index) in detail.logs"
                            :key="index"
                            class="repo-history__log-entry"
                            :class="`repo-history__log-entry--${entry.level}`"
                        >
                            <span class="repo-history__log-time">{{ formatLogTime(entry.timestamp) }}</span>
                            <span class="repo-history__log-level">{{ entry.level.toUpperCase() }}</span>
                            <span class="repo-history__log-message">{{ entry.message }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <CaomeiDataTable
                :data="detailResults"
                :columns="detailColumns"
                striped
                :empty-text="t('runs.detailEmpty')"
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
                </template>
            </CaomeiDataTable>
        </template>
        <template v-else-if="!detailMode">
            <!-- 服务端分页（lazy DataTable + 内置 paginator）
                 —— pageSize 由 pageSize.value 驱动，total 由后端返回的 total 驱动，
                 翻页触发 onPage → 重新请求 /api/runs 带 page + pageSize -->
            <CaomeiDataTable
                :data="runs"
                :columns="listColumns"
                lazy
                paginator
                :page="page"
                :rows="pageSize"
                :total-records="total"
                :rows-per-page-options="[...PAGE_SIZE_OPTIONS]"
                :loading="loading"
                striped
                :empty-text="t('runs.empty')"
                @page="onPage"
            >
                <template #cell-status="{row}">
                    <!-- 实测反馈：failed 状态 Tag 外包一层 span 承载 error.message 的 tooltip
                         （span 同时承担 `repo-history__status-wrap` 布局样式） -->
                    <span
                        v-if="row.error"
                        class="repo-history__status-wrap"
                        :title="row.error.message"
                    >
                        <CaomeiTag :tone="statusTone(row.status)">
                            {{ statusLabel(row.status) }}
                        </CaomeiTag>
                    </span>
                    <CaomeiTag
                        v-else
                        :tone="statusTone(row.status)"
                    >
                        {{ statusLabel(row.status) }}
                    </CaomeiTag>
                </template>
                <template #cell-startedAt="{row}">
                    {{ row.startedAt ? d(new Date(row.startedAt), 'long') : '—' }}
                </template>
                <template #cell-alerts="{row}">
                    {{ (row.summary as Record<string, number> | null)?.alertsFound ?? 0 }}
                </template>
                <template #cell-fixed="{row}">
                    {{ (row.summary as Record<string, number> | null)?.alertsFixed ?? 0 }}
                </template>
                <template #cell-actions="{row}">
                    <CaomeiButton
                        v-if="row.runUrl"
                        variant="ghost"
                        rounded
                        size="sm"
                        :aria-label="t('runs.actionViewActionRun')"
                        :title="t('runs.actionViewActionRun')"
                        @click="openRunUrl(row.runUrl)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="ExternalLink" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :aria-label="t('runs.actionViewDetail')"
                        :title="t('runs.actionViewDetail')"
                        @click="openDetail(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Eye" />
                        </template>
                    </CaomeiButton>
                </template>
            </CaomeiDataTable>
        </template>
    </CaomeiDialog>
</template>

<style lang="scss" scoped>
// 实测反馈：失败执行级错误展示样式（detail Error Banner + 列表 status Tag 包裹）
.repo-history {
    &__error-banner {
        margin-bottom: $space-3;
    }

    &__error-message {
        margin: $space-2 0 0;
        overflow-wrap: anywhere;
    }

    &__status-wrap {
        // inline-flex 让 span 紧贴 Tag 内部尺寸，title 命中区域 = Tag 渲染范围
        display: inline-flex;
        cursor: help;
    }

    &__detail-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: $space-2;
    }

    &__run-url {
        display: inline-flex;
        align-items: center;
        margin-left: auto;
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
        min-width: 40px;
    }

    &__log-message {
        overflow-wrap: anywhere;
    }
}
</style>
