<script setup lang="ts">
/**
 * 告警视图筛选栏（自 alerts.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 纯展示组件：筛选状态由页面持有（`filters` / `viewMode`），这里只渲染控件并回写，
 * `apply` 事件触发 `refreshAlerts`（与拆分前按钮行为一致）。
 */
import { Funnel } from '@lucide/vue'
import type { AlertsViewMode } from '~/utils/alerts-view'

defineProps<{
    viewMode: AlertsViewMode
    repositoryId: string
    severity: string
    source: string
    includeSuperseded: boolean
    viewModeOptions: { label: string, value: AlertsViewMode }[]
    repositories: { id: string, name: string }[]
    severityOptions: { label: string, value: string }[]
    sourceOptions: { label: string, value: string }[]
}>()

const emit = defineEmits<{
    'update:viewMode': [value: AlertsViewMode]
    'update:repositoryId': [value: string]
    'update:severity': [value: string]
    'update:source': [value: string]
    'update:includeSuperseded': [value: boolean]
    apply: []
}>()

const { t } = useI18n()

/** caomei Select 载荷窄化（筛选项恒为字符串） */
const asOptionValue = (value: string | number | null | undefined) => String(value ?? '')
</script>

<template>
    <CaomeiCard class="alerts__filters">
        <div class="alerts__filter-row">
            <div class="alerts__filter-field">
                <label for="view-mode">{{ t('alerts.viewMode') }}</label>
                <CaomeiSelect
                    id="view-mode"
                    :model-value="viewMode"
                    :options="viewModeOptions"
                    option-label="label"
                    option-value="value"
                    @update:model-value="emit('update:viewMode', asOptionValue($event) as AlertsViewMode)"
                />
            </div>
            <div class="alerts__filter-field">
                <label for="repo">{{ t('alerts.filterRepository') }}</label>
                <CaomeiSelect
                    id="repo"
                    :model-value="repositoryId"
                    :options="repositories"
                    option-label="name"
                    option-value="id"
                    :placeholder="t('alerts.allRepositories')"
                    @update:model-value="emit('update:repositoryId', asOptionValue($event))"
                />
            </div>
            <div class="alerts__filter-field">
                <label for="severity">{{ t('alerts.filterSeverity') }}</label>
                <CaomeiSelect
                    id="severity"
                    :model-value="severity"
                    :options="severityOptions"
                    option-label="label"
                    option-value="value"
                    @update:model-value="emit('update:severity', asOptionValue($event))"
                />
            </div>
            <div class="alerts__filter-field">
                <label for="source">{{ t('alerts.filterSource') }}</label>
                <CaomeiSelect
                    id="source"
                    :model-value="source"
                    :options="sourceOptions"
                    option-label="label"
                    option-value="value"
                    @update:model-value="emit('update:source', asOptionValue($event))"
                />
            </div>
            <div class="alerts__filter-field">
                <label for="include-superseded">{{ t('alerts.filter.includeSuperseded') }}</label>
                <div class="alerts__filter-control">
                    <CaomeiSwitch
                        id="include-superseded"
                        :model-value="includeSuperseded"
                        @update:model-value="emit('update:includeSuperseded', $event)"
                    />
                </div>
            </div>
            <div class="alerts__filter-field">
                <CaomeiButton @click="emit('apply')">
                    <template #icon>
                        <CaomeiIcon :icon="Funnel" />
                    </template>
                    {{ t('alerts.filterApply') }}
                </CaomeiButton>
            </div>
        </div>
    </CaomeiCard>
</template>

<style lang="scss" scoped>
.alerts__filters {
    margin-bottom: $space-4;
}

.alerts__filter-row {
    display: flex;
    align-items: flex-end;
    gap: $space-4;
    flex-wrap: wrap;
}

.alerts__filter-field {
    @include field-stack;

    min-width: 160px;
}

/* Switch 本体高度低于控件档高度（`--caomei-switch-height` < `--caomei-control-height-md`）：
   直接放进字段会让该字段整体变矮，在行 flex-end 对齐下其 label 被下压。控件区统一按
   控制档高度补足并垂直居中，使同排各字段的 label 与控件上下缘都对齐。 */
.alerts__filter-control {
    display: flex;
    align-items: center;
    min-height: var(--caomei-control-height-md);
}

.alerts__filter-field label {
    font-size: $font-size-sm;
    font-weight: 500;
}
</style>
