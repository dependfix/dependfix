<script setup lang="ts">
// 扫描历史 Dialog（应用层修复：替代 unrouting 0.2.x 子路由 /repos/[id]/runs，
// 用 query ?history={id} 传仓库 id，绕开 `:id()` dynamic segment 与 path-to-regexp 8.x
// 不兼容的根因 —— 用户点击 pi-history 按钮后 url 跳到 /repos?history={id}，本组件 watch
// 识别并自动打开 Dialog。单 Dialog 内部 list/detail view 切换，关闭时清空 query）。
//
// 分页（todo.md §M14.2 UX-R1）：服务端分页（lazy DataTable + Paginator）。
// 默认 pageSize=10，rows-per-page-options=[10, 25, 50]，最大 200 由 server 钳制。
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
const repoId = ref<string | null>(null)
const runs = ref<HistoryRunView[]>([])
const total = ref(0)
const pageSize = ref(10)
const first = ref(0)
const loading = ref(false)
const error = ref('')
// detail 含 status + error（用于 Error Banner 展示失败原因）+ results；扩展自 { results: unknown[] }
// 实测反馈：详情面板需展示执行级错误，否则失败 run 详情仅能看到空 alerts 表
const detail = ref<{ status: string, error: { code: string, message: string } | null, results: unknown[] } | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const

const resetDetail = () => {
    detail.value = null
    detailError.value = ''
    detailLoading.value = false
}

const statusSeverity = (status: string) => {
    switch (status) {
        case 'completed': return 'success'
        case 'failed': return 'danger'
        case 'dispatched': return 'info'
        default: return 'warn'
    }
}

const statusLabel = (status: string) => ({
    completed: t('runs.statusCompleted'),
    failed: t('runs.statusFailed'),
    dispatched: t('runs.statusDispatched'),
    running: t('runs.statusRunning'),
})[status] ?? status

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

// PrimeVue DataTable @page 事件：page 0-indexed，first 是首行索引（rows × page）
const onPage = async (event: { page: number, first: number, rows: number }) => {
    pageSize.value = event.rows
    first.value = event.first
    if (repoId.value) {
        await fetchRuns(repoId.value, event.page + 1, event.rows)
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
    resetDetail()
    if (route.query.history !== undefined) {
        const { history: _h, ...rest } = route.query
        await router.replace({ query: rest })
    }
}

// 监听 URL ?history={id} → 自动打开 Dialog
watch(() => route.query.history, async (newVal) => {
    const id = typeof newVal === 'string'
        ? newVal
        : Array.isArray(newVal) ? newVal[0] : null
    if (id) {
        if (repoId.value !== id) {
            repoId.value = id
            // 切换仓库：重置 first 与 pageSize（保留首次进入默认；避免切换后 UI 高亮页与 server 数据不一致）
            first.value = 0
            pageSize.value = 10
            resetDetail()
            await fetchRuns(id, 1, pageSize.value)
        }
        dialogVisible.value = true
    } else if (dialogVisible.value) {
        // query 被外部清空（如浏览器后退），同步关闭
        await closeDialog()
    }
}, { immediate: true })
</script>

<template>
    <Dialog
        v-model:visible="dialogVisible"
        :header="t('runs.title')"
        modal
        :draggable="false"
        :closable="!detail"
        :close-on-escape="!detail"
        :style="{width: '720px'}"
        @hide="closeDialog"
    >
        <div v-if="loading && runs.length === 0" class="text-muted">
            {{ t('common.empty.loading') }}
        </div>
        <Message
            v-else-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>
        <div v-else-if="detailLoading" class="text-muted">
            {{ t('common.empty.loading') }}
        </div>
        <Message
            v-else-if="detailError"
            severity="error"
            :closable="false"
        >
            {{ detailError }}
        </Message>
        <!-- 实测反馈：detail.status === 'failed' 时在 results 表格 header 内展示执行级 Error Banner，
             即使 detail.error 为空（数据损坏 / 旧数据迁移 / 后端 errorJson 缺失）也显示降级提示（RG-W02）。
             放在 DataTable #header slot 内避免与外面 v-else-if="detail" 链冲突 -->
        <DataTable
            v-else-if="detail"
            :value="(detail as {results: Array<{id: string; packageName: string; severity: string; source: string; fixable: boolean; fixStrategy: string | null; recommendedVersion: string | null; htmlUrl: string | null}>}).results"
            striped-rows
            size="small"
            :empty-message="t('runs.detailEmpty')"
        >
            <template #header>
                <div class="repo-history__detail-header">
                    <Button
                        icon="pi pi-arrow-left"
                        :label="t('runs.backToList')"
                        text
                        size="small"
                        @click="resetDetail"
                    />
                    <Message
                        v-if="detail.status === 'failed'"
                        severity="error"
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
                    </Message>
                </div>
            </template>
            <Column :header="t('runs.colPackage')" field="packageName" />
            <Column :header="t('runs.colSeverity')">
                <template #body="{data}">
                    <Tag
                        :value="data.severity"
                        :severity="data.severity === 'critical' ? 'danger' : data.severity === 'high' ? 'warn' : 'info'"
                    />
                </template>
            </Column>
            <Column :header="t('runs.colSource')" field="source" />
            <Column :header="t('runs.colFixable')">
                <template #body="{data}">
                    <Tag
                        :value="data.fixable ? t('common.yes') : t('common.no')"
                        :severity="data.fixable ? 'success' : 'secondary'"
                    />
                </template>
            </Column>
            <Column :header="t('runs.colRecommended')" field="recommendedVersion" />
            <Column :header="t('runs.colLink')">
                <template #body="{data}">
                    <a
                        v-if="data.htmlUrl"
                        :href="data.htmlUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {{ t('runs.view') }}
                    </a>
                </template>
            </Column>
        </DataTable>
        <template v-else>
            <!-- todo.md §M14.2 UX-R1：服务端分页（lazy DataTable + 内置 paginator）
                 —— pageSize 由 pageSize.value 驱动，total 由后端返回的 total 驱动，
                 翻页触发 onPage → 重新请求 /api/runs 带 page + pageSize -->
            <DataTable
                :value="runs"
                lazy
                paginator
                paginator-template="PrevPageLink CurrentPageReport NextPageLink RowsPerPageDropdown"
                :current-page-report-template="t('runs.paginatorInfo', {first: '{first}', last: '{last}', total: '{totalRecords}'})"
                :rows="pageSize"
                :total-records="total"
                :first="first"
                :rows-per-page-options="[...PAGE_SIZE_OPTIONS]"
                :loading="loading"
                striped-rows
                size="small"
                :empty-message="t('runs.empty')"
                @page="onPage"
            >
                <Column :header="t('runs.colStatus')">
                    <template #body="{data}">
                        <!-- 实测反馈：failed 状态 Tag 包一层 span :title 显示 error.message
                             （PrimeVue Tag inheritAttrs:false，:title 不会自动 fallthrough 到 root） -->
                        <span
                            v-if="data.error"
                            class="repo-history__status-wrap"
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
                <Column :header="t('runs.colMode')" field="mode" />
                <Column :header="t('runs.colThreshold')" field="severityThreshold" />
                <Column :header="t('runs.colStartedAt')">
                    <template #body="{data}">
                        {{ data.startedAt ? d(new Date(data.startedAt), 'long') : '—' }}
                    </template>
                </Column>
                <Column :header="t('runs.colAlerts')">
                    <template #body="{data}">
                        {{ (data.summary as Record<string, number> | null)?.alertsFound ?? 0 }}
                    </template>
                </Column>
                <Column :header="t('runs.colFixed')">
                    <template #body="{data}">
                        {{ (data.summary as Record<string, number> | null)?.alertsFixed ?? 0 }}
                    </template>
                </Column>
                <Column :header="t('runs.colActions')" :style="{width: '200px'}">
                    <template #body="{data}">
                        <Button
                            v-if="data.runUrl"
                            icon="pi pi-external-link"
                            text
                            rounded
                            size="small"
                            :aria-label="t('runs.actionViewActionRun')"
                            :title="t('runs.actionViewActionRun')"
                            @click="openRunUrl(data.runUrl)"
                        />
                        <Button
                            icon="pi pi-eye"
                            text
                            rounded
                            size="small"
                            :aria-label="t('runs.actionViewDetail')"
                            :title="t('runs.actionViewDetail')"
                            @click="openDetail(data)"
                        />
                    </template>
                </Column>
            </DataTable>
        </template>
    </Dialog>
</template>

<style lang="scss" scoped>
// 实测反馈：失败执行级错误展示样式（detail Error Banner + 列表 status Tag 包裹）
.repo-history {
    &__error-banner {
        margin-bottom: $space-3;
    }

    &__error-message {
        margin: $space-2 0 0;
        word-break: break-word;
    }

    &__status-wrap {
        // inline-flex 让 span 紧贴 Tag 内部尺寸，title 命中区域 = Tag 渲染范围
        display: inline-flex;
        cursor: help;
    }
}
</style>
