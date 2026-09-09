<script setup lang="ts">
/**
 * 仓库 AI 研判开关（todo.md §M26.1 + platform-ai-integration.md §7.2）。
 *
 * 自 runs.vue 拆出（页面行数治理 max-lines 800）。
 * 用法：在 runs.vue 顶部插入 <repo-ai-toggle :repository-id="..." />；组件独立管理
 * Repository.aiEnabled + aiTrigger 字段；提交走 POST /api/repos/[id]/ai-config。
 */
const props = defineProps<{
    repositoryId: string
}>()

const { t } = useI18n()

interface RepoAiConfig {
    repository: { aiEnabled: boolean, aiTrigger: 'failure' | 'major' | 'both' }
    organization: {
        hasAiApiKey: boolean
        aiProvider: 'openai-compatible' | 'anthropic'
        aiModel: string
        aiBaseUrl: string | null
        aiApiUrl: string | null
    }
    effective: {
        aiEnabled: boolean
        aiTrigger: 'failure' | 'major' | 'both'
        aiProvider: 'openai-compatible' | 'anthropic'
        hasApiKey: boolean
    }
}

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const config = ref<RepoAiConfig | null>(null)

const aiEnabled = ref(false)
const aiTrigger = ref<'failure' | 'major' | 'both'>('both')

const triggerOptions = computed(() => [
    { label: t('ai.triggerOptions.failure'), value: 'failure' as const },
    { label: t('ai.triggerOptions.major'), value: 'major' as const },
    { label: t('ai.triggerOptions.both'), value: 'both' as const },
])

const fetchConfig = async () => {
    loading.value = true
    error.value = ''
    try {
        const data = await $fetch<RepoAiConfig>(`/api/repos/${props.repositoryId}/ai-config`)
        config.value = data
        aiEnabled.value = data.repository.aiEnabled
        aiTrigger.value = data.repository.aiTrigger
    } catch (e: any) {
        error.value = t('ai.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

const saveConfig = async () => {
    saving.value = true
    error.value = ''
    try {
        const result = await $fetch<{ repository: { aiEnabled: boolean, aiTrigger: 'failure' | 'major' | 'both' } }>(
            `/api/repos/${props.repositoryId}/ai-config`,
            { method: 'POST', body: { aiEnabled: aiEnabled.value, aiTrigger: aiTrigger.value } },
        )
        if (config.value) {
            config.value = { ...config.value, repository: result.repository }
        }
    } catch (e: any) {
        error.value = t('ai.saveFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
}

const orgMissingKey = computed(() => config.value !== null && !config.value.organization.hasAiApiKey)

onMounted(fetchConfig)
</script>

<template>
    <Card>
        <template #title>
            {{ t('ai.repoSection') }}
        </template>
        <template #content>
            <div v-if="loading" class="text-muted">
                {{ t('common.empty.loading') }}
            </div>
            <Message
                v-else-if="error"
                severity="error"
                :closable="false"
            >
                {{ error }}
            </Message>
            <div v-else class="repo-ai-toggle">
                <Message
                    v-if="orgMissingKey"
                    severity="warn"
                    :closable="false"
                >
                    {{ t('ai.apiKeyRequiredWarning') }}
                </Message>
                <div class="repo-ai-toggle__row">
                    <label for="repoAiEnabled">{{ t('ai.repoEnabledLabel') }}</label>
                    <ToggleSwitch
                        id="repoAiEnabled"
                        v-model="aiEnabled"
                        :disabled="orgMissingKey || saving"
                        @update:model-value="saveConfig"
                    />
                </div>
                <div class="repo-ai-toggle__row">
                    <label for="repoAiTrigger">{{ t('ai.triggerLabel') }}</label>
                    <Select
                        id="repoAiTrigger"
                        v-model="aiTrigger"
                        :options="triggerOptions"
                        option-label="label"
                        option-value="value"
                        :disabled="!aiEnabled || saving"
                        fluid
                        @update:model-value="saveConfig"
                    />
                </div>
            </div>
        </template>
    </Card>
</template>

<style lang="scss" scoped>
.repo-ai-toggle {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-3;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }
}
</style>
