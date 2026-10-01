<script setup lang="ts">
/**
 * Organization AI 研判配置表单（设计见 platform-ai-integration.md §7.1）。
 *
 * 自 settings.vue 拆出：避免 settings.vue 突破 max-lines 800 上限。
 * 用法：在 settings.vue 顶部插入 <ai-config-form />；表单独立管理 Organization.ai* 字段；
 * 提交走 PATCH /api/organizations/[id]/ai-config；加载靠 props.organizationId。
 */
import { Save } from '@lucide/vue'

const props = defineProps<{
    organizationId: string
}>()

const { t } = useI18n()

interface AiConfig {
    hasAiApiKey: boolean
    aiProvider: 'openai-compatible' | 'anthropic'
    aiModel: string
    aiBaseUrl: string | null
    aiApiUrl: string | null
}

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

const config = ref<AiConfig | null>(null)

const form = reactive({
    aiProvider: 'openai-compatible' as 'openai-compatible' | 'anthropic',
    aiModel: 'deepseek-v4-flash',
    aiBaseUrl: '' as string,
    aiApiUrl: '' as string,
    aiApiKey: '' as string,
})

const providerOptions = computed(() => [
    { label: t('ai.providerOptions.openaiCompatible'), value: 'openai-compatible' },
    { label: t('ai.providerOptions.anthropic'), value: 'anthropic' },
])

const fetchConfig = async () => {
    loading.value = true
    error.value = ''
    try {
        const data = await $fetch<AiConfig>(`/api/organizations/${props.organizationId}/ai-config`)
        config.value = data
        form.aiProvider = data.aiProvider
        form.aiModel = data.aiModel
        form.aiBaseUrl = data.aiBaseUrl ?? ''
        form.aiApiUrl = data.aiApiUrl ?? ''
    } catch (e: any) {
        error.value = t('ai.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

const saveConfig = async () => {
    saving.value = true
    error.value = ''
    success.value = ''
    try {
        const payload: Record<string, unknown> = {
            aiProvider: form.aiProvider,
            aiModel: form.aiModel,
            aiBaseUrl: form.aiBaseUrl.trim() || null,
            aiApiUrl: form.aiApiUrl.trim() || null,
        }
        if (form.aiApiKey.trim()) {
            payload.aiApiKey = form.aiApiKey
        }
        const result = await $fetch<{ organization: AiConfig }>(
            `/api/organizations/${props.organizationId}/ai-config`,
            { method: 'PATCH', body: payload },
        )
        config.value = result.organization
        form.aiApiKey = ''
        success.value = t('ai.saveSuccess')
    } catch (e: any) {
        error.value = t('ai.saveFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
}

onMounted(fetchConfig)
</script>

<template>
    <CaomeiCard>
        <template #title>
            <span class="ai-config-form__title">
                {{ t('ai.orgSection') }}
                <CaomeiTag
                    v-if="config?.hasAiApiKey"
                    tone="success"
                    class="ai-config-form__badge"
                >
                    {{ t('ai.apiKeySetBadge') }}
                </CaomeiTag>
            </span>
        </template>
        <div v-if="loading" class="text-muted">
            {{ t('common.empty.loading') }}
        </div>
        <CaomeiMessage
            v-else-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>
        <div v-else class="ai-config-form">
            <CaomeiMessage
                v-if="success"
                tone="success"
                :closable="false"
            >
                {{ success }}
            </CaomeiMessage>
            <div class="ai-config-form__field">
                <label for="aiProvider">{{ t('ai.providerLabel') }}</label>
                <CaomeiSelect
                    id="aiProvider"
                    v-model="form.aiProvider"
                    :options="providerOptions"
                    option-label="label"
                    option-value="value"
                />
            </div>
            <div class="ai-config-form__field">
                <label for="aiModel">{{ t('ai.modelLabel') }}</label>
                <CaomeiInput
                    id="aiModel"
                    v-model="form.aiModel"
                />
            </div>
            <div class="ai-config-form__field">
                <label for="aiBaseUrl">{{ t('ai.baseUrlLabel') }}</label>
                <CaomeiInput
                    id="aiBaseUrl"
                    v-model="form.aiBaseUrl"
                    placeholder="https://api.deepseek.com"
                />
            </div>
            <div class="ai-config-form__field">
                <label for="aiApiUrl">{{ t('ai.anthropicUrlLabel') }}</label>
                <CaomeiInput
                    id="aiApiUrl"
                    v-model="form.aiApiUrl"
                    placeholder="https://api.anthropic.com"
                />
            </div>
            <div class="ai-config-form__field">
                <label for="aiApiKey">{{ t('ai.apiKeyLabel') }}</label>
                <CaomeiInput
                    id="aiApiKey"
                    v-model="form.aiApiKey"
                    type="password"
                    :placeholder="t('ai.apiKeyPlaceholder')"
                />
                <small class="text-muted">{{ t('ai.apiKeyHint') }}</small>
            </div>
            <div class="ai-config-form__actions">
                <CaomeiButton
                    :loading="saving"
                    :disabled="saving"
                    @click="saveConfig"
                >
                    <template #icon>
                        <CaomeiIcon :icon="Save" />
                    </template>
                    {{ t('ai.saveConfig') }}
                </CaomeiButton>
            </div>
        </div>
    </CaomeiCard>
</template>

<style lang="scss" scoped>
.ai-config-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__title {
        display: flex;
        align-items: center;
        gap: $space-2;
    }

    &__badge {
        font-size: $font-size-sm;
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
