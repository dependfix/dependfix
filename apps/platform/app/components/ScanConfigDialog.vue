<script setup lang="ts">
// 单仓库扫描配置弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800）。
// PR2 见 docs/plan/todo.md §PR2 C52：补全 mode/severity 选择入口，让单仓库 pi-play 触发扫描时支持 12 种 mode×severity 组合。
// 与批量扫描 Dialog 共享 modeOptions / severityOptions 数据源（父组件传入）。
import type { RepoView } from '~/types/platform'

interface ScanModeOption {
    label: string
    value: string
}

const props = defineProps<{
    visible: boolean
    repo: RepoView | null
    mode: string
    severity: string
    modeOptions: ScanModeOption[]
    severityOptions: ScanModeOption[]
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    'update:mode': [value: string]
    'update:severity': [value: string]
    submit: []
}>()

const { t } = useI18n()

const repoDisplay = (repo: RepoView) => `${repo.owner}/${repo.name}`

const onClose = () => {
    emit('update:visible', false)
}
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
