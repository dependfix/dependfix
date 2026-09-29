<script setup lang="ts">
// 环境/容器审计事件视图（env-events）
// 数据源：GET /api/audit-events（sandbox 启动降级 / 运行时失败事件 + 通知状态）
// 过滤维度：type / severity / notified / repositoryId
import { computed } from 'vue'
import { ChevronDown, ChevronUp, Funnel } from '@lucide/vue'
import type { DataTableColumn, InputType } from 'caomei-ui'
import { withEnvEventSeverityRank } from '~/utils/sort-helpers'

definePageMeta({
    middleware: 'auth',
})

const { t } = useI18n()

/**
 * caomei Input 的 `type` 联合仅含 text/password/email/search/tel/url，但内层原生 input 原样透传
 * 该属性，datetime-local 在浏览器可用；此处收窄以在保留 CaomeiInput 样式的同时支持时间范围筛选。
 */
const dateTimeLocalType = 'datetime-local' as unknown as InputType

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
    /** 派生：severity 业务语义排序键（critical > error > warn > info）。 */
    _severityRank?: number
    /** 派生：message 预览文本（payloadJson.degradedReason.message ?? payloadJson.message），
     *  用作 message 列 sortable 排序键。 */
    messageText?: string
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

const severityTagTone = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'danger'
        case 'error':
            return 'danger'
        case 'warn':
            return 'warning'
        case 'info':
            return 'primary'
        default:
            return 'neutral'
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
        // 排序键派生：severity 走业务语义排序（非字典序）；messageText 取 payloadJson 摘要文本用于 message 列排序
        const list = res as EnvEventView[]
        events.value = withEnvEventSeverityRank(list).map((e) => ({
            ...e,
            messageText: extractMessagePreview(e.payloadJson),
        }))
    } catch (e: unknown) {
        const err = e as { data?: { message?: string }, message?: string }
        error.value = t('envEvents.errors.loadFailed', {
            message: err.data?.message ?? err.message ?? t('common.errors.unknown'),
        })
    } finally {
        loading.value = false
    }
}

/** 从 payloadJson 派生 message 列排序文本（payloadJson.degradedReason.message ?? payloadJson.message）。 */
const extractMessagePreview = (json: string | null): string => {
    const p = parsePayload(json)
    if (!p) return ''
    const degraded = (p.degradedReason as { message?: string } | undefined)?.message
    return degraded ?? (p.message as string | undefined) ?? ''
}

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代迁移前的 `<Column>`）。
 * - `key` 即排序字段（`field` 语义并入 `key`）：severity 列用 rank 字段 `_severityRank`，
 *   message 列用派生的 `messageText`（均为 sortable 的排序键）
 * - 原 `<Column field="_severityRank" :default-sort-order="-1">` 的 `default-sort-order` 删除：
 *   实测迁移前组件库该 prop 只影响点击循环方向、不影响初始状态（初始为未排序 `aria-sort="none"`）；
 *   caomei 默认三态循环 asc → desc → 移除，与迁移前组件库行为一致，故不设 `multiSortMeta` 初值
 * - `removable-sort` 删除：caomei/TanStack 三态默认等价
 */
const columns = computed<DataTableColumn<EnvEventView>[]>(() => [
    { key: 'type', header: t('envEvents.colType'), sortable: true },
    { key: '_severityRank', header: t('envEvents.colSeverity'), sortable: true },
    { key: 'repository', header: t('envEvents.colRepository'), sortable: true },
    { key: 'messageText', header: t('envEvents.colMessage'), sortable: true },
    { key: 'notified', header: t('envEvents.colNotified'), sortable: true },
    { key: 'createdAt', header: t('envEvents.colTime'), sortable: true },
])

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

        <CaomeiCard class="env-events__filters">
            <div class="env-events__filter-row">
                <div class="env-events__filter-field">
                    <label for="type">{{ t('envEvents.filterType') }}</label>
                    <CaomeiSelect
                        id="type"
                        v-model="filters.type"
                        :options="typeOptions"
                        option-label="label"
                        option-value="value"
                    />
                </div>
                <div class="env-events__filter-field">
                    <label for="severity">{{ t('envEvents.filterSeverity') }}</label>
                    <CaomeiSelect
                        id="severity"
                        v-model="filters.severity"
                        :options="severityOptions"
                        option-label="label"
                        option-value="value"
                    />
                </div>
                <div class="env-events__filter-field">
                    <label for="notified">{{ t('envEvents.filterNotified') }}</label>
                    <CaomeiSelect
                        id="notified"
                        v-model="filters.notified"
                        :options="notifiedOptions"
                        option-label="label"
                        option-value="value"
                    />
                </div>
                <div class="env-events__filter-field">
                    <label for="from">{{ t('envEvents.filterFrom') }}</label>
                    <CaomeiInput
                        id="from"
                        v-model="filters.from"
                        :type="dateTimeLocalType"
                    />
                </div>
                <div class="env-events__filter-field">
                    <label for="to">{{ t('envEvents.filterTo') }}</label>
                    <CaomeiInput
                        id="to"
                        v-model="filters.to"
                        :type="dateTimeLocalType"
                    />
                </div>
                <div class="env-events__filter-action">
                    <CaomeiButton @click="fetchEvents">
                        <template #icon>
                            <CaomeiIcon :icon="Funnel" />
                        </template>
                        {{ t('envEvents.filterApply') }}
                    </CaomeiButton>
                </div>
            </div>
        </CaomeiCard>

        <CaomeiMessage
            v-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>

        <CaomeiCard v-if="!loading" class="env-events__table">
            <!-- caomei 无 DataTable `scrollable` / `scroll-height`：用外层容器 + CSS 承接滚动 -->
            <div class="env-events__table-scroll">
                <CaomeiDataTable
                    :data="events"
                    :columns="columns"
                    row-key="id"
                    striped
                    :empty-text="t('envEvents.empty')"
                >
                    <template #cell-type="{row}">
                        <CaomeiTag tone="neutral">
                            {{ typeLabel(row.type) }}
                        </CaomeiTag>
                    </template>
                    <template #cell-_severityRank="{row}">
                        <CaomeiTag :tone="severityTagTone(row.severity)">
                            {{ row.severity }}
                        </CaomeiTag>
                    </template>
                    <template #cell-messageText="{row}">
                        <span v-if="!isExpanded(row.id)" class="env-events__message-preview">
                            {{ (() => {
                                const p = parsePayload(row.payloadJson)
                                if (!p) return '—'
                                const m = (p.degradedReason as {message?: string} | undefined)?.message
                                    ?? (p.message as string | undefined)
                                return m ?? '—'
                            })() }}
                        </span>
                        <pre v-else class="env-events__message-full">{{ row.payloadJson ?? '—' }}</pre>
                        <CaomeiButton
                            v-if="row.payloadJson"
                            variant="ghost"
                            size="sm"
                            class="env-events__expand-btn"
                            @click="toggleExpanded(row.id)"
                        >
                            <template #icon>
                                <CaomeiIcon :icon="isExpanded(row.id) ? ChevronUp : ChevronDown" />
                            </template>
                            {{ isExpanded(row.id) ? t('envEvents.collapse') : t('envEvents.expand') }}
                        </CaomeiButton>
                    </template>
                    <template #cell-notified="{row}">
                        <CaomeiTag :tone="row.notified ? 'success' : 'neutral'">
                            {{ row.notified ? t('envEvents.notifiedYes') : t('envEvents.notifiedNo') }}
                        </CaomeiTag>
                        <small v-if="row.notifiedVia" class="env-events__notified-via text-muted">
                            via {{ row.notifiedVia }}
                        </small>
                    </template>
                    <template #cell-createdAt="{row}">
                        {{ formatTime(row.createdAt) }}
                    </template>
                </CaomeiDataTable>
            </div>
        </CaomeiCard>
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

    // caomei 无 DataTable `scrollable`：外层容器承接 60vh 纵向滚动（表头非吸顶，见交付说明遗留差异）
    &__table-scroll {
        max-height: 60vh;
        overflow: auto;
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

    &__filter-action {
        display: flex;
        align-items: flex-end;
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
        background: rgb(0 0 0 / 0.05);
        border-radius: 4px;
        font-size: $font-size-sm;
        overflow-x: auto;
    }

    @include dark-mode {
        &__message-full {
            background: rgb(255 255 255 / 0.05);
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
