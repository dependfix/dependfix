<script setup lang="ts">
// PR Check 状态监测 UI（详见 docs/plan/todo.md §M24.1 Phase 4）
//
// 数据来源：GET /api/pr-checks（Phase 3 API 层）
// 业务逻辑：service 层按 (repositoryId, prNumber, headSha) 复合唯一索引幂等
//           INSERT/UPDATE 写入 PRCheck，状态机 D3（失败→firing=true；回归 success→
//           自动 ack）。本页面仅渲染 + 用户手动 ack 操作，不参与状态机推断。
//
// 视觉策略：复用 PrimeVue DataTable 视觉模式（与 alerts.vue 同款），但不复用
// alerts-rowgroup subheader（PRCheck 是 per-PR-head 模型，按 repositoryId /
// prNumber 维度无分组价值）。ack 按钮在 alertFiring=true 行内可见，点击触发
// PATCH /api/pr-checks/[id] { alertFiring: false } 关闭告警。
//
// SSR：M16.4 PrimeVue hydration 教训——用 useAsyncData + useRequestFetch
// 自动转发 cookie（Nuxt 4 官方 SSR 转发方案），hydration 阶段 data.value
// 已有完整数据，避免 PrimeVue DataTable processedData 重复计算问题。
import { computed, reactive, ref } from 'vue'
import type { DataTableSortMeta } from 'primevue/datatable'
import { useToast } from 'primevue/usetoast'
import { conclusionTagSeverity } from '~/utils/pr-check-style'

definePageMeta({
    middleware: 'auth',
})

interface PRCheckView {
    id: string
    repositoryId: string
    prNumber: number
    headSha: string
    authorLogin: string
    conclusion: string
    checkRunId: string | null
    detailsUrl: string | null
    errorMessage: string | null
    alertFiring: boolean
    acknowledgedAt: string | null
    acknowledgedByUserId: string | null
    lastPolledAt: string
    createdAt: string
    updatedAt: string
}

interface PRCheckSummary {
    total: number
    firing: number
    acknowledged: number
    byConclusion: Array<{ conclusion: string, count: number }>
}

const { t } = useI18n()
const toast = useToast()

interface Filters {
    repositoryId: string
    alertFiring: string
}

const filters = reactive<Filters>({
    repositoryId: 'all',
    alertFiring: 'all',
})

const alertFiringOptions = computed(() => [
    { label: t('prChecks.alertFiringAll'), value: 'all' },
    { label: t('prChecks.alertFiringTrue'), value: 'true' },
    { label: t('prChecks.alertFiringFalse'), value: 'false' },
])

// SSR-aware 数据获取（SSR 阶段 handler 跑完拿数据，hydration 时 PrimeVue 已能渲染）
const requestFetch = useRequestFetch()

// /api/repos 用于仓库 Dropdown 选项（SSR 阶段就拉取，无 hydration 闪烁）；
// 复用 alerts.vue L130-135 模式，generic 标注规避 TS 5.x 对 $fetch overload 路径推断的栈深度限制。
const { data: repositories } = await useAsyncData<Array<{ id: string, owner: string, name: string }>>(
    'pr-checks-repositories',
    () => requestFetch<Array<{ id: string, owner: string, name: string }>>('/api/repos'),
    { default: () => [] },
)

const repositoryOptions = computed(() => [
    { id: 'all', name: t('prChecks.allRepositories') },
    ...(repositories.value ?? []).map((r) => ({ id: r.id, name: `${r.owner}/${r.name}` })),
])

const { data: rows, refresh } = await useAsyncData<PRCheckView[]>('pr-checks', async () => {
    const params = new URLSearchParams()
    if (filters.repositoryId !== 'all') {
        params.set('repositoryId', filters.repositoryId)
    }
    if (filters.alertFiring !== 'all') {
        params.set('alertFiring', filters.alertFiring)
    }
    return await requestFetch<PRCheckView[]>(`/api/pr-checks?${params.toString()}`)
}, {
    watch: [() => filters.repositoryId, () => filters.alertFiring],
    default: () => [],
})

// Summary（顶部统计卡片）
const { data: summary } = await useAsyncData<PRCheckSummary>('pr-checks-summary', async () => {
    return await requestFetch<PRCheckSummary>('/api/pr-checks/summary')
}, {
    default: () => ({ total: 0, firing: 0, acknowledged: 0, byConclusion: [] }),
})

const sortMeta = ref<DataTableSortMeta[]>([
    { field: 'lastPolledAt', order: -1 },
])

const isAcking = ref<string | null>(null)

const handleAck = async (row: PRCheckView) => {
    isAcking.value = row.id
    try {
        await requestFetch<PRCheckView>(`/api/pr-checks/${row.id}`, {
            method: 'PATCH',
            body: { alertFiring: false },
        })
        toast.add({
            severity: 'success',
            summary: t('prChecks.ack.success', { prNumber: row.prNumber }),
            life: 3000,
        })
        await refresh()
    } catch (error) {
        const message = (error as { data?: { message?: string }, message?: string }).data?.message
            ?? (error as { message?: string }).message
            ?? String(error)
        toast.add({
            severity: 'error',
            summary: t('prChecks.ack.failed', { message }),
            life: 5000,
        })
    } finally {
        isAcking.value = null
    }
}
</script>

<template>
    <div class="pr-checks">
        <header class="pr-checks__header">
            <h2>{{ t('prChecks.title') }}</h2>
            <p>{{ t('prChecks.subtitle') }}</p>
        </header>

        <!-- 顶部统计卡片（4 张：total / firing / acknowledged / byConclusion 最大组） -->
        <section class="pr-checks__summary">
            <div class="pr-checks__summary-card">
                <div class="pr-checks__summary-label">
                    {{ t('prChecks.summary.total') }}
                </div>
                <div class="pr-checks__summary-value">
                    {{ summary?.total ?? 0 }}
                </div>
            </div>
            <div class="pr-checks__summary-card pr-checks__summary-card--firing">
                <div class="pr-checks__summary-label">
                    {{ t('prChecks.summary.firing') }}
                </div>
                <div class="pr-checks__summary-value">
                    {{ summary?.firing ?? 0 }}
                </div>
            </div>
            <div class="pr-checks__summary-card">
                <div class="pr-checks__summary-label">
                    {{ t('prChecks.summary.acked') }}
                </div>
                <div class="pr-checks__summary-value">
                    {{ summary?.acknowledged ?? 0 }}
                </div>
            </div>
            <div class="pr-checks__summary-card">
                <div class="pr-checks__summary-label">
                    {{ t('prChecks.colConclusion') }}
                </div>
                <div class="pr-checks__summary-value pr-checks__summary-byconclusion">
                    <span
                        v-for="row in summary?.byConclusion ?? []"
                        :key="row.conclusion"
                        class="pr-checks__summary-tag"
                    >
                        {{ row.conclusion }}: {{ row.count }}
                    </span>
                </div>
            </div>
        </section>

        <!-- 过滤区 -->
        <section class="pr-checks__filters">
            <div class="pr-checks__filter-row">
                <div class="pr-checks__filter-field">
                    <label for="pr-check-repository">{{ t('prChecks.filterRepository') }}</label>
                    <Dropdown
                        id="pr-check-repository"
                        v-model="filters.repositoryId"
                        :options="repositoryOptions"
                        option-label="name"
                        option-value="id"
                        :placeholder="t('prChecks.allRepositories')"
                        class="pr-checks__filter-dropdown"
                    />
                </div>
                <div class="pr-checks__filter-field">
                    <label for="pr-check-alert-firing">{{ t('prChecks.filterAlertFiring') }}</label>
                    <Dropdown
                        id="pr-check-alert-firing"
                        v-model="filters.alertFiring"
                        :options="alertFiringOptions"
                        option-label="label"
                        option-value="value"
                        class="pr-checks__filter-dropdown"
                    />
                </div>
            </div>
        </section>

        <!-- 列表 -->
        <section class="pr-checks__list">
            <DataTable
                v-model:multi-sort-meta="sortMeta"
                :value="rows ?? []"
                :sort-mode="'multiple'"
                :paginator="true"
                :rows="20"
                :rows-per-page-options="[20, 50, 100]"
                :empty-message="t('prChecks.empty')"
                data-key="id"
                striped-rows
                class="pr-checks__table"
            >
                <Column
                    field="prNumber"
                    :header="t('prChecks.colPrNumber')"
                    sortable
                >
                    <template #body="{ data }">
                        <a
                            v-if="data.detailsUrl"
                            :href="data.detailsUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="pr-checks__pr-link"
                        >
                            #{{ data.prNumber }}
                        </a>
                        <span v-else>#{{ data.prNumber }}</span>
                    </template>
                </Column>
                <Column
                    field="authorLogin"
                    :header="t('prChecks.colAuthor')"
                    sortable
                >
                    <template #body="{ data }">
                        <span class="pr-checks__author">{{ data.authorLogin }}</span>
                    </template>
                </Column>
                <Column
                    field="conclusion"
                    :header="t('prChecks.colConclusion')"
                    sortable
                >
                    <template #body="{ data }">
                        <Tag :severity="conclusionTagSeverity(data.conclusion)" :value="data.conclusion" />
                    </template>
                </Column>
                <Column
                    field="lastPolledAt"
                    :header="t('prChecks.colLastPolledAt')"
                    sortable
                >
                    <template #body="{ data }">
                        {{ new Date(data.lastPolledAt).toLocaleString() }}
                    </template>
                </Column>
                <Column
                    field="alertFiring"
                    :header="t('prChecks.colStatus')"
                    sortable
                >
                    <template #body="{ data }">
                        <Tag
                            v-if="data.alertFiring"
                            severity="danger"
                            :value="t('prChecks.alertFiringTrue')"
                        />
                        <Tag
                            v-else-if="data.acknowledgedAt"
                            severity="secondary"
                            :value="t('prChecks.alertFiringFalse')"
                        />
                        <Tag
                            v-else
                            severity="success"
                            value="OK"
                        />
                    </template>
                </Column>
                <Column :header="t('prChecks.colActions')" :exportable="false">
                    <template #body="{ data }">
                        <Button
                            v-if="data.alertFiring"
                            :label="t('prChecks.ack.action')"
                            severity="secondary"
                            size="small"
                            :loading="isAcking === data.id"
                            @click="handleAck(data)"
                        />
                    </template>
                </Column>
            </DataTable>
        </section>
    </div>
</template>

<style lang="scss" scoped>
.pr-checks {
    padding: $space-4 $space-5;

    &__header {
        margin-bottom: $space-4;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
        color: $color-text-muted;
    }

    // 顶部 4 卡片统计
    &__summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: $space-3;
        margin-bottom: $space-4;
    }

    &__summary-card {
        padding: $space-3;
        background: var(--p-content-background);
        border: 1px solid var(--p-content-border-color);
        border-radius: $radius-md;

        &--firing {
            border-color: $color-danger;
        }
    }

    &__summary-label {
        font-size: $font-size-sm;
        color: $color-text-muted;
        margin-bottom: $space-1;
    }

    &__summary-value {
        font-size: $font-size-xl;
        font-weight: 600;
    }

    &__summary-byconclusion {
        display: flex;
        flex-wrap: wrap;
        gap: $space-1;
        font-size: $font-size-sm;
        font-weight: 400;
    }

    &__summary-tag {
        padding: 2px $space-2;
        background: var(--p-content-hover-background);
        border-radius: $radius-sm;
    }

    // 过滤区
    &__filters {
        margin-bottom: $space-3;
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
        min-width: 200px;
    }

    &__filter-field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }

    &__filter-dropdown {
        width: 100%;
    }

    // PR 链接：与 alerts.vue colRuleId 同款视觉（外部链接打开）
    &__pr-link {
        color: $color-primary;
        text-decoration: none;
    }

    &__pr-link:hover {
        text-decoration: underline;
    }

    &__author {
        font-family: monospace;
        font-size: $font-size-sm;
    }
}
</style>
