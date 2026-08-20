<script setup lang="ts">
// 环境/容器审计事件视图（env-events）
// 数据源：GET /api/audit-events（sandbox 启动降级 / 运行时失败事件 + 通知状态）
// 过滤维度：type / severity / notified / repositoryId
import { computed } from 'vue'

definePageMeta({
    middleware: 'auth',
})

const { t } = useI18n()

interface EnvEventView {
    id: string
    type: string
    severity: string
    repository: string | null
    scanRunId: string | null
    payloadJson: string | null
    notified: boolean
    notifiedVia: string | null
    createdAt: string
}

const loading = ref(true)
const error = ref('')
const events = ref<EnvEventView[]>([])
const expandedIds = ref<Set<string>>(new Set())

const filters = ref({
    type: 'all',
    severity: 'all',
    notified: 'all',
    /** 时间范围过滤（ISO 字符串；空 = 不限） */
    from: '',
    to: '',
})

const typeOptions = computed(() => [
    { label: t('envEvents.typeAll'), value: 'all' },
    { label: t('envEvents.typeSandboxUnavailable'), value: 'sandbox_unavailable' },
    { label: t('envEvents.typeSandboxDegraded'), value: 'sandbox_degraded' },
    { label: t('envEvents.typeDockerDaemonDown'), value: 'docker_daemon_down' },
])

const severityOptions = computed(() => [
    { label: t('envEvents.severityAll'), value: 'all' },
    { label: t('envEvents.severityInfo'), value: 'info' },
    { label: t('envEvents.severityWarn'), value: 'warn' },
    { label: t('envEvents.severityError'), value: 'error' },
    { label: t('envEvents.severityCritical'), value: 'critical' },
])

const notifiedOptions = computed(() => [
    { label: t('envEvents.notifiedAll'), value: 'all' },
    { label: t('envEvents.notifiedYes'), value: 'true' },
    { label: t('envEvents.notifiedNo'), value: 'false' },
])

const severityTagSeverity = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'danger'
        case 'error':
            return 'danger'
        case 'warn':
            return 'warn'
        case 'info':
            return 'info'
        default:
            return 'secondary'
    }
}

const typeLabel = (type: string) => {
    switch (type) {
        case 'sandbox_unavailable':
            return t('envEvents.typeSandboxUnavailable')
        case 'sandbox_degraded':
            return t('envEvents.typeSandboxDegraded')
        case 'docker_daemon_down':
            return t('envEvents.typeDockerDaemonDown')
        default:
            return type
    }
}

const formatTime = (iso: string) => {
    try {
        return new Date(iso).toLocaleString()
    } catch {
        return iso
    }
}

const parsePayload = (json: string | null): Record<string, unknown> | null => {
    if (!json) return null
    try {
        return JSON.parse(json)
    } catch {
        return null
    }
}

const isExpanded = (id: string) => expandedIds.value.has(id)
const toggleExpanded = (id: string) => {
    const next = new Set(expandedIds.value)
    if (next.has(id)) {
        next.delete(id)
    } else {
        next.add(id)
    }
    expandedIds.value = next
}

const fetchEvents = async () => {
    loading.value = true
    error.value = ''
    try {
        const query: Record<string, string> = {}
        if (filters.value.type !== 'all') query.type = filters.value.type
        if (filters.value.severity !== 'all') query.severity = filters.value.severity
        if (filters.value.notified !== 'all') query.notified = filters.value.notified
        // 时间范围：转 ISO datetime（Zod .datetime() 接受带 offset；这里用 .toISOString() 输出 UTC）
        if (filters.value.from) {
            const d = new Date(filters.value.from)
            if (!Number.isNaN(d.getTime())) query.from = d.toISOString()
        }
        if (filters.value.to) {
            const d = new Date(filters.value.to)
            if (!Number.isNaN(d.getTime())) query.to = d.toISOString()
        }
        const res = await $fetch('/api/audit-events', { query })
        events.value = res as EnvEventView[]
    } catch (e: unknown) {
        const err = e as { data?: { message?: string }, message?: string }
        error.value = t('envEvents.errors.loadFailed', {
            message: err.data?.message ?? err.message ?? t('common.errors.unknown'),
        })
    } finally {
        loading.value = false
    }
}

onMounted(fetchEvents)
</script>

<template>
    <div class="env-events">
        <div class="env-events__header">
            <div>
                <h2>{{ t('envEvents.title') }}</h2>
                <p class="text-muted">
                    {{ t('envEvents.subtitle') }}
                </p>
            </div>
        </div>

        <Card class="env-events__filters">
            <template #content>
                <div class="env-events__filter-row">
                    <div class="env-events__filter-field">
                        <label for="type">{{ t('envEvents.filterType') }}</label>
                        <Select
                            id="type"
                            v-model="filters.type"
                            :options="typeOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="env-events__filter-field">
                        <label for="severity">{{ t('envEvents.filterSeverity') }}</label>
                        <Select
                            id="severity"
                            v-model="filters.severity"
                            :options="severityOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="env-events__filter-field">
                        <label for="notified">{{ t('envEvents.filterNotified') }}</label>
                        <Select
                            id="notified"
                            v-model="filters.notified"
                            :options="notifiedOptions"
                            option-label="label"
                            option-value="value"
                            fluid
                        />
                    </div>
                    <div class="env-events__filter-field">
                        <label for="from">{{ t('envEvents.filterFrom') }}</label>
                        <InputText
                            id="from"
                            v-model="filters.from"
                            type="datetime-local"
                            fluid
                        />
                    </div>
                    <div class="env-events__filter-field">
                        <label for="to">{{ t('envEvents.filterTo') }}</label>
                        <InputText
                            id="to"
                            v-model="filters.to"
                            type="datetime-local"
                            fluid
                        />
                    </div>
                    <div class="env-events__filter-field">
                        <Button
                            :label="t('envEvents.filterApply')"
                            icon="pi pi-filter"
                            @click="fetchEvents"
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

        <Card v-if="!loading" class="env-events__table">
            <template #content>
                <DataTable
                    :value="events"
                    striped-rows
                    size="small"
                    data-key="id"
                    scrollable
                    scroll-height="60vh"
                    :empty-message="t('envEvents.empty')"
                >
                    <Column :header="t('envEvents.colType')">
                        <template #body="{data}">
                            <Tag :value="typeLabel(data.type)" severity="secondary" />
                        </template>
                    </Column>
                    <Column :header="t('envEvents.colSeverity')">
                        <template #body="{data}">
                            <Tag :value="data.severity" :severity="severityTagSeverity(data.severity)" />
                        </template>
                    </Column>
                    <Column field="repository" :header="t('envEvents.colRepository')" />
                    <Column :header="t('envEvents.colMessage')">
                        <template #body="{data}">
                            <span v-if="!isExpanded(data.id)" class="env-events__message-preview">
                                {{ (() => {
                                    const p = parsePayload(data.payloadJson)
                                    if (!p) return '—'
                                    const m = (p.degradedReason as {message?: string} | undefined)?.message
                                        ?? (p.message as string | undefined)
                                    return m ?? '—'
                                })() }}
                            </span>
                            <pre v-else class="env-events__message-full">{{ data.payloadJson ?? '—' }}</pre>
                            <Button
                                v-if="data.payloadJson"
                                :label="isExpanded(data.id) ? t('envEvents.collapse') : t('envEvents.expand')"
                                :icon="isExpanded(data.id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                                text
                                size="small"
                                class="env-events__expand-btn"
                                @click="toggleExpanded(data.id)"
                            />
                        </template>
                    </Column>
                    <Column :header="t('envEvents.colNotified')">
                        <template #body="{data}">
                            <Tag
                                :value="data.notified ? t('envEvents.notifiedYes') : t('envEvents.notifiedNo')"
                                :severity="data.notified ? 'success' : 'secondary'"
                            />
                            <small v-if="data.notifiedVia" class="env-events__notified-via text-muted">
                                via {{ data.notifiedVia }}
                            </small>
                        </template>
                    </Column>
                    <Column field="createdAt" :header="t('envEvents.colTime')">
                        <template #body="{data}">
                            {{ formatTime(data.createdAt) }}
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
.env-events {
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

    &__message-preview {
        display: inline-block;
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: middle;
    }

    &__message-full {
        display: block;
        max-width: 480px;
        padding: $space-2;
        margin: 0 0 $space-2;
        background: rgba(0, 0, 0, 0.05);
        border-radius: 4px;
        font-size: $font-size-sm;
        overflow-x: auto;
    }

    @include dark-mode {
        &__message-full {
            background: rgba(255, 255, 255, 0.05);
        }
    }

    &__expand-btn {
        margin-left: $space-2;
    }

    &__notified-via {
        display: block;
        font-size: $font-size-sm;
    }
}
</style>
