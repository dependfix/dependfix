<script setup lang="ts">
/**
 * 扫描页「全部运行」筛选条（自 scans.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 纯展示组件：筛选状态与查询派生由页面持有（`use-run-filters`），这里只渲染
 * 三维筛选 + 开始时间区间 + 阶段分布计数 + 清除 / 导出入口，并把交互事件上抛。
 */
import { Download, X } from '@lucide/vue'
import type { SplitButtonMenuItem } from 'caomei-ui'

defineProps<{
    status: string
    failureStage: string
    failureKind: string
    fromDate: Date | null
    toDate: Date | null
    statusOptions: { label: string, value: string }[]
    failureStageOptions: { label: string, value: string }[]
    failureKindOptions: { label: string, value: string }[]
    failureStageCounts: { stage: string, label: string, count: number }[]
    hasActiveFilters: boolean
    /** 导出二级菜单（「全部筛选结果」一档，超限时由页面置 disabled） */
    exportItems: SplitButtonMenuItem[]
    exportDisabled: boolean
    exporting: boolean
}>()

const emit = defineEmits<{
    'update:status': [value: string]
    'update:failureStage': [value: string]
    'update:failureKind': [value: string]
    'update:fromDate': [value: Date | null]
    'update:toDate': [value: Date | null]
    clear: []
    exportPage: []
}>()

const { t } = useI18n()

/** caomei Select 载荷窄化（筛选项恒为字符串） */
const asOptionValue = (value: string | number | null | undefined) => String(value ?? '')
</script>

<template>
    <CaomeiCard class="scans__run-filters">
        <div class="scans__run-filter-row">
            <div class="scans__run-filter-field">
                <label for="run-status">{{ t('scans.runList.filterStatus') }}</label>
                <CaomeiSelect
                    id="run-status"
                    :model-value="status"
                    :options="statusOptions"
                    option-label="label"
                    option-value="value"
                    @update:model-value="emit('update:status', asOptionValue($event))"
                />
            </div>
            <div class="scans__run-filter-field">
                <label for="run-failure-stage">{{ t('scans.runList.filterFailureStage') }}</label>
                <CaomeiSelect
                    id="run-failure-stage"
                    :model-value="failureStage"
                    :options="failureStageOptions"
                    option-label="label"
                    option-value="value"
                    @update:model-value="emit('update:failureStage', asOptionValue($event))"
                />
            </div>
            <div class="scans__run-filter-field">
                <label for="run-failure-kind">{{ t('scans.runList.filterFailureKind') }}</label>
                <CaomeiSelect
                    id="run-failure-kind"
                    :model-value="failureKind"
                    :options="failureKindOptions"
                    option-label="label"
                    option-value="value"
                    @update:model-value="emit('update:failureKind', asOptionValue($event))"
                />
            </div>
            <div class="scans__run-filter-field">
                <label for="run-from">{{ t('scans.runList.filterFrom') }}</label>
                <CaomeiDatePicker
                    id="run-from"
                    :model-value="fromDate"
                    show-time
                    hour-format="24"
                    :placeholder="t('scans.runList.filterFromPlaceholder')"
                    class="scans__run-date"
                    @update:model-value="emit('update:fromDate', $event)"
                />
            </div>
            <div class="scans__run-filter-field">
                <label for="run-to">{{ t('scans.runList.filterTo') }}</label>
                <CaomeiDatePicker
                    id="run-to"
                    :model-value="toDate"
                    show-time
                    hour-format="24"
                    :placeholder="t('scans.runList.filterToPlaceholder')"
                    class="scans__run-date"
                    @update:model-value="emit('update:toDate', $event)"
                />
            </div>
            <div v-if="hasActiveFilters" class="scans__run-filter-field scans__run-filter-field--action">
                <CaomeiButton
                    tone="neutral"
                    variant="ghost"
                    size="sm"
                    @click="emit('clear')"
                >
                    <template #icon>
                        <CaomeiIcon :icon="X" />
                    </template>
                    {{ t('scans.runList.clearFilters') }}
                </CaomeiButton>
            </div>
            <div class="scans__run-filter-field scans__run-filter-field--action">
                <CaomeiSplitButton
                    tone="neutral"
                    variant="ghost"
                    size="sm"
                    :model="exportItems"
                    :disabled="exportDisabled"
                    :loading="exporting"
                    :menu-label="t('scans.runList.exportMenuLabel')"
                    @click="emit('exportPage')"
                >
                    <template #icon>
                        <CaomeiIcon :icon="Download" />
                    </template>
                    {{ t('scans.runList.exportLogs') }}
                </CaomeiSplitButton>
            </div>
        </div>
        <div v-if="failureStageCounts.length > 0" class="scans__failure-summary">
            <span class="text-muted">{{ t('scans.runList.failureStageSummary') }}</span>
            <CaomeiTag
                v-for="item in failureStageCounts"
                :key="item.stage"
                tone="neutral"
            >
                {{ item.label }} · {{ item.count }}
            </CaomeiTag>
        </div>
    </CaomeiCard>
</template>

<style lang="scss" scoped>
.scans__run-filters {
    margin-bottom: $space-3;
}

.scans__run-filter-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: $space-3;
}

.scans__run-filter-field {
    display: flex;
    flex-direction: column;
    gap: $space-1;
    min-width: 180px;

    label {
        font-size: $font-size-sm;
    }

    &--action {
        min-width: 0;
    }
}

.scans__run-date {
    width: 100%;
}

.scans__failure-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: $space-2;
    margin-top: $space-3;
    font-size: $font-size-sm;
}
</style>
