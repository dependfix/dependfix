<script setup lang="ts">
// 扫描历史 Dialog（应用层修复：替代 unrouting 0.2.x 子路由 /repos/[id]/runs，
// 用 query ?history={id} 传仓库 id，绕开 `:id()` dynamic segment 与 path-to-regexp 8.x
// 不兼容的根因 —— 用户点击 pi-history 按钮后 url 跳到 /repos?history={id}，本组件 watch
// 识别并自动打开 Dialog。单 Dialog 内部 list/detail view 切换，关闭时清空 query）
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
const loading = ref(false)
const error = ref('')
const detail = ref<{ results: unknown[] } | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

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

const fetchRuns = async (id: string) => {
    loading.value = true
    error.value = ''
    try {
        const res = await $fetch('/api/runs', { query: { repositoryId: id } })
        runs.value = res as HistoryRunView[]
    } catch (e: any) {
        error.value = t('runs.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

const openDetail = async (run: HistoryRunView) => {
    resetDetail()
    detailLoading.value = true
    try {
        const res = await $fetch(`/api/runs/${run.id}`)
        detail.value = res as { results: unknown[] }
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
            resetDetail()
            await fetchRuns(id)
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
        <DataTable
            v-else-if="detail"
            :value="(detail as {results: Array<{id: string; packageName: string; severity: string; source: string; fixable: boolean; fixStrategy: string | null; recommendedVersion: string | null; htmlUrl: string | null}>}).results"
            striped-rows
            size="small"
            :empty-message="t('runs.detailEmpty')"
        >
            <template #header>
                <Button
                    icon="pi pi-arrow-left"
                    :label="t('runs.backToList')"
                    text
                    size="small"
                    @click="resetDetail"
                />
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
            <DataTable
                :value="runs"
                striped-rows
                size="small"
                :empty-message="t('runs.empty')"
            >
                <Column :header="t('runs.colStatus')">
                    <template #body="{data}">
                        <Tag
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
