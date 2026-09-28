<script setup lang="ts">
// 扫描历史：按仓库查看运行列表与详情
// 注意：本页面已被应用层修复迁入 `repo-history-dialog`，但保留兼容——
// 用户直接访问 /repos/{id}/runs 仍可使用（候选删除条目见 docs/plan/backlog.md）。
import { ArrowLeft, ExternalLink, Eye } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
import { withRunStatusRank } from '~/utils/sort-helpers'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

interface RunView {
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
    _statusRank?: number
}

/** 详情弹窗内扫描结果行（`/api/runs/[id]` 返回的 results 元素） */
interface RunResultView {
    id: string
    packageName: string
    severity: string
    source: string
    fixable: boolean
    fixStrategy: string | null
    recommendedVersion: string | null
    htmlUrl: string | null
}

const route = useRoute()
const loading = ref(true)
const error = ref('')
const runs = ref<RunView[]>([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<{ results: unknown[] } | null>(null)

const statusTone = (status: string) => {
    switch (status) {
        case 'completed':
            return 'success'
        case 'failed':
            return 'danger'
        case 'dispatched':
            return 'primary'
        default:
            return 'warning'
    }
}

const statusLabel = (status: string) => ({
    completed: t('runs.statusCompleted'),
    failed: t('runs.statusFailed'),
    dispatched: t('runs.statusDispatched'),
    running: t('runs.statusRunning'),
})[status] ?? status

/** A 模式 PR 创建失败时 dispatched 状态 Tag 用专门文案（区别于 B 模式「已触发等待结果」） */
const isPrFailedDispatched = (run: RunView) => run.status === 'dispatched' && run.error?.code === 'pr_creation_failed'

const fetchRuns = async () => {
    loading.value = true
    error.value = ''
    try {
        const repoId = route.params.id as string
        const res = await $fetch('/api/runs', { query: { repositoryId: repoId } })
        // 排序键派生：status 走业务语义排序（runs 状态全集与 batch-runs 不同）
        // /api/runs 返回结构为 {items, total, page, pageSize}（向后兼容：pageSize 缺省 100）
        // 本页面无分页控件（属候选删除的兼容路径），仍取全部 items
        const data = res as { items: RunView[] }
        runs.value = withRunStatusRank(data.items)
    } catch (e: any) {
        error.value = t('runs.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

onMounted(fetchRuns)

const openDetail = async (run: RunView) => {
    detailLoading.value = true
    detailVisible.value = true
    try {
        const res = await $fetch(`/api/runs/${run.id}`)
        detail.value = res as { results: unknown[] }
    } catch (e: any) {
        error.value = t('runs.errors.detailLoadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        detailLoading.value = false
    }
}

const backToRepos = () => navigateTo('/repos')
/**
 * 打开 Action run 外链。迁移到 caomei 后 `#cell-*` 插槽行对象为强类型 `RunView`，
 * `runUrl` 可空且行内 `v-if` 的收窄不会带入事件闭包，故在本地 handler 内做非空 guard。
 */
const openRunUrl = (run: RunView) => {
    if (run.runUrl) {
        window.open(run.runUrl, '_blank')
    }
}

const repoId = computed(() => route.params.id as string)

/**
 * 列定义（`columns` 数组 + `#cell-{key}` 插槽）。
 * `key` 即排序字段；`alerts` / `fixed` 无对应字段，仅为单元格插槽占位的唯一 key。
 * `_statusRank` 不设初始排序方向：该设置只影响初始方向，而本页初始无排序，故行为一致。
 */
const columns = computed<DataTableColumn<RunView>[]>(() => [
    { key: '_statusRank', header: t('runs.colStatus'), sortable: true },
    { key: 'mode', header: t('runs.colMode'), sortable: true },
    { key: 'severityThreshold', header: t('runs.colThreshold'), sortable: true },
    { key: 'executorKind', header: t('runs.colExecutor'), sortable: true },
    { key: 'startedAt', header: t('runs.colStartedAt'), sortable: true },
    { key: 'alerts', header: t('runs.colAlerts') },
    { key: 'fixed', header: t('runs.colFixed') },
    { key: 'actions', header: t('runs.colActions'), width: '200px' },
])

/** 详情弹窗内扫描结果（`detail` 为运行时透传，强类型列定义下做一次窄化断言） */
const runResults = computed<RunResultView[]>(() =>
    (detail.value as { results: RunResultView[] } | null)?.results ?? [],
)

/** 详情弹窗内结果表列定义（各列不可排序） */
const resultsColumns = computed<DataTableColumn<RunResultView>[]>(() => [
    { key: 'packageName', header: t('runs.colPackage') },
    { key: 'severity', header: t('runs.colSeverity') },
    { key: 'source', header: t('runs.colSource') },
    { key: 'fixable', header: t('runs.colFixable') },
    { key: 'recommendedVersion', header: t('runs.colRecommended') },
    { key: 'link', header: t('runs.colLink') },
])
</script>

<template>
    <div class="runs">
        <div class="runs__header">
            <div>
                <CaomeiButton
                    variant="ghost"
                    rounded
                    size="sm"
                    :label="t('runs.back')"
                    @click="backToRepos"
                >
                    <template #icon>
                        <CaomeiIcon :icon="ArrowLeft" />
                    </template>
                </CaomeiButton>
                <h2>{{ t('runs.title') }}</h2>
            </div>
        </div>

        <repo-ai-toggle :repository-id="repoId" class="runs__ai-toggle" />

        <CaomeiMessage
            v-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>

        <CaomeiCard v-if="!loading">
            <CaomeiDataTable
                :data="runs"
                :columns="columns"
                row-key="id"
                striped
                :empty-text="t('runs.empty')"
            >
                <template #cell-_statusRank="{row}">
                    <CaomeiTag :tone="statusTone(row.status)">
                        {{ isPrFailedDispatched(row) ? t('batchRuns.runStatus.dispatchedPrFailed') : statusLabel(row.status) }}
                    </CaomeiTag>
                    <small
                        v-if="isPrFailedDispatched(row)"
                        class="d-block mt-1 text-warning"
                    >
                        {{ t('batchRuns.openRunPrFailedHint') }}
                    </small>
                </template>
                <template #cell-executorKind="{row}">
                    <CaomeiTag tone="neutral">
                        {{ row.executorKind === 'github-action' ? t('repos.githubAction') : row.executorKind === 'sandbox' ? t('repos.sandboxContainer') : t('repos.platformContainer') }}
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
                        :label="t('runs.actionViewActionRun')"
                        :title="t('runs.actionViewActionRun')"
                        @click="openRunUrl(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="ExternalLink" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="t('runs.actionViewDetail')"
                        :title="t('runs.actionViewDetail')"
                        @click="openDetail(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Eye" />
                        </template>
                    </CaomeiButton>
                </template>
            </CaomeiDataTable>
        </CaomeiCard>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <CaomeiDialog
            v-model:open="detailVisible"
            :title="t('runs.dialogTitle')"
            modal
            :style="{width: '720px'}"
        >
            <div v-if="detailLoading" class="text-muted">
                {{ t('common.empty.loading') }}
            </div>
            <div v-else-if="detail">
                <CaomeiDataTable
                    :data="runResults"
                    :columns="resultsColumns"
                    :empty-text="t('runs.detailEmpty')"
                >
                    <template #cell-severity="{row}">
                        <CaomeiTag :tone="row.severity === 'critical' ? 'danger' : row.severity === 'high' ? 'warning' : 'primary'">
                            {{ row.severity }}
                        </CaomeiTag>
                    </template>
                    <template #cell-fixable="{row}">
                        <CaomeiTag :tone="row.fixable ? 'success' : 'neutral'">
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
            </div>
        </CaomeiDialog>
    </div>
</template>

<style lang="scss" scoped>
.runs {
    &__header {
        display: flex;
        align-items: center;
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 0 $space-3;
    }
}
</style>
