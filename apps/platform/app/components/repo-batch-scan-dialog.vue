<script setup lang="ts">
/**
 * 批量扫描弹窗（自 repos.vue 拆出：页面行数治理 max-lines 800）。
 *
 * 纯展示组件：提交与状态（`useRepoBatchScan`）由页面持有，这里只渲染
 * 已选仓库清单 + 模式 / 严重级别选择，并把提交与关闭事件上抛。
 */
import { Play } from '@lucide/vue'
import type { RepoView } from '~/types/platform'

defineProps<{
    visible: boolean
    /** 已选仓库（页面 `selectedRows`） */
    repos: RepoView[]
    submitting: boolean
    error: string
    mode: string
    severity: string
    modeOptions: { label: string, value: string }[]
    severityOptions: { label: string, value: string }[]
}>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    'update:mode': [value: string]
    'update:severity': [value: string]
    submit: []
}>()

const { t } = useI18n()

const repoDisplay = (repo: RepoView) => `${repo.owner}/${repo.name}`

/** caomei Select 载荷窄化（筛选项恒为字符串） */
const asOptionValue = (value: string | number | null | undefined) => String(value ?? '')
</script>

<template>
    <CaomeiDialog
        :open="visible"
        :title="t('repos.batchHeader', {count: repos.length})"
        modal
        :style="{width: '480px'}"
        @update:open="emit('update:visible', $event)"
    >
        <div class="batch-form">
            <CaomeiMessage
                v-if="error"
                tone="danger"
                :closable="false"
            >
                {{ error }}
            </CaomeiMessage>
            <div class="batch-form__repos">
                <span
                    v-for="repo in repos"
                    :key="repo.id"
                    class="batch-form__repo"
                >
                    {{ repoDisplay(repo) }}
                </span>
            </div>
            <div class="batch-form__row">
                <div class="batch-form__field">
                    <label for="batchMode">{{ t('repos.batchMode') }}</label>
                    <CaomeiSelect
                        id="batchMode"
                        :model-value="mode"
                        :options="modeOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="emit('update:mode', asOptionValue($event))"
                    />
                </div>
                <div class="batch-form__field">
                    <label for="batchSeverity">{{ t('repos.batchSeverity') }}</label>
                    <CaomeiSelect
                        id="batchSeverity"
                        :model-value="severity"
                        :options="severityOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="emit('update:severity', asOptionValue($event))"
                    />
                </div>
            </div>
            <div class="batch-form__actions">
                <CaomeiButton
                    variant="ghost"
                    tone="neutral"
                    @click="emit('update:visible', false)"
                >
                    {{ t('common.actions.cancel') }}
                </CaomeiButton>
                <CaomeiButton
                    :loading="submitting"
                    @click="emit('submit')"
                >
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
.batch-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__repos {
        display: flex;
        flex-wrap: wrap;
        gap: $space-1;
        max-height: 120px;
        overflow-y: auto;
    }

    &__repo {
        font-size: $font-size-sm;
        background-color: rgba($color-primary, 0.08);
        border-radius: $radius-sm;
        padding: $space-1 $space-2;
    }

    &__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: $space-3;
    }

    &__field {
        @include field-stack;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}
</style>
