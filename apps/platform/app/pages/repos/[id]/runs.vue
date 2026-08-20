<script setup lang="ts">
// 扫描历史：按仓库查看运行列表与详情
// 注意：本页面已被 C51 应用层修复迁入 RepoHistoryDialog（见 docs/plan/todo.md §C51），但保留兼容——
// 用户直接访问 /repos/{id}/runs 仍可使用（C58 候选删除，见 docs/plan/backlog.md §C58）。
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

const route = useRoute()
const loading = ref(true)
const error = ref('')
const runs = ref<RunView[]>([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<{ results: unknown[] } | null>(null)

const statusSeverity = (status: string) => {
    switch (status) {
        case 'completed':
            return 'success'
        case 'failed':
            return 'danger'
        case 'dispatched':
            return 'info'
        default:
            return 'warn'
    }
}

const statusLabel = (status: string) => ({
    completed: t('runs.statusCompleted'),
    failed: t('runs.statusFailed'),
    dispatched: t('runs.statusDispatched'),
    running: t('runs.statusRunning'),
})[status] ?? status

const fetchRuns = async () => {
    loading.value = true
    error.value = ''
    try {
        const repoId = route.params.id as string
        const res = await $fetch('/api/runs', { query: { repositoryId: repoId } })
        // 排序键派生：status 走业务语义排序（RG-W03 修复——runs 状态全集与 batch-runs 不同）
        const list = res as RunView[]
        runs.value = withRunStatusRank(list)
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
const openRunUrl = (url: string) => {
    window.open(url, '_blank')
}
</script>

<template>
    <div class="runs">
        <div class="runs__header">
            <div>
                <Button
                    icon="pi pi-arrow-left"
                    text
                    rounded
                    size="small"
                    :aria-label="t('runs.back')"
                    @click="backToRepos"
                />
                <h2>{{ t('runs.title') }}</h2>
            </div>
        </div>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>

        <Card v-if="!loading">
            <template #content>
                <DataTable
                    :value="runs"
                    striped-rows
                    size="small"
                    removable-sort
                    :empty-message="t('runs.empty')"
                >
                    <Column
                        field="_statusRank"
                        :header="t('runs.colStatus')"
                        sortable
                        :default-sort-order="-1"
                    >
                        <template #body="{data}">
                            <Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" />
                        </template>
                    </Column>
                    <Column
                        field="mode"
                        :header="t('runs.colMode')"
                        sortable
                    />
                    <Column
                        field="severityThreshold"
                        :header="t('runs.colThreshold')"
                        sortable
                    />
                    <Column
                        field="executorKind"
                        :header="t('runs.colExecutor')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="data.executorKind === 'github-action' ? t('repos.githubAction') : data.executorKind === 'sandbox' ? t('repos.sandboxContainer') : t('repos.platformContainer')" severity="secondary" />
                        </template>
                    </Column>
                    <Column
                        field="startedAt"
                        :header="t('runs.colStartedAt')"
                        sortable
                    >
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
        </Card>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <Dialog
            v-model:visible="detailVisible"
            :header="t('runs.dialogTitle')"
            modal
            :draggable="false"
            :style="{width: '720px'}"
        >
            <div v-if="detailLoading" class="text-muted">
                {{ t('common.empty.loading') }}
            </div>
            <div v-else-if="detail">
                <DataTable
                    :value="(detail as {results: Array<{id: string; packageName: string; severity: string; source: string; fixable: boolean; fixStrategy: string | null; recommendedVersion: string | null; htmlUrl: string | null}>}).results"
                    striped-rows
                    size="small"
                    :empty-message="t('runs.detailEmpty')"
                >
                    <Column field="packageName" :header="t('runs.colPackage')" />
                    <Column :header="t('runs.colSeverity')">
                        <template #body="{data}">
                            <Tag :value="data.severity" :severity="data.severity === 'critical' ? 'danger' : data.severity === 'high' ? 'warn' : 'info'" />
                        </template>
                    </Column>
                    <Column field="source" :header="t('runs.colSource')" />
                    <Column :header="t('runs.colFixable')">
                        <template #body="{data}">
                            <Tag :value="data.fixable ? t('common.yes') : t('common.no')" :severity="data.fixable ? 'success' : 'secondary'" />
                        </template>
                    </Column>
                    <Column field="recommendedVersion" :header="t('runs.colRecommended')" />
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
            </div>
        </Dialog>
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
