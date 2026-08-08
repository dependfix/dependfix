<script setup lang="ts">
// 扫描历史：按仓库查看运行列表与详情
definePageMeta({
    middleware: 'auth',
})

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

const statusLabel = (status: string) => {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        case 'dispatched':
            return '已触发'
        case 'running':
            return '执行中'
        default:
            return status
    }
}

const fetchRuns = async () => {
    loading.value = true
    error.value = ''
    try {
        const repoId = route.params.id as string
        const res = await $fetch('/api/runs', { query: { repositoryId: repoId } })
        runs.value = res as RunView[]
    } catch (e: any) {
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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
        error.value = `详情加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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
                    aria-label="返回"
                    @click="backToRepos"
                />
                <h2>扫描历史</h2>
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
                    :empty-message="'暂无扫描记录'"
                >
                    <Column header="状态">
                        <template #body="{data}">
                            <Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" />
                        </template>
                    </Column>
                    <Column field="mode" header="模式" />
                    <Column field="severityThreshold" header="阈值" />
                    <Column header="执行方式">
                        <template #body="{data}">
                            <Tag :value="data.executorKind === 'github-action' ? 'GitHub Action' : '平台容器'" severity="secondary" />
                        </template>
                    </Column>
                    <Column header="开始时间">
                        <template #body="{data}">
                            {{ data.startedAt ? new Date(data.startedAt).toLocaleString() : '—' }}
                        </template>
                    </Column>
                    <Column header="告警数">
                        <template #body="{data}">
                            {{ (data.summary as Record<string, number> | null)?.alertsFound ?? 0 }}
                        </template>
                    </Column>
                    <Column header="已修复">
                        <template #body="{data}">
                            {{ (data.summary as Record<string, number> | null)?.alertsFixed ?? 0 }}
                        </template>
                    </Column>
                    <Column header="操作" :style="{width: '200px'}">
                        <template #body="{data}">
                            <Button
                                v-if="data.runUrl"
                                icon="pi pi-external-link"
                                text
                                rounded
                                size="small"
                                aria-label="查看 Action 运行"
                                title="查看 Action 运行"
                                @click="openRunUrl(data.runUrl)"
                            />
                            <Button
                                icon="pi pi-eye"
                                text
                                rounded
                                size="small"
                                aria-label="查看详情"
                                title="查看详情"
                                @click="openDetail(data)"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            加载中…
        </p>

        <Dialog
            v-model:visible="detailVisible"
            header="扫描详情"
            modal
            :style="{width: '720px'}"
        >
            <div v-if="detailLoading" class="text-muted">
                加载中…
            </div>
            <div v-else-if="detail">
                <DataTable
                    :value="(detail as {results: Array<{id: string; packageName: string; severity: string; source: string; fixable: boolean; fixStrategy: string | null; recommendedVersion: string | null; htmlUrl: string | null}>}).results"
                    striped-rows
                    size="small"
                    :empty-message="'本次扫描无告警明细'"
                >
                    <Column field="packageName" header="包" />
                    <Column header="严重级别">
                        <template #body="{data}">
                            <Tag :value="data.severity" :severity="data.severity === 'critical' ? 'danger' : data.severity === 'high' ? 'warn' : 'info'" />
                        </template>
                    </Column>
                    <Column field="source" header="来源" />
                    <Column header="可修复">
                        <template #body="{data}">
                            <Tag :value="data.fixable ? '是' : '否'" :severity="data.fixable ? 'success' : 'secondary'" />
                        </template>
                    </Column>
                    <Column field="recommendedVersion" header="推荐版本" />
                    <Column header="链接">
                        <template #body="{data}">
                            <a
                                v-if="data.htmlUrl"
                                :href="data.htmlUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                查看
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
