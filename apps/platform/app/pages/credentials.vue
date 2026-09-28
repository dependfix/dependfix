<script setup lang="ts">
// 凭据管理：创建/编辑/删除（token 加密存储于服务端，永不回传明文）
import { Check, CircleCheck, CircleX, Pencil, Plus, Trash, Upload } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
import type { CredentialView } from '~/types/platform'
import { computePemFingerprint, validateGithubAppId, validatePemSize, type PemParseResult } from '~/utils/pem'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

// GitHub App 路径：PEM 文件上传 input
const pemFileInputRef = ref<HTMLInputElement | null>(null)

const triggerPemFileUpload = () => {
    pemFileInputRef.value?.click()
}

interface CredentialForm {
    name: string
    type: 'classic-pat' | 'fine-grained-pat' | 'github-app'
    /** PAT 路径：明文 token（仅创建时提交） */
    token: string
    /** GitHub App 路径：明文 PEM 私钥（仅创建时提交） */
    privateKey: string
    appId: string
    installationId: string
    botLogin: string
    note: string
}

const loading = ref(true)
const saving = ref(false)
const credentials = ref<CredentialView[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const error = ref('')
const success = ref('')

const emptyForm = (): CredentialForm => ({
    name: '',
    type: 'fine-grained-pat',
    token: '',
    privateKey: '',
    appId: '',
    installationId: '',
    botLogin: '',
    note: '',
})

const form = ref<CredentialForm>(emptyForm())

// PEM 解析结果（仅 GitHub App 路径相关）
const pemParseResult = ref<PemParseResult | null>(null)

const fetchData = async () => {
    loading.value = true
    error.value = ''
    try {
        const res = await $fetch('/api/credentials')
        credentials.value = res as CredentialView[]
    } catch (e: any) {
        error.value = t('credentials.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        loading.value = false
    }
}

onMounted(fetchData)

const typeLabel = (type: string) => ({
    'classic-pat': t('credentials.typeClassicPat'),
    'fine-grained-pat': t('credentials.typeFineGrainedPat'),
    'github-app': t('credentials.typeGithubApp'),
})[type] ?? type

const openCreate = () => {
    editingId.value = null
    form.value = emptyForm()
    pemParseResult.value = null
    dialogVisible.value = true
}

const openEdit = (credential: CredentialView) => {
    editingId.value = credential.id
    form.value = {
        name: credential.name,
        type: credential.type,
        token: '',
        privateKey: '',
        appId: credential.appId ?? '',
        installationId: credential.installationId ?? '',
        botLogin: credential.botLogin ?? '',
        note: credential.note ?? '',
    }
    pemParseResult.value = null
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
    editingId.value = null
    pemParseResult.value = null
}

/**
  * GitHub App 路径：监听 PEM 输入变化 → 实时解析 + 指纹校验
  */
const handlePemInput = () => {
    if (form.value.type !== 'github-app' || !form.value.privateKey) {
        pemParseResult.value = null
        return
    }
    pemParseResult.value = computePemFingerprint(form.value.privateKey)
}

/**
 * GitHub App 路径：监听 .pem 文件上传
 */
const handlePemFileUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    try {
        form.value.privateKey = await file.text()
        handlePemInput()
    } catch (e) {
        pemParseResult.value = {
            valid: false,
            error: `文件读取失败：${e instanceof Error ? e.message : String(e)}`,
        }
        form.value.privateKey = ''
    }
}
/**
  * GitHub App 路径：App ID / Installation ID 实时校验
  */
const validateAppIdField = computed(() => {
    if (form.value.type !== 'github-app' || !form.value.appId) return null
    return validateGithubAppId(form.value.appId, 'App ID')
})

const validateInstallationIdField = computed(() => {
    if (form.value.type !== 'github-app' || !form.value.installationId) return null
    return validateGithubAppId(form.value.installationId, 'Installation ID')
})

const submit = async () => {
    saving.value = true
    error.value = ''
    try {
        // discriminated union payload by type
        let payload: Record<string, unknown>
        if (form.value.type === 'github-app') {
            payload = {
                name: form.value.name,
                type: form.value.type,
                appId: form.value.appId,
                installationId: form.value.installationId,
                encryptedPrivateKey: form.value.privateKey,
                ...(form.value.botLogin ? { botLogin: form.value.botLogin } : {}),
                note: form.value.note.trim() || null,
            }
        } else {
            payload = {
                name: form.value.name,
                type: form.value.type,
                note: form.value.note.trim() || null,
                // 编辑时 token 为空 = 不修改
                ...(form.value.token ? { token: form.value.token } : {}),
            }
        }

        if (editingId.value) {
            await $fetch(`/api/credentials/${editingId.value}`, {
                method: 'PUT',
                body: payload,
            })
            success.value = t('credentials.success.updated')
        } else {
            await $fetch('/api/credentials', {
                method: 'POST',
                body: payload,
            })
            success.value = t('credentials.success.added')
        }
        dialogVisible.value = false
        await fetchData()
    } catch (e: any) {
        error.value = t('credentials.errors.saveFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
}

const remove = async (credential: CredentialView) => {
    error.value = ''
    try {
        await $fetch(`/api/credentials/${credential.id}`, { method: 'DELETE' })
        success.value = t('credentials.success.deleted')
        await fetchData()
    } catch (e: any) {
        error.value = t('credentials.errors.deleteFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    }
}

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代 PrimeVue 的 `<Column>`）。
 * `key` 即排序字段（原 `field`），非排序列（token / actions）取语义唯一 key。
 */
const columns = computed<DataTableColumn<CredentialView>[]>(() => [
    { key: 'name', header: t('credentials.colName'), sortable: true },
    { key: 'type', header: t('credentials.colType'), sortable: true },
    { key: 'token', header: t('credentials.colToken') },
    { key: 'createdAt', header: t('credentials.colCreatedAt'), sortable: true },
    { key: 'actions', header: t('credentials.colActions'), width: '160px' },
])

const toastMessage = computed(() => success.value)
watch(toastMessage, (v) => {
    if (v) {
        setTimeout(() => {
            success.value = ''
        }, 3000)
    }
})
</script>

<template>
    <div class="credentials">
        <div class="credentials__header">
            <div>
                <h2>{{ t('credentials.title') }}</h2>
                <p class="text-muted">
                    {{ t('credentials.subtitle') }}
                </p>
            </div>
            <CaomeiButton @click="openCreate">
                <template #icon>
                    <CaomeiIcon :icon="Plus" />
                </template>
                {{ t('credentials.add') }}
            </CaomeiButton>
        </div>

        <CaomeiMessage
            v-if="error"
            tone="danger"
            :closable="false"
        >
            {{ error }}
        </CaomeiMessage>
        <CaomeiMessage
            v-if="success"
            tone="success"
            :closable="false"
        >
            {{ success }}
        </CaomeiMessage>

        <CaomeiCard v-if="!loading">
            <CaomeiDataTable
                :data="credentials"
                :columns="columns"
                row-key="id"
                striped
                :empty-text="t('credentials.empty')"
            >
                <template #cell-type="{row}">
                    <CaomeiTag>{{ typeLabel(row.type) }}</CaomeiTag>
                </template>
                <template #cell-token="{row}">
                    <CaomeiTag
                        v-if="row.hasToken"
                        tone="success"
                    >
                        {{ t('credentials.tokenConfigured') }}
                    </CaomeiTag>
                    <CaomeiTag
                        v-else
                        tone="warning"
                    >
                        {{ t('credentials.tokenNotConfigured') }}
                    </CaomeiTag>
                </template>
                <template #cell-createdAt="{row}">
                    {{ d(new Date(row.createdAt), 'long') }}
                </template>
                <template #cell-actions="{row}">
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :label="t('repos.actionEdit')"
                        @click="openEdit(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Pencil" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        tone="danger"
                        :label="t('repos.actionDelete')"
                        @click="remove(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Trash" />
                        </template>
                    </CaomeiButton>
                </template>
            </CaomeiDataTable>
        </CaomeiCard>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <CaomeiDialog
            v-model:open="dialogVisible"
            :title="editingId ? t('credentials.dialogEditTitle') : t('credentials.dialogAddTitle')"
            modal
            :style="{width: '480px'}"
        >
            <form class="credential-form" @submit.prevent="submit">
                <div class="credential-form__field">
                    <label for="name">{{ t('credentials.fieldName') }}</label>
                    <CaomeiInput
                        id="name"
                        v-model="form.name"
                        :placeholder="t('credentials.fieldNamePlaceholder')"
                        required
                    />
                </div>
                <div class="credential-form__field">
                    <label for="type">{{ t('credentials.fieldType') }}</label>
                    <CaomeiSelect
                        id="type"
                        v-model="form.type"
                        :options="[
                            {label: t('credentials.typeClassicPat'), value: 'classic-pat'},
                            {label: t('credentials.typeFineGrainedPat'), value: 'fine-grained-pat'},
                            {label: t('credentials.typeGithubApp'), value: 'github-app'}
                        ]"
                        option-label="label"
                        option-value="value"
                    />
                </div>
                <div class="credential-form__field">
                    <label for="token">{{ editingId ? t('credentials.fieldTokenEdit') : t('credentials.fieldTokenNew') }}</label>
                    <!-- Token / 私钥类字段：强度指示无意义，不开启 feedback（库默认关闭） -->
                    <CaomeiPassword
                        id="token"
                        v-model="form.token"
                        :placeholder="editingId ? t('credentials.fieldTokenPlaceholderEdit') : t('credentials.fieldTokenPlaceholderNew')"
                        :required="!editingId"
                    />
                    <small class="text-muted">
                        {{ t('credentials.howToGet') }}
                        <a
                            href="https://docs.github.com/zh/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {{ t('credentials.githubDocs') }}
                        </a>
                    </small>
                </div>

                <!-- GitHub App 路径专属字段 -->
                <template v-if="form.type === 'github-app'">
                    <div class="credential-form__field">
                        <label for="appId">{{ t('credentials.fieldAppId') }}</label>
                        <CaomeiInput
                            id="appId"
                            v-model="form.appId"
                            :placeholder="t('credentials.fieldAppIdPlaceholder')"
                            required
                        />
                        <small v-if="validateAppIdField && !validateAppIdField.valid" class="text-error">
                            {{ validateAppIdField.error }}
                        </small>
                    </div>
                    <div class="credential-form__field">
                        <label for="installationId">{{ t('credentials.fieldInstallationId') }}</label>
                        <CaomeiInput
                            id="installationId"
                            v-model="form.installationId"
                            :placeholder="t('credentials.fieldInstallationIdPlaceholder')"
                            required
                        />
                        <small v-if="validateInstallationIdField && !validateInstallationIdField.valid" class="text-error">
                            {{ validateInstallationIdField.error }}
                        </small>
                    </div>
                    <div class="credential-form__field">
                        <label for="privateKey">
                            {{ editingId ? t('credentials.fieldPrivateKeyEdit') : t('credentials.fieldPrivateKey') }}
                        </label>
                        <!-- 用 `@update:model-value` 而非 `@input`：caomei Input/Textarea 的 v-model 由
                             `vModelDynamic` / `vModelText` 指令在 created 阶段注册监听，晚于透传的
                             `onInput`，故 `@input` 会先于 v-model 写回触发、读到上一帧的值 -->
                        <CaomeiTextarea
                            id="privateKey"
                            v-model="form.privateKey"
                            :rows="6"
                            :placeholder="t('credentials.fieldPrivateKeyPlaceholder')"
                            :required="!editingId"
                            @update:model-value="handlePemInput"
                        />
                        <div class="credential-form__pem-actions">
                            <input
                                ref="pemFileInputRef"
                                type="file"
                                accept=".pem"
                                style="display: none"
                                @change="handlePemFileUpload"
                            >
                            <CaomeiButton
                                type="button"
                                size="sm"
                                tone="neutral"
                                @click="triggerPemFileUpload"
                            >
                                <template #icon>
                                    <CaomeiIcon :icon="Upload" />
                                </template>
                                {{ t('credentials.pemUpload') }}
                            </CaomeiButton>
                            <span v-if="pemParseResult?.valid" class="text-success">
                                <CaomeiIcon :icon="CircleCheck" /> {{ t('credentials.pemValid') }}
                                <small v-if="pemParseResult.keyType" class="text-muted">
                                    ({{ pemParseResult.keyType }})
                                </small>
                            </span>
                            <span v-else-if="pemParseResult && !pemParseResult.valid" class="text-error">
                                <CaomeiIcon :icon="CircleX" /> {{ t('credentials.pemInvalid') }}: {{ pemParseResult.error }}
                            </span>
                        </div>
                        <small v-if="pemParseResult?.valid" class="text-muted">
                            {{ t('credentials.pemFingerprintHint', {pem: '<pem>'}) }}
                        </small>
                    </div>
                    <div class="credential-form__field">
                        <label for="botLogin">{{ t('credentials.fieldBotLogin') }}</label>
                        <CaomeiInput
                            id="botLogin"
                            v-model="form.botLogin"
                            :placeholder="t('credentials.fieldBotLoginPlaceholder')"
                        />
                    </div>
                    <small class="text-muted">
                        {{ t('credentials.githubAppDocs') }}
                        <a
                            href="https://docs.github.com/apps/creating-github-apps"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {{ t('credentials.githubDocs') }}
                        </a>
                    </small>
                </template>

                <div class="credential-form__field">
                    <label for="note">{{ t('repos.fieldNote') }}</label>
                    <CaomeiTextarea
                        id="note"
                        v-model="form.note"
                        :rows="2"
                    />
                </div>

                <div class="credential-form__actions">
                    <CaomeiButton
                        variant="ghost"
                        tone="neutral"
                        @click="closeDialog"
                    >
                        {{ t('common.actions.cancel') }}
                    </CaomeiButton>
                    <CaomeiButton
                        type="submit"
                        :loading="saving"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="Check" />
                        </template>
                        {{ t('common.actions.save') }}
                    </CaomeiButton>
                </div>
            </form>
        </CaomeiDialog>
    </div>
</template>

<style lang="scss" scoped>
.credentials {
    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }
}

.credential-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__field {
        display: flex;
        flex-direction: column;
        gap: $space-1;
    }

    &__field label {
        font-size: $font-size-sm;
        font-weight: 500;
    }

    &__pem-actions {
        display: flex;
        align-items: center;
        gap: $space-3;
        margin-top: $space-1;
    }

    &__pem-upload {
        cursor: pointer;
    }

    &__pem-fingerprint {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        margin-top: $space-1;
        padding: $space-2;
        background: var(--caomei-color-bg-elevated);
        border-radius: $radius-sm;

        code {
            font-family: monospace;
            font-size: $font-size-sm;
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
