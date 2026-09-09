<script setup lang="ts">
// 单仓库扫描配置弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800）。
// PR2 见 docs/plan/todo.md §PR2 C52：补全 mode/severity 选择入口，让单仓库 pi-play 触发扫描时支持 12 种 mode×severity 组合。
// 与批量扫描 Dialog 共享 modeOptions / severityOptions 数据源（父组件传入）。
// M26.1 commit：新增 AI override 折叠面板（todo.md §M26.1 + [platform-ai-integration.md §7.3](../design/governance/platform-ai-integration.md)）
// —— Organization 未配 Key 时整段禁用 + 警告 Message，避免用户误启用 AI 研判跑不出来。
import type { RepoView } from '~/types/platform'

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

const aiTriggerOptions = computed(() => [
    { label: t('ai.triggerOptions.failure'), value: 'failure' as const },
    { label: t('ai.triggerOptions.major'), value: 'major' as const },
    { label: t('ai.triggerOptions.both'), value: 'both' as const },
])
</script>

<template>
    <Dialog
        :visible="props.visible"
        :header="repo ? t('repos.scanConfigHeader', {owner: repo.owner, name: repo.name}) : t('repos.scanConfigHeaderEmpty')"
        modal
        :draggable="false"
        :style="{width: '480px'}"
        @update:visible="(v: boolean) => emit('update:visible', v)"
    >
        <div class="scan-config-form">
            <div v-if="repo" class="scan-config-form__repo">
                {{ t('repos.scanConfigTarget') }}: <strong>{{ repoDisplay(repo) }}</strong>
            </div>
            <div class="scan-config-form__row">
                <div class="scan-config-form__field">
                    <label for="scanConfigMode">{{ t('repos.batchMode') }}</label>
                    <Select
                        id="scanConfigMode"
                        :model-value="props.mode"
                        :options="modeOptions"
                        option-label="label"
                        option-value="value"
                        fluid
                        @update:model-value="(v: string) => emit('update:mode', v)"
                    />
                </div>
                <div class="scan-config-form__field">
                    <label for="scanConfigSeverity">{{ t('repos.batchSeverity') }}</label>
                    <Select
                        id="scanConfigSeverity"
                        :model-value="props.severity"
                        :options="severityOptions"
                        option-label="label"
                        option-value="value"
                        fluid
                        @update:model-value="(v: string) => emit('update:severity', v)"
                    />
                </div>
            </div>
            <div class="scan-config-form__ai">
                <Message
                    v-if="!props.hasOrgAiKey"
                    severity="warn"
                    :closable="false"
                >
                    {{ t('ai.scanOverrideDisabledHint') }}
                </Message>
                <div class="scan-config-form__row">
                    <div class="scan-config-form__field">
                        <label for="scanConfigAiEnabled">{{ t('ai.scanOverrideEnabledLabel') }}</label>
                        <ToggleSwitch
                            id="scanConfigAiEnabled"
                            :model-value="props.aiEnabled"
                            :disabled="!props.hasOrgAiKey"
                            @update:model-value="(v: boolean) => emit('update:ai-enabled', v)"
                        />
                        <small class="text-muted">{{ t('ai.scanOverrideEnabledHint') }}</small>
                    </div>
                    <div class="scan-config-form__field">
                        <label for="scanConfigAiTrigger">{{ t('ai.scanOverrideSection') }}</label>
                        <Select
                            id="scanConfigAiTrigger"
                            :model-value="props.aiTrigger"
                            :options="aiTriggerOptions"
                            option-label="label"
                            option-value="value"
                            :disabled="!props.aiEnabled || !props.hasOrgAiKey"
                            fluid
                            @update:model-value="(v: AiTrigger) => emit('update:ai-trigger', v)"
                        />
                    </div>
                </div>
            </div>
            <div class="scan-config-form__actions">
                <Button
                    :label="t('common.actions.cancel')"
                    severity="secondary"
                    text
                    @click="onClose"
                />
                <Button
                    :label="t('repos.batchStart')"
                    icon="pi pi-play"
                    @click="emit('submit')"
                />
            </div>
        </div>
    </Dialog>
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
        border: 1px solid var(--p-content-border-color);
        border-radius: $radius-sm;
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
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
