<script setup lang="ts">
// 告警视图：按仓库/严重级别/来源筛选
import { withFixStatusRank, withSeverityRank } from '~/utils/sort-helpers'

definePageMeta({
    middleware: 'auth',
})

const { t } = useI18n()

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

const severityOptions = computed(() => [
    { label: t('alerts.severityAll'), value: 'all' },
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
    { label: 'Unknown', value: 'unknown' },
])

const sourceOptions = computed(() => [
    { label: t('alerts.sourceAll'), value: 'all' },
    { label: 'Dependabot', value: 'dependabot' },
    { label: 'Code Scanning', value: 'code-scanning' },
    { label: 'pnpm audit', value: 'pnpm-audit' },
])

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

const fixStatusLabel = (status: string) => ({
    success: t('common.fixStatus.success'),
    failed: t('common.fixStatus.failed'),
    skipped: t('common.fixStatus.skipped'),
    converged: t('common.fixStatus.converged'),
})[status] ?? t('common.fixStatus.pending')

const fetchRepositories = async () => {
    try {
        const res = await $fetch('/api/repos')
        repositories.value = [
            { id: 'all', name: t('alerts.allRepositories') },
            ...(res as Array<{ id: string, owner: string, name: string }>).map((r) => ({
                id: r.id,
                name: `${r.owner}/${r.name}`,
            })),
        ]
    } catch {
        repositories.value = [{ id: 'all', name: t('alerts.allRepositories') }]
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
        // 排序键派生：severity / fixStatus 走业务语义排序（非字典序）
        const list = res as AlertView[]
        alerts.value = withFixStatusRank(withSeverityRank(list))
    } catch (e: any) {
        error.value = t('alerts.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
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
                <h2>{{ t('alerts.title') }}</h2>
                <p class="text-muted">
                    {{ t('alerts.subtitle') }}
                </p>
            </div>
        </div>

        <Card class="alerts__filters">
            <template #content>
                <div class="alerts__filter-row">
                    <div class="alerts__filter-field">
                        <label for="repo">{{ t('alerts.filterRepository') }}</label>
                        <Select
                            id="repo"
                            v-model="filters.repositoryId"
                            :options="repositories"
                            option-label="name"
                            option-value="id"
                            :placeholder="t('alerts.allRepositories')"
                            fluid
                        />
                    </div>
                    <div class="alerts__filter-field">
                        <label for="severity">{{ t('alerts.filterSeverity') }}</label>
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
                        <label for="source">{{ t('alerts.filterSource') }}</label>
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
                            :label="t('alerts.filterApply')"
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
                    removable-sort
                    :empty-message="t('alerts.empty')"
                >
                    <Column
                        field="repository"
                        :header="t('alerts.colRepository')"
                        sortable
                    />
                    <Column
                        field="_severityRank"
                        :header="t('alerts.colSeverity')"
                        sortable
                        :default-sort-order="-1"
                    >
                        <template #body="{data}">
                            <Tag :value="data.severity" :severity="severityTagSeverity(data.severity)" />
                        </template>
                    </Column>
                    <Column
                        field="packageName"
                        :header="t('alerts.colPackage')"
                        sortable
                    />
                    <Column
                        field="source"
                        :header="t('alerts.colSource')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="data.source" severity="secondary" />
                        </template>
                    </Column>
                    <Column :header="t('alerts.colFixable')">
                        <template #body="{data}">
                            <Tag
                                :value="data.fixable ? t('common.yes') : t('common.no')"
                                :severity="data.fixable ? 'success' : 'secondary'"
                            />
                        </template>
                    </Column>
                    <Column
                        field="recommendedVersion"
                        :header="t('alerts.colRecommended')"
                        sortable
                    />
                    <Column
                        field="_fixStatusRank"
                        :header="t('alerts.colStatus')"
                        sortable
                        :default-sort-order="-1"
                    >
                        <template #body="{data}">
                            <Tag :value="fixStatusLabel(data.fixStatus)" severity="secondary" />
                        </template>
                    </Column>
                    <Column :header="t('alerts.colLink')">
                        <template #body="{data}">
                            <a
                                v-if="data.htmlUrl"
                                :href="data.htmlUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {{ t('alerts.view') }}
                            </a>
                            <span v-else class="text-muted">—</span>
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
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
