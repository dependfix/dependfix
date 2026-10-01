<script setup lang="ts">
// PR Check 状态监测 UI
//
// 数据来源：GET /api/pr-checks
// 业务逻辑：service 层按 (repositoryId, prNumber, headSha) 复合唯一索引幂等
//           INSERT/UPDATE 写入 PRCheck，状态机（失败→firing=true；回归 success→
//           自动 ack）。本页面仅渲染 + 用户手动 ack 操作，不参与状态机推断。
//
// 视觉策略：复用 DataTable 视觉模式（与 alerts.vue 同款），但不复用
// alerts-rowgroup subheader（PRCheck 是 per-PR-head 模型，按 repositoryId /
// prNumber 维度无分组价值）。ack 按钮在 alertFiring=true 行内可见，点击触发
// PATCH /api/pr-checks/[id] { alertFiring: false } 关闭告警。
//
// SSR：用 useAsyncData + useRequestFetch 自动转发 cookie（Nuxt 4 官方 SSR 转发方案），
// hydration 阶段 data.value 已有完整数据，避免 DataTable processedData 重复计算问题。
import { computed, reactive, ref } from 'vue'
import type { DataTableColumn, DataTableSortMeta } from 'caomei-ui'
import type { PRCheckConclusion } from '#server/entities/pr-check'
import { conclusionTagTone } from '~/utils/pr-check-style'

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

// SSR-aware 数据获取（SSR 阶段 handler 跑完拿数据，hydration 时迁移前组件库已能渲染）
const requestFetch = useRequestFetch()

// /api/repos 用于仓库选项（SSR 阶段就拉取，无 hydration 闪烁）；
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

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代迁移前的 `<Column>`）。
 * `key` 即排序字段；actions 列不可排序（原 `:exportable="false"` 非迁移前组件库/caomei 有效 prop，按评估 §5.3 删除）。
 */
const columns = computed<DataTableColumn<PRCheckView>[]>(() => [
    { key: 'prNumber', header: t('prChecks.colPrNumber'), sortable: true },
    { key: 'authorLogin', header: t('prChecks.colAuthor'), sortable: true },
    { key: 'conclusion', header: t('prChecks.colConclusion'), sortable: true },
    { key: 'lastPolledAt', header: t('prChecks.colLastPolledAt'), sortable: true },
    { key: 'alertFiring', header: t('prChecks.colStatus'), sortable: true },
    { key: 'actions', header: t('prChecks.colActions') },
])

/**
 * 受控多列排序回写：提供 `multi-sort-meta` 时 caomei 进入受控模式，
 * 不回写则点击列头不改变排序（等价迁移前的 `v-model:multi-sort-meta`）。
 */
const onUpdateMultiSortMeta = (meta: DataTableSortMeta[]) => {
    sortMeta.value = meta
}

const isAcking = ref<string | null>(null)

const handleAck = async (row: PRCheckView) => {
    isAcking.value = row.id
    try {
        await requestFetch<PRCheckView>(`/api/pr-checks/${row.id}`, {
            method: 'PATCH',
            body: { alertFiring: false },
        })
        toast.success({
            title: t('prChecks.ack.success', { prNumber: row.prNumber }),
            duration: 3000,
        })
        await refresh()
    } catch (error) {
        const message = (error as { data?: { message?: string }, message?: string }).data?.message
            ?? (error as { message?: string }).message
            ?? String(error)
        toast.danger({
            title: t('prChecks.ack.failed', { message }),
            duration: 5000,
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
                <div class="pr-checks__summary-byconclusion pr-checks__summary-value">
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
                    <CaomeiSelect
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
                    <CaomeiSelect
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
            <CaomeiDataTable
                :data="rows ?? []"
                :columns="columns"
                row-key="id"
                striped
                sort-mode="multiple"
                :multi-sort-meta="sortMeta"
                :paginator="true"
                :rows="20"
                :rows-per-page-options="[20, 50, 100]"
                :empty-text="t('prChecks.empty')"
                class="pr-checks__table"
                @update:multi-sort-meta="onUpdateMultiSortMeta"
            >
                <template #cell-prNumber="{row}">
                    <a
                        v-if="row.detailsUrl"
                        :href="row.detailsUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="pr-checks__pr-link"
                    >
                        #{{ row.prNumber }}
                    </a>
                    <span v-else>#{{ row.prNumber }}</span>
                </template>
                <template #cell-authorLogin="{row}">
                    <span class="pr-checks__author">{{ row.authorLogin }}</span>
                </template>
                <template #cell-conclusion="{row}">
                    <!-- caomei 插槽行对象为强类型：API 层 conclusion 为 string，此处按服务端枚举窄化（DB 枚举约束兜底） -->
                    <CaomeiTag :tone="conclusionTagTone(row.conclusion as PRCheckConclusion)">
                        {{ row.conclusion }}
                    </CaomeiTag>
                </template>
                <template #cell-lastPolledAt="{row}">
                    {{ new Date(row.lastPolledAt).toLocaleString() }}
                </template>
                <template #cell-alertFiring="{row}">
                    <CaomeiTag
                        v-if="row.alertFiring"
                        tone="danger"
                    >
                        {{ t('prChecks.alertFiringTrue') }}
                    </CaomeiTag>
                    <CaomeiTag
                        v-else-if="row.acknowledgedAt"
                        tone="neutral"
                    >
                        {{ t('prChecks.alertFiringFalse') }}
                    </CaomeiTag>
                    <CaomeiTag
                        v-else
                        tone="success"
                    >
                        OK
                    </CaomeiTag>
                </template>
                <template #cell-actions="{row}">
                    <CaomeiButton
                        v-if="row.alertFiring"
                        tone="neutral"
                        size="sm"
                        :loading="isAcking === row.id"
                        @click="handleAck(row)"
                    >
                        {{ t('prChecks.ack.action') }}
                    </CaomeiButton>
                </template>
            </CaomeiDataTable>
        </section>
    </div>
</template>

<style lang="scss" scoped>
.pr-checks {
    padding: $space-4 $space-5;

    // 本页 DataTable 原未设迁移前组件库 `size`（默认档 12px 16px），更接近 caomei 默认单元格密度
    // （`--caomei-space-2` / `--caomei-space-3` = 8px 12px），而非全局收敛用的 small 档（6px 8px）。
    // 故此处恢复 caomei 默认密度（特异性 0,4,1 > 全局覆盖的 0,2,1）。
    &__table :deep(.caomei-data-table__table th.caomei-data-table__th),
    &__table :deep(.caomei-data-table__table td.caomei-data-table__td) {
        padding: var(--caomei-space-2) var(--caomei-space-3);
    }

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
        background: var(--caomei-color-bg);
        border: 1px solid var(--caomei-color-border);
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
        background: var(--caomei-color-bg-elevated);
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
        @include field-stack;

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
