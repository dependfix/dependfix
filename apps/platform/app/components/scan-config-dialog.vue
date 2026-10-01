<script setup lang="ts">
// 单仓库扫描配置弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800）。
// 补全 mode/severity 选择入口，让单仓库触发扫描时支持 12 种 mode×severity 组合。
// 与批量扫描 Dialog 共享 modeOptions / severityOptions 数据源（父组件传入）。
// AI override 折叠面板（设计见 [platform-ai-integration.md §7.3](../design/governance/platform-ai-integration.md)）
// —— Organization 未配 Key 时整段禁用 + 警告 Message，避免用户误启用 AI 研判跑不出来。
import type { RepoView } from '~/types/platform'
import { Play } from '@lucide/vue'

interface ScanModeOption {
    label: string
    value: string
}

type AiTrigger = 'failure' | 'major' | 'both'

const props = defineProps<{
    visible: boolean
    repo: RepoView | null
    mode: string
    severity: string
    modeOptions: ScanModeOption[]
    severityOptions: ScanModeOption[]
    /** AI override 启用状态（runtime override 仓库默认） */
    aiEnabled: boolean
    /** AI override trigger 范围（runtime override 仓库默认） */
    aiTrigger: AiTrigger
    /** Organization 是否已配置 AI Key（false 时 AI override 禁用） */
    hasOrgAiKey: boolean
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    'update:mode': [value: string]
    'update:severity': [value: string]
    'update:ai-enabled': [value: boolean]
    'update:ai-trigger': [value: AiTrigger]
    submit: []
}>()

const { t } = useI18n()

const repoDisplay = (repo: RepoView) => `${repo.owner}/${repo.name}`

const onClose = () => {
    emit('update:visible', false)
}

/** caomei Select 的 `update:modelValue` 载荷为 OptionValue | null | undefined，非字符串载荷直接忽略 */
const onModeChange = (value: string | number | null | undefined) => {
    if (typeof value === 'string') {
        emit('update:mode', value)
    }
}

const onSeverityChange = (value: string | number | null | undefined) => {
    if (typeof value === 'string') {
        emit('update:severity', value)
    }
}

const onAiTriggerChange = (value: string | number | null | undefined) => {
    if (value === 'failure' || value === 'major' || value === 'both') {
        emit('update:ai-trigger', value)
    }
}

const aiTriggerOptions = computed(() => [
    { label: t('ai.triggerOptions.failure'), value: 'failure' as const },
    { label: t('ai.triggerOptions.major'), value: 'major' as const },
    { label: t('ai.triggerOptions.both'), value: 'both' as const },
])
</script>

<template>
    <CaomeiDialog
        :open="props.visible"
        :title="repo ? t('repos.scanConfigHeader', {owner: repo.owner, name: repo.name}) : t('repos.scanConfigHeaderEmpty')"
        modal
        :style="{width: '480px'}"
        @update:open="(v: boolean) => emit('update:visible', v)"
    >
        <div class="scan-config-form">
            <div v-if="repo" class="scan-config-form__repo">
                {{ t('repos.scanConfigTarget') }}: <strong>{{ repoDisplay(repo) }}</strong>
            </div>
            <div class="scan-config-form__row">
                <div class="scan-config-form__field">
                    <label for="scanConfigMode">{{ t('repos.batchMode') }}</label>
                    <CaomeiSelect
                        id="scanConfigMode"
                        :model-value="props.mode"
                        :options="modeOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="onModeChange"
                    />
                </div>
                <div class="scan-config-form__field">
                    <label for="scanConfigSeverity">{{ t('repos.batchSeverity') }}</label>
                    <CaomeiSelect
                        id="scanConfigSeverity"
                        :model-value="props.severity"
                        :options="severityOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="onSeverityChange"
                    />
                </div>
            </div>
            <div class="scan-config-form__ai">
                <CaomeiMessage
                    v-if="!props.hasOrgAiKey"
                    tone="warning"
                    :closable="false"
                >
                    {{ t('ai.scanOverrideDisabledHint') }}
                </CaomeiMessage>
                <div class="scan-config-form__row">
                    <div class="scan-config-form__field">
                        <label for="scanConfigAiEnabled">{{ t('ai.scanOverrideEnabledLabel') }}</label>
                        <CaomeiSwitch
                            id="scanConfigAiEnabled"
                            :model-value="props.aiEnabled"
                            :disabled="!props.hasOrgAiKey"
                            @update:model-value="(v: boolean) => emit('update:ai-enabled', v)"
                        />
                        <small class="text-muted">{{ t('ai.scanOverrideEnabledHint') }}</small>
                    </div>
                    <div class="scan-config-form__field">
                        <label for="scanConfigAiTrigger">{{ t('ai.scanOverrideSection') }}</label>
                        <CaomeiSelect
                            id="scanConfigAiTrigger"
                            :model-value="props.aiTrigger"
                            :options="aiTriggerOptions"
                            option-label="label"
                            option-value="value"
                            :disabled="!props.aiEnabled || !props.hasOrgAiKey"
                            @update:model-value="onAiTriggerChange"
                        />
                    </div>
                </div>
            </div>
            <div class="scan-config-form__actions">
                <CaomeiButton
                    variant="ghost"
                    tone="neutral"
                    @click="onClose"
                >
                    {{ t('common.actions.cancel') }}
                </CaomeiButton>
                <CaomeiButton @click="emit('submit')">
                    <template #icon>
                        <CaomeiIcon :icon="Play" />
                    </template>
                    {{ t('repos.batchStart') }}
                </CaomeiButton>
            </div>
        </div>
    </CaomeiDialog>
</template>

<style lang="scss" scoped>
.scan-config-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__repo {
        font-size: $font-size-sm;
        color: $color-text-muted;
        padding: $space-1 $space-2;
        background-color: rgba($color-primary, 0.08);
        border-radius: $radius-sm;
    }

    &__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-3;
    }

    &__ai {
        display: flex;
        flex-direction: column;
        gap: $space-3;
        padding: $space-3;
        border: 1px solid var(--caomei-color-border);
        border-radius: $radius-sm;
    }

    &__field {
        @include field-stack;
    }

    &__field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}
</style>
