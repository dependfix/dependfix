<script setup lang="ts">
// 凭据管理：创建/编辑/删除（token 加密存储于服务端，永不回传明文）
import type { CredentialView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()

interface CredentialForm {
    name: string
    type: 'classic-pat' | 'fine-grained-pat' | 'github-app'
    token: string
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
    note: '',
})

const form = ref<CredentialForm>(emptyForm())

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
    dialogVisible.value = true
}

const openEdit = (credential: CredentialView) => {
    editingId.value = credential.id
    form.value = {
        name: credential.name,
        type: credential.type,
        token: '',
        note: credential.note ?? '',
    }
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
    editingId.value = null
}

const submit = async () => {
    saving.value = true
    error.value = ''
    try {
        const payload = {
            name: form.value.name,
            type: form.value.type,
            note: form.value.note.trim() || null,
            // 编辑时 token 为空 = 不修改
            ...(form.value.token ? { token: form.value.token } : {}),
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

    &__actions {
        display: flex;
        justify-content: flex-end;
        gap: $space-2;
        margin-top: $space-2;
    }
}
</style>
