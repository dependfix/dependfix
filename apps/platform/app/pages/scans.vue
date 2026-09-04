<script setup lang="ts">
// /scans 独立页面（todo.md §M16.1）：
// - 顶部 4 块汇总卡片（totalRuns / totalAlerts / totalFixed / 最近扫描）
// - 按仓库聚合列表（byRepo DataTable，可点击"仅查看此仓库"过滤）
// - 全运行列表（runList DataTable，分页 + 可点击进入详情 dialog）
//
// 三种 query 组合：
// - /scans：全量展示
// - /scans?repository=xxx：按仓库过滤（来自 repos.vue pi-history 跳转）
// - /scans?run=xxx：直接打开单 run 详情（`repo-history-dialog` query-key='run'）
//
// 依赖：/api/runs（todo.md §M14.2 已闭环分页 + ids 过滤 + §M16.1 加 organizationId 隔离）
//      /api/scan-history/summary（todo.md §M16.1 新增聚合端点）
//      `repo-history-dialog` 组件（queryKey='run' mode 直接打开 detail）
//
// 非目标（todo.md §M16 阶段边界）：
// - 不引入多组织；不重写后端聚合；不动 dashboard.vue；不动 batch-runs 跨仓库视图
// - 不升 PrimeVue 5；不破坏既有 alerts-rowgroup / history-dialog / 视图切换 / dedupe 行为
import {
    alertsFound,
    runExecutorLabel,
    runModeLabel,
} from '~/utils/run-view'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()

// 三态分离（与 alerts.vue / batch-runs.vue 同模式）：
// - firstLoad: 首屏骨架控制
// - loading: 手动刷新按钮 loading 反馈
// - inflight: 实际请求是否 in-flight（并发守卫）
const firstLoad = ref(true)
const loading = ref(false)
const inflight = ref(false)
const summaryLoading = ref(false)
const summaryInflight = ref(false)
const error = ref('')
const summaryError = ref('')

interface SummaryResponse {
    byStatus: Record<string, number>
    totals: { runs: number, totalAlerts: number, totalFixed: number }
    repositories: Array<{
        repositoryId: string
        owner: string
        name: string
        runCount: number
        alertCount: number
        fixedCount: number
        lastRunAt: string | null
        lastStatus: string | null
    }>
    window: { start: string | null, end: string | null, included: number, limit: number }
    filtered: { repositoryId: string | null }
}

interface SummaryView extends SummaryResponse {
    lastRunAt: string | null
}

const summary = ref<SummaryView | null>(null)

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
}

const runs = ref<RunView[]>([])
const total = ref(0)
const pageSize = ref(10)
const first = ref(0)

// query ?repository= 与 query ?run= 解析（scans 页面三态入口）
const repositoryIdQuery = computed(() => {
    const raw = route.query.repository
    return typeof raw === 'string' && raw.length > 0 ? raw : null
})

const filteredRepository = ref<{ id: string, owner: string, name: string } | null>(null)

/** summary 聚合加载（顶部 4 卡 + byRepo 表） */
const fetchSummary = async () => {
    if (summaryInflight.value) {
        return
    }
    summaryInflight.value = true
    summaryLoading.value = true
    summaryError.value = ''
    try {
        const query: Record<string, string> = {}
        if (repositoryIdQuery.value) {
            query.repositoryId = repositoryIdQuery.value
        }
        const res = await $fetch('/api/scan-history/summary', { query })
        const data = res as SummaryResponse
        const lastRunAt = data.window.end
        summary.value = { ...data, lastRunAt }
        // 当 repositoryIdQuery 命中时，从聚合中查找目标仓库信息显示面包屑
        if (repositoryIdQuery.value) {
            const found = data.repositories.find((r) => r.repositoryId === repositoryIdQuery.value)
            filteredRepository.value = found
                ? { id: found.repositoryId, owner: found.owner, name: found.name }
                : null
        } else {
            filteredRepository.value = null
        }
    } catch (e: any) {
        summaryError.value = t('scans.runList.errors.summaryFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        summaryLoading.value = false
        summaryInflight.value = false
    }
}

/** runs 列表加载（paginated /api/runs） */
const fetchRuns = async (page = 1, rows = pageSize.value) => {
    if (inflight.value) {
        return
    }
    inflight.value = true
    loading.value = true
    error.value = ''
    try {
        const query: Record<string, string | number> = {
            page,
            pageSize: rows,
        }
        if (repositoryIdQuery.value) {
            query.repositoryId = repositoryIdQuery.value
        }
        const res = await $fetch('/api/runs', { query })
        const data = res as { items: RunView[], total: number }
        runs.value = data.items
        total.value = data.total
    } catch (e: any) {
        error.value = t('scans.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
        inflight.value = false
        firstLoad.value = false
    }
}

/** 并发刷新 summary + runs（保留 in-flight 守卫） */
const refresh = async () => {
    await Promise.all([fetchSummary(), fetchRuns(1, pageSize.value)])
    first.value = 0
}

/** PrimeVue DataTable @page 事件：page 0-indexed */
const onPage = async (event: { page: number, first: number, rows: number }) => {
    pageSize.value = event.rows
    first.value = event.first
    await fetchRuns(event.page + 1, event.rows)
}

/** 状态 Tag 颜色 + 文案（与 `repo-history-dialog` 风格一致） */
const statusSeverity = (status: string) => {
    switch (status) {
        case 'completed':
            return 'success' as const
        case 'failed':
            return 'danger' as const
        case 'dispatched':
            return 'info' as const
        case 'degraded':
            return 'warn' as const
        default:
            return 'secondary' as const
    }
}

const statusLabel = (status: string) => ({
    completed: t('runs.statusCompleted'),
    failed: t('runs.statusFailed'),
    dispatched: t('runs.statusDispatched'),
    running: t('runs.statusRunning'),
    pending: t('common.status.pending'),
    degraded: t('runs.statusDegraded'),
})[status] ?? status

/** 进入 run 详情（list 行点击 → 跳 /scans?run=） */
const openRunDetail = (runId: string) => {
    void router.push({ path: '/scans', query: { ...route.query, run: runId } })
}

/** 按仓库过滤（byRepo 行点击"仅查看此仓库"按钮） */
const filterByRepository = (repo: { id: string }) => {
    void router.push({ path: '/scans', query: { repository: repo.id } })
}

/** 清除仓库过滤（回到 /scans） */
const clearFilter = () => {
    void router.push({ path: '/scans' })
}

// 监听 repositoryIdQuery 变化（用户点 byRepo 过滤 / 清除过滤）
watch(repositoryIdQuery, async () => {
    first.value = 0
    pageSize.value = 10
    await refresh()
})

onMounted(refresh)
</script>

<template>
    <div class="scans">
        <div class="scans__header">
            <div>
                <h2>{{ t('scans.title') }}</h2>
                <p class="text-muted">
                    {{ t('scans.subtitle') }}
                </p>
            </div>
            <div class="scans__header-actions">
                <Button
                    icon="pi pi-refresh"
                    :label="t('common.actions.refresh')"
                    severity="secondary"
                    :loading="loading || summaryLoading"
                    @click="refresh"
                />
            </div>
        </div>

        <!-- 仓库过滤面包屑（scans?repository=xxx） -->
        <Message
            v-if="filteredRepository"
            severity="info"
            :closable="false"
            class="scans__filter-banner"
        >
            <div class="scans__filter-row">
                <span>
                    {{ t('scans.repoFilterActive', {owner: filteredRepository.owner, name: filteredRepository.name}) }}
                </span>
                <Button
                    icon="pi pi-times"
                    :label="t('scans.clearFilter')"
                    severity="secondary"
                    text
                    size="small"
                    @click="clearFilter"
                />
            </div>
        </Message>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>
        <Message
            v-if="summaryError"
            severity="warn"
            :closable="false"
        >
            {{ summaryError }}
        </Message>

        <!-- 4 块汇总卡片（todo.md §M16.1） -->
        <div class="scans__summary">
            <Card class="scans__stat">
                <template #content>
                    <div class="scans__stat-value">
                        {{ summary?.totals.runs ?? 0 }}
                    </div>
                    <div class="scans__stat-label text-muted">
                        {{ t('scans.summary.totalRuns') }}
                    </div>
                </template>
            </Card>
            <Card class="scans__stat">
                <template #content>
                    <div class="scans__stat-value">
                        {{ summary?.totals.totalAlerts ?? 0 }}
                    </div>
                    <div class="scans__stat-label text-muted">
                        {{ t('scans.summary.totalAlerts') }}
                    </div>
                </template>
            </Card>
            <Card class="scans__stat">
                <template #content>
                    <div class="scans__stat-value">
                        {{ summary?.totals.totalFixed ?? 0 }}
                    </div>
                    <div class="scans__stat-label text-muted">
                        {{ t('scans.summary.totalFixed') }}
                    </div>
                </template>
            </Card>
            <Card class="scans__stat">
                <template #content>
                    <div class="scans__stat-value scans__stat-value--sm">
                        {{ summary?.lastRunAt ? d(new Date(summary.lastRunAt), 'short') : '—' }}
                    </div>
                    <div class="scans__stat-label text-muted">
                        {{ t('scans.summary.lastRunAt') }}
                    </div>
                </template>
            </Card>
        </div>

        <!-- 按仓库聚合（byRepo DataTable，可点击"仅查看此仓库"过滤） -->
        <h3 class="scans__section-title">
            {{ t('scans.byRepo.title') }}
        </h3>
        <Card>
            <template #content>
                <DataTable
                    :value="summary?.repositories ?? []"
                    data-key="repositoryId"
                    striped-rows
                    size="small"
                    :empty-message="t('scans.byRepo.empty')"
                >
                    <Column :header="t('scans.byRepo.colOwner')" field="owner" />
                    <Column :header="t('scans.byRepo.colName')" field="name" />
                    <Column
                        :header="t('scans.byRepo.colRuns')"
                        field="runCount"
                        sortable
                    />
                    <Column
                        :header="t('scans.byRepo.colAlerts')"
                        field="alertCount"
                        sortable
                    />
                    <Column
                        :header="t('scans.byRepo.colFixed')"
                        field="fixedCount"
                        sortable
                    />
                    <Column :header="t('scans.byRepo.colLastRun')">
                        <template #body="{data}">
                            {{ data.lastRunAt ? d(new Date(data.lastRunAt), 'short') : '—' }}
                        </template>
                    </Column>
                    <Column :header="t('scans.byRepo.colLastStatus')">
                        <template #body="{data}">
                            <Tag
                                v-if="data.lastStatus"
                                :value="statusLabel(data.lastStatus)"
                                :severity="statusSeverity(data.lastStatus)"
                            />
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                    <Column :header="t('scans.byRepo.colActions')" :style="{width: '180px'}">
                        <template #body="{data}">
                            <Button
                                icon="pi pi-filter"
                                text
                                rounded
                                size="small"
                                :disabled="!!repositoryIdQuery && repositoryIdQuery === data.repositoryId"
                                :aria-label="t('scans.byRepo.actionFilterThis')"
                                :title="t('scans.byRepo.actionFilterThis')"
                                @click="filterByRepository({id: data.repositoryId})"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>

        <!-- 全运行列表（paginated DataTable；点击行进入 ?run= 详情） -->
        <h3 class="scans__section-title">
            {{ t('scans.runList.title') }}
        </h3>
        <Card v-if="!firstLoad">
            <template #content>
                <DataTable
                    :value="runs"
                    data-key="id"
                    lazy
                    paginator
                    paginator-template="PrevPageLink CurrentPageReport NextPageLink RowsPerPageDropdown"
                    :current-page-report-template="t('runs.paginatorInfo', {first: '{first}', last: '{last}', total: '{totalRecords}'})"
                    :rows="pageSize"
                    :total-records="total"
                    :first="first"
                    :rows-per-page-options="[10, 25, 50]"
                    :loading="loading"
                    striped-rows
                    size="small"
                    :empty-message="t('scans.runList.empty')"
                    @page="onPage"
                >
                    <Column :header="t('runs.colRepo')">
                        <template #body="{data}">
                            <span v-if="data.owner && data.name">{{ data.owner }}/{{ data.name }}</span>
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                    <Column :header="t('runs.colStatus')">
                        <template #body="{data}">
                            <span
                                v-if="data.error"
                                class="scans__status-wrap"
                                :title="data.error.message"
                            >
                                <Tag
                                    :value="statusLabel(data.status)"
                                    :severity="statusSeverity(data.status)"
                                />
                            </span>
                            <Tag
                                v-else
                                :value="statusLabel(data.status)"
                                :severity="statusSeverity(data.status)"
                            />
                        </template>
                    </Column>
                    <Column :header="t('runs.colMode')">
                        <template #body="{data}">
                            {{ runModeLabel(data.mode, t) }}
                        </template>
                    </Column>
                    <Column :header="t('runs.colThreshold')">
                        <template #body="{data}">
                            {{ data.severityThreshold === 'all' ? t('common.severity.all') : data.severityThreshold }}
                        </template>
                    </Column>
                    <Column :header="t('runs.colExecutor')">
                        <template #body="{data}">
                            <Tag :value="runExecutorLabel(data.executorKind, t)" severity="secondary" />
                        </template>
                    </Column>
                    <Column :header="t('runs.colStartedAt')">
                        <template #body="{data}">
                            {{ data.startedAt ? d(new Date(data.startedAt), 'long') : '—' }}
                        </template>
                    </Column>
                    <Column :header="t('runs.colAlerts')">
                        <template #body="{data}">
                            {{ alertsFound(data.summary) }}
                        </template>
                    </Column>
                    <Column :header="t('runs.colFixed')">
                        <template #body="{data}">
                            {{ (data.summary as Record<string, number> | null)?.alertsFixed ?? 0 }}
                        </template>
                    </Column>
                    <Column :header="t('runs.colActions')" :style="{width: '120px'}">
                        <template #body="{data}">
                            <Button
                                icon="pi pi-eye"
                                text
                                rounded
                                size="small"
                                :aria-label="t('runs.actionViewDetail')"
                                :title="t('runs.actionViewDetail')"
                                @click="openRunDetail(data.id)"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p
            v-else
            class="text-muted"
        >
            {{ t('common.empty.loading') }}
        </p>

        <!-- 详情 dialog 兜底（/scans?run=xxx 触发；queryKey='run' 直接打开 detail） -->
        <repo-history-dialog query-key="run" />
    </div>
</template>

<style lang="scss" scoped>
.scans {
    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-5;
        h2 { margin: 0 0 $space-1; }
        p { margin: 0; font-size: $font-size-sm; }
    }
    &__header-actions { display: flex; align-items: center; gap: $space-2; }

    &__filter-banner {
        margin-bottom: $space-4;
    }
    &__filter-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-2;
    }

    &__summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: $space-4;
        margin-bottom: $space-5;
    }
    &__stat-value {
        font-size: $font-size-xl;
        font-weight: 600;
        color: var(--p-primary-color);
        &--sm { font-size: $font-size-base; font-weight: 500; }
    }
    &__stat-label {
        margin-top: $space-1;
        font-size: $font-size-sm;
    }

    &__section-title {
        margin: $space-5 0 $space-3;
        font-size: $font-size-lg;
        font-weight: 600;
    }

    &__status-wrap {
        display: inline-flex;
        cursor: help;
    }
}

@media (max-width: 900px) {
    .scans__summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
