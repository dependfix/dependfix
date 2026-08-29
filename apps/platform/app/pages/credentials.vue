<script setup lang="ts">
// 凭据管理：创建/编辑/删除（token 加密存储于服务端，永不回传明文）
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
            <Button
                icon="pi pi-plus"
                :label="t('credentials.add')"
                @click="openCreate"
            />
        </div>

        <Message
            v-if="error"
            severity="error"
            :closable="false"
        >
            {{ error }}
        </Message>
        <Message
            v-if="success"
            severity="success"
            :closable="false"
        >
            {{ success }}
        </Message>

        <Card v-if="!loading">
            <template #content>
                <DataTable
                    :value="credentials"
                    striped-rows
                    size="small"
                    removable-sort
                    :empty-message="t('credentials.empty')"
                >
                    <Column
                        field="name"
                        :header="t('credentials.colName')"
                        sortable
                    />
                    <Column
                        field="type"
                        :header="t('credentials.colType')"
                        sortable
                    >
                        <template #body="{data}">
                            <Tag :value="typeLabel(data.type)" />
                        </template>
                    </Column>
                    <Column :header="t('credentials.colToken')">
                        <template #body="{data}">
                            <Tag
                                v-if="data.hasToken"
                                :value="t('credentials.tokenConfigured')"
                                severity="success"
                            />
                            <Tag
                                v-else
                                :value="t('credentials.tokenNotConfigured')"
                                severity="warn"
                            />
                        </template>
                    </Column>
                    <Column
                        field="createdAt"
                        :header="t('credentials.colCreatedAt')"
                        sortable
                    >
                        <template #body="{data}">
                            {{ d(new Date(data.createdAt), 'long') }}
                        </template>
                    </Column>
                    <Column :header="t('credentials.colActions')" :style="{width: '160px'}">
                        <template #body="{data}">
                            <Button
                                icon="pi pi-pencil"
                                text
                                rounded
                                size="small"
                                :aria-label="t('repos.actionEdit')"
                                @click="openEdit(data)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                :aria-label="t('repos.actionDelete')"
                                @click="remove(data)"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
        </p>

        <Dialog
            v-model:visible="dialogVisible"
            :header="editingId ? t('credentials.dialogEditTitle') : t('credentials.dialogAddTitle')"
            modal
            :draggable="false"
            :style="{width: '480px'}"
        >
            <form class="credential-form" @submit.prevent="submit">
                <div class="credential-form__field">
                    <label for="name">{{ t('credentials.fieldName') }}</label>
                    <InputText
                        id="name"
                        v-model="form.name"
                        :placeholder="t('credentials.fieldNamePlaceholder')"
                        fluid
                        required
                    />
                </div>
                <div class="credential-form__field">
                    <label for="type">{{ t('credentials.fieldType') }}</label>
                    <Select
                        id="type"
                        v-model="form.type"
                        :options="[
                            {label: t('credentials.typeClassicPat'), value: 'classic-pat'},
                            {label: t('credentials.typeFineGrainedPat'), value: 'fine-grained-pat'},
                            {label: t('credentials.typeGithubApp'), value: 'github-app'}
                        ]"
                        option-label="label"
                        option-value="value"
                        fluid
                    />
                </div>
                <div class="credential-form__field">
                    <label for="token">{{ editingId ? t('credentials.fieldTokenEdit') : t('credentials.fieldTokenNew') }}</label>
                    <Password
                        id="token"
                        v-model="form.token"
                        :feedback="false"
                        toggle-mask
                        :placeholder="editingId ? t('credentials.fieldTokenPlaceholderEdit') : t('credentials.fieldTokenPlaceholderNew')"
                        fluid
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

                <!-- GitHub App 路径专属字段（M18.3 接入） -->
                <template v-if="form.type === 'github-app'">
                    <div class="credential-form__field">
                        <label for="appId">{{ t('credentials.fieldAppId') }}</label>
                        <InputText
                            id="appId"
                            v-model="form.appId"
                            :placeholder="t('credentials.fieldAppIdPlaceholder')"
                            fluid
                            required
                        />
                        <small v-if="validateAppIdField && !validateAppIdField.valid" class="text-error">
                            {{ validateAppIdField.error }}
                        </small>
                    </div>
                    <div class="credential-form__field">
                        <label for="installationId">{{ t('credentials.fieldInstallationId') }}</label>
                        <InputText
                            id="installationId"
                            v-model="form.installationId"
                            :placeholder="t('credentials.fieldInstallationIdPlaceholder')"
                            fluid
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
                        <Textarea
                            id="privateKey"
                            v-model="form.privateKey"
                            rows="6"
                            :placeholder="t('credentials.fieldPrivateKeyPlaceholder')"
                            fluid
                            :required="!editingId"
                            @input="handlePemInput"
                        />
                        <div class="credential-form__pem-actions">
                            <input
                                ref="pemFileInputRef"
                                type="file"
                                accept=".pem"
                                style="display: none"
                                @change="handlePemFileUpload"
                            >
                            <Button
                                type="button"
                                :label="t('credentials.pemUpload')"
                                icon="pi pi-upload"
                                size="small"
                                severity="secondary"
                                @click="triggerPemFileUpload"
                            />
                            <span v-if="pemParseResult?.valid" class="text-success">
                                <i class="pi pi-check-circle" /> {{ t('credentials.pemValid') }}
                                <small v-if="pemParseResult.keyType" class="text-muted">
                                    ({{ pemParseResult.keyType }})
                                </small>
                            </span>
                            <span v-else-if="pemParseResult && !pemParseResult.valid" class="text-error">
                                <i class="pi pi-times-circle" /> {{ t('credentials.pemInvalid') }}: {{ pemParseResult.error }}
                            </span>
                        </div>
                        <small v-if="pemParseResult?.valid" class="text-muted">
                            {{ t('credentials.pemFingerprintHint') }}
                        </small>
                    </div>
                    <div class="credential-form__field">
                        <label for="botLogin">{{ t('credentials.fieldBotLogin') }}</label>
                        <InputText
                            id="botLogin"
                            v-model="form.botLogin"
                            :placeholder="t('credentials.fieldBotLoginPlaceholder')"
                            fluid
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
                    <Textarea
                        id="note"
                        v-model="form.note"
                        rows="2"
                        fluid
                    />
                </div>

                <div class="credential-form__actions">
                    <Button
                        :label="t('common.actions.cancel')"
                        severity="secondary"
                        text
                        @click="closeDialog"
                    />
                    <Button
                        type="submit"
                        :label="t('common.actions.save')"
                        icon="pi pi-check"
                        :loading="saving"
                    />
                </div>
            </form>
        </Dialog>
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
        background: var(--p-surface-50);
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
