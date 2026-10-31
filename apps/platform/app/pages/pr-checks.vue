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
import { checkAttributionI18nKey, checkAttributionTone, conclusionTagTone, shouldShowAttribution } from '~/utils/pr-check-style'

definePageMeta({
    middleware: 'auth',
})

/** 归一化构建 / 部署信号（服务端 JSON 列解析；`observedAt` 为 ISO 字符串） */
interface PRCheckSignalView {
    kind: 'check' | 'status' | 'deployment'
    provider: string
    name: string
    state: string
    rawState: string | null
    sourceId: string | null
    targetUrl: string | null
    logUrl: string | null
    summary: string | null
    /** 失败归因（历史行无此字段）：与 CLI 报告同一纯函数，平台侧只可能出现 external_noise / cancelled / unknown */
    attribution?: string
    observedAt: string
    /** 是否命中仓库关注集（未配置时恒 true；false = 未关注，不参与聚合 / 告警） */
    focused: boolean
}

/** 失败源条目（服务端 JSON 列解析） */
interface PRCheckFailureSourceView {
    provider: string
    name: string
    kind: string
}

interface PRCheckView {
    id: string
    repositoryId: string
    /** 仓库标签 `owner/name`（服务端解析；关系缺失时为 null，渲染回退「未知仓库」） */
    repository: string | null
    prNumber: number
    headSha: string
    authorLogin: string
    conclusion: string
    /** 聚合构建 / 部署状态（`failure` / `pending` / `success`；null = 本字段上线前的历史行） */
    overallStatus: string | null
    /** 归一化三源信号（null = 本字段上线前的历史行） */
    signals: PRCheckSignalView[] | null
    /** 失败源清单（null = 未采集 / 无失败源） */
    failureSources: PRCheckFailureSourceView[] | null
    /** 该仓库是否配置了关注集（false = 全量告警；true = 只有命中信号参与告警） */
    focusConfigured: boolean
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
 * 行展开状态（受控）：caomei DataTable 的 `expanded-rows` 为行 key 数组，
 * 不回写则内建展开按钮点击无效（与 batch-runs.vue 同模式）。
 */
const expandedRows = ref<string[]>([])
const onUpdateExpandedRows = (rows: string[]) => {
    expandedRows.value = rows
}

/** 信号状态 → 标签色调（聚合状态与单条信号共用取值域） */
const signalStateTone = (state: string): 'danger' | 'success' | 'warning' | 'neutral' => {
    switch (state) {
        case 'failure':
        case 'error':
            return 'danger'
        case 'pending':
            return 'warning'
        case 'success':
            return 'success'
        default:
            return 'neutral'
    }
}

/** 信号来源 → 文案（显式键，避免动态键） */
const signalKindLabel = (kind: string): string => {
    switch (kind) {
        case 'check':
            return t('prChecks.signalsKind.check')
        case 'status':
            return t('prChecks.signalsKind.status')
        case 'deployment':
            return t('prChecks.signalsKind.deployment')
        default:
            return kind
    }
}

/** 信号 / 聚合状态 → 文案（显式键，避免动态键） */
const signalStateLabel = (state: string): string => {
    switch (state) {
        case 'pending':
            return t('prChecks.signalsState.pending')
        case 'success':
            return t('prChecks.signalsState.success')
        case 'failure':
            return t('prChecks.signalsState.failure')
        case 'error':
            return t('prChecks.signalsState.error')
        case 'skipped':
            return t('prChecks.signalsState.skipped')
        default:
            return t('prChecks.signalsState.neutral')
    }
}

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代迁移前的 `<Column>`）。
 * `key` 即排序字段；actions 列不可排序（原 `:exportable="false"` 非迁移前组件库/caomei 有效 prop，按评估 §5.3 删除）。
 */
const columns = computed<DataTableColumn<PRCheckView>[]>(() => [
    // 展开列：展开后展示该 HEAD 的构建 / 部署信号详情（不设 width——caomei 列宽仅对冻结列生效）
    { key: 'expander', expander: true },
    // 仓库列置于 PR 列之前：跨仓库 PR 编号会重号，行内先给出归属才能辨识
    // （`owner/name` 的服务端解析口径与 alerts.vue / env-events.vue 一致）
    // 注：caomei DataTable 的 `column.width` 仅在 frozen 场景参与 tableMinWidth 与吸边偏移计算；
    // 非 frozen 列虽会写入表头内联 width，但在 `table-layout: auto` 下不约束列宽（实测被内容撑开），
    // 故本列宽度与截断由单元内样式 `&__repository` 的固定 max-width 约束
    { key: 'repository', header: t('prChecks.colRepository'), sortable: true },
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
const isPolling = ref(false)

/**
 * 手动触发一轮 PR Check polling（POST /api/pr-checks/poll）。
 * 总开关未启用时后端返回 skipped:true → 以 warning 提示（不视为失败）；成功则提示统计并刷新列表缓存。
 */
const handlePoll = async () => {
    isPolling.value = true
    try {
        const res = await requestFetch<{
            skipped: boolean
            processed: number
            errors: number
            candidateCount: number
            truncated: boolean
        }>('/api/pr-checks/poll', {
            method: 'POST',
        })
        if (res.skipped) {
            toast.warning({
                title: t('prChecks.poll.disabled'),
                duration: 5000,
            })
            return
        }
        if (res.truncated) {
            toast.warning({
                title: t('prChecks.poll.truncated', { candidateCount: res.candidateCount }),
                duration: 5000,
            })
        }
        toast.success({
            title: t('prChecks.poll.success', { processed: res.processed, errors: res.errors }),
            duration: 3000,
        })
        await refresh()
    } catch (error) {
        const message = (error as { data?: { message?: string }, message?: string }).data?.message
            ?? (error as { message?: string }).message
            ?? String(error)
        toast.danger({
            title: t('prChecks.poll.failed', { message }),
            duration: 5000,
        })
    } finally {
        isPolling.value = false
    }
}

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
            <div class="pr-checks__header-text">
                <h2>{{ t('prChecks.title') }}</h2>
                <p>{{ t('prChecks.subtitle') }}</p>
            </div>
            <CaomeiButton
                tone="neutral"
                size="sm"
                :loading="isPolling"
                @click="handlePoll"
            >
                {{ t('prChecks.poll.action') }}
            </CaomeiButton>
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
                :expanded-rows="expandedRows"
                class="pr-checks__table"
                @update:multi-sort-meta="onUpdateMultiSortMeta"
                @update:expanded-rows="onUpdateExpandedRows"
            >
                <!-- 防御分支：`PRCheck.repository` 为 nullable:false + CASCADE，正常路径恒有值（不可达分支，按测试规范 §6.5 不强制守护） -->
                <template #cell-repository="{row}">
                    <span
                        class="pr-checks__repository"
                        :title="row.repository ?? t('prChecks.repositoryUnknown')"
                    >
                        {{ row.repository ?? t('prChecks.repositoryUnknown') }}
                    </span>
                </template>
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
                <!-- 提示挂在取值上（而非表头槽）：语义解释的是「这一格为什么可能很旧」 -->
                <template #cell-lastPolledAt="{row}">
                    <span :title="t('prChecks.colLastPolledAtHint')">
                        {{ new Date(row.lastPolledAt).toLocaleString() }}
                    </span>
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
                <template #expansion="{data: row}">
                    <div class="pr-checks__signals">
                        <div class="pr-checks__signals-head">
                            <span class="pr-checks__signals-title">{{ t('prChecks.signalsTitle') }}</span>
                            <template v-if="row.signals">
                                <span class="pr-checks__signals-label">{{ t('prChecks.signalsAggregate') }}</span>
                                <CaomeiTag :tone="signalStateTone(row.overallStatus ?? 'neutral')">
                                    {{ signalStateLabel(row.overallStatus ?? 'neutral') }}
                                </CaomeiTag>
                                <CaomeiTag
                                    v-if="row.focusConfigured"
                                    tone="neutral"
                                >
                                    {{ t('prChecks.focusConfigured') }}
                                </CaomeiTag>
                                <template v-if="row.failureSources?.length">
                                    <span class="pr-checks__signals-label">{{ t('prChecks.signalsFailureSources') }}</span>
                                    <span class="pr-checks__signals-sources">
                                        {{ row.failureSources.map((source) => `${source.provider} / ${source.name}`).join(' · ') }}
                                    </span>
                                </template>
                            </template>
                        </div>
                        <p
                            v-if="!row.signals"
                            class="pr-checks__signals-empty"
                        >
                            {{ t('prChecks.signalsNone') }}
                        </p>
                        <!-- 防御分支：`[]` 生产不可达（监控器对空信号不落库、fixtures 空数组写 null），按测试规范 §6.5 不强制守护 -->
                        <p
                            v-else-if="row.signals.length === 0"
                            class="pr-checks__signals-empty"
                        >
                            {{ t('prChecks.signalsEmpty') }}
                        </p>
                        <ul
                            v-else
                            class="pr-checks__signal-list"
                        >
                            <li
                                v-for="(signal, index) in row.signals"
                                :key="`${signal.kind}-${signal.provider}-${signal.name}-${index}`"
                                class="pr-checks__signal"
                            >
                                <CaomeiTag tone="neutral">
                                    {{ signalKindLabel(signal.kind) }}
                                </CaomeiTag>
                                <CaomeiTag :tone="signalStateTone(signal.state)">
                                    {{ signalStateLabel(signal.state) }}
                                </CaomeiTag>
                                <CaomeiTag
                                    v-if="row.focusConfigured && !signal.focused"
                                    tone="neutral"
                                >
                                    {{ t('prChecks.signalIgnored') }}
                                </CaomeiTag>
                                <CaomeiTag
                                    v-if="shouldShowAttribution(signal)"
                                    class="pr-checks__signal-attribution"
                                    :tone="checkAttributionTone(signal.attribution)"
                                >
                                    {{ t(checkAttributionI18nKey(signal.attribution)) }}
                                </CaomeiTag>
                                <span class="pr-checks__signal-provider">{{ signal.provider }}</span>
                                <span class="pr-checks__signal-name">{{ signal.name }}</span>
                                <span
                                    v-if="signal.summary"
                                    class="pr-checks__signal-summary"
                                    :title="signal.summary"
                                >
                                    {{ signal.summary }}
                                </span>
                                <a
                                    v-if="signal.targetUrl"
                                    :href="signal.targetUrl"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="pr-checks__signal-link"
                                >
                                    {{ t('prChecks.signalsDetailLink') }}
                                </a>
                                <a
                                    v-if="signal.logUrl"
                                    :href="signal.logUrl"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="pr-checks__signal-link"
                                >
                                    {{ t('prChecks.signalsLogLink') }}
                                </a>
                            </li>
                        </ul>
                    </div>
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
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: $space-3;
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

    // 展开面板：构建 / 部署信号详情
    &__signals {
        padding: $space-2 $space-3;
    }

    &__signals-head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: $space-2;
        margin-bottom: $space-2;
    }

    &__signals-title {
        font-weight: 600;
    }

    &__signals-label {
        font-size: $font-size-sm;
        color: $color-text-muted;
    }

    &__signals-sources {
        font-size: $font-size-sm;
    }

    &__signals-empty {
        margin: 0;
        font-size: $font-size-sm;
        color: $color-text-muted;
    }

    &__signal-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: $space-1;
    }

    &__signal {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: $space-2;
        font-size: $font-size-sm;
    }

    &__signal-provider {
        font-family: monospace;
    }

    &__signal-name {
        font-weight: 500;
    }

    &__signal-summary {
        max-width: 360px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: $color-text-muted;
    }

    &__signal-link {
        color: $color-primary;
        text-decoration: none;
    }

    &__signal-link:hover {
        text-decoration: underline;
    }

    // 仓库列：长 `owner/name` 单元内截断（完整值经 title tooltip 呈现）。
    // 固定 max-width 而非 `100%`——表格为 auto 布局，`max-width: 100%` 会随单元格内容一起增长而不产生截断
    &__repository {
        display: inline-block;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        vertical-align: bottom;
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
