<script setup lang="ts">
// 告警视图：按仓库/严重级别/来源筛选
definePageMeta({
    middleware: 'auth',
})

interface AlertView {
    id: string
    runId: string
    repository: string | null
    source: string
    severity: string
    packageName: string
    manifestPath: string | null
    ruleId: string | null
    summary: string | null
    fixable: boolean
    fixStrategy: string | null
    recommendedVersion: string | null
    htmlUrl: string | null
    fixStatus: string
    errorMessage: string | null
}

const loading = ref(true)
const error = ref('')
const alerts = ref<AlertView[]>([])
const repositories = ref<{ id: string, name: string }[]>([])

const filters = ref({
    repositoryId: 'all',
    severity: 'all',
    source: 'all',
})

const severityOptions = [
    { label: '全部级别', value: 'all' },
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
    { label: 'Unknown', value: 'unknown' },
]

const sourceOptions = [
    { label: '全部来源', value: 'all' },
    { label: 'Dependabot', value: 'dependabot' },
    { label: 'Code Scanning', value: 'code-scanning' },
    { label: 'pnpm audit', value: 'pnpm-audit' },
]

const severityTagSeverity = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'danger'
        case 'high':
            return 'warn'
        case 'medium':
            return 'info'
        default:
            return 'secondary'
    }
}

const fixStatusLabel = (status: string) => {
    switch (status) {
        case 'success':
            return '已修复'
        case 'failed':
            return '失败'
        case 'skipped':
            return '跳过'
        case 'converged':
            return '已收敛'
        default:
            return '未处理'
    }
}

const fetchRepositories = async () => {
    try {
        const res = await $fetch('/api/repos')
        repositories.value = [
            { id: 'all', name: '全部仓库' },
            ...(res as Array<{ id: string, owner: string, name: string }>).map((r) => ({
                id: r.id,
                name: `${r.owner}/${r.name}`,
            })),
        ]
    } catch {
        repositories.value = [{ id: 'all', name: '全部仓库' }]
    }
}

const fetchAlerts = async () => {
    loading.value = true
    error.value = ''
    try {
        const query: Record<string, string> = {}
        if (filters.value.repositoryId !== 'all') {
            query.repositoryId = filters.value.repositoryId
        }
        if (filters.value.severity !== 'all') {
            query.severity = filters.value.severity
        }
        if (filters.value.source !== 'all') {
            query.source = filters.value.source
        }
        const res = await $fetch('/api/alerts', { query })
        alerts.value = res as AlertView[]
    } catch (e: any) {
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        loading.value = false
    }
}

onMounted(async () => {
    await fetchRepositories()
    await fetchAlerts()
})
</script>

<template>
    <div class="alerts">
        <div class="alerts__header">
            <div>
                <h2>告警视图</h2>
                <p class="text-muted">
                    按仓库/严重级别/来源筛选告警
                </p>
            </div>
        </div>

        <Card class="alerts__filters">
            <template #content>
                <div class="alerts__filter-row">
                    <div class="alerts__filter-field">
                        <label for="repo">仓库</label>
                        <Select
                            id="repo"
                            v-model="filters.repositoryId"
                            :options="repositories"
                            option-label="name"
                            option-value="id"
                            placeholder="全部仓库"
                            fluid
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <label for="severity">严重级别</label>
                        <Select
                            id="severity"
                            v-model="filters.severity"
                            :options="severityOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <label for="source">来源</label>
                        <Select
                            id="source"
                            v-model="filters.source"
                            :options="sourceOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <Button
                            label="筛选"
                            icon="pi pi-filter"
                            @click="fetchAlerts"
                        />
                    </div>
                </div>
            </template>
        </Card>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>

        <Card v-if="!loading" class="alerts__table">
            <template #content>
                <DataTable
                    :value="alerts"
                    striped-rows
                    size="small"
                    :empty-message="'暂无告警数据（可先在仓库页触发扫描）'"
                >
                    <Column field="repository" header="仓库" />
                    <Column header="严重级别">
                        <template #body="{data}">
                            <Tag :value="data.severity" :severity="severityTagSeverity(data.severity)" />
                        </template>
                    </Column>
                    <Column field="packageName" header="包/规则" />
                    <Column header="来源">
                        <template #body="{data}">
                            <Tag :value="data.source" severity="secondary" />
                        </template>
                    </Column>
                    <Column header="可修复">
                        <template #body="{data}">
                            <Tag
                                :value="data.fixable ? '是' : '否'"
                                :severity="data.fixable ? 'success' : 'secondary'"
                            />
                        </template>
                    </Column>
                    <Column field="recommendedVersion" header="推荐版本" />
                    <Column header="状态">
                        <template #body="{data}">
                            <Tag :value="fixStatusLabel(data.fixStatus)" severity="secondary" />
                        </template>
                    </Column>
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
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            加载中…
        </p>
    </div>
</template>

<style lang="scss" scoped>
.alerts {
    &__header {
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }

    &__filters {
        margin-bottom: $space-4;
    }

    &__filter-row {
        display: flex;
        align-items: flex-end;
        gap: $space-4;
        flex-wrap: wrap;
    }

    &__filter-field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        min-width: 160px;
    }

    &__filter-field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }
}
</style>
