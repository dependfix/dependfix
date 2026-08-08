<script setup lang="ts">
// 凭据管理：创建/编辑/删除（token 加密存储于服务端，永不回传明文）
import type { CredentialView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

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
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        loading.value = false
    }
}

onMounted(fetchData)

const typeLabel = (type: string) => {
    switch (type) {
        case 'classic-pat':
            return '经典 PAT'
        case 'fine-grained-pat':
            return '细粒度 PAT'
        case 'github-app':
            return 'GitHub App'
        default:
            return type
    }
}

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
            success.value = '凭据已更新'
        } else {
            await $fetch('/api/credentials', {
                method: 'POST',
                body: payload,
            })
            success.value = '凭据已添加'
        }
        dialogVisible.value = false
        await fetchData()
    } catch (e: any) {
        error.value = `保存失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        saving.value = false
    }
}

const remove = async (credential: CredentialView) => {
    error.value = ''
    try {
        await $fetch(`/api/credentials/${credential.id}`, { method: 'DELETE' })
        success.value = '凭据已删除'
        await fetchData()
    } catch (e: any) {
        error.value = `删除失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
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
                <h2>凭据管理</h2>
                <p class="text-muted">
                    GitHub Token 加密存储（AES-256-GCM），仅执行时解密
                </p>
            </div>
            <Button
                icon="pi pi-plus"
                label="添加凭据"
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
                    :empty-message="'暂无凭据，点击右上角添加'"
                >
                    <Column field="name" header="名称" />
                    <Column header="类型">
                        <template #body="{ data }">
                            <Tag :value="typeLabel(data.type)" />
                        </template>
                    </Column>
                    <Column header="Token">
                        <template #body="{ data }">
                            <Tag
                                v-if="data.hasToken"
                                value="已配置"
                                severity="success"
                            />
                            <Tag
                                v-else
                                value="未配置"
                                severity="warn"
                            />
                        </template>
                    </Column>
                    <Column header="创建时间">
                        <template #body="{ data }">
                            {{ new Date(data.createdAt).toLocaleString() }}
                        </template>
                    </Column>
                    <Column header="操作" :style="{ width: '160px' }">
                        <template #body="{ data }">
                            <Button
                                icon="pi pi-pencil"
                                text
                                rounded
                                size="small"
                                aria-label="编辑"
                                @click="openEdit(data)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                aria-label="删除"
                                @click="remove(data)"
                            />
                        </template>
                    </Column>
                </DataTable>
            </template>
        </Card>
        <p v-else class="text-muted">
            加载中…
        </p>

        <Dialog
            v-model:visible="dialogVisible"
            :header="editingId ? '编辑凭据' : '添加凭据'"
            modal
            :style="{ width: '480px' }"
        >
            <form class="credential-form" @submit.prevent="submit">
                <div class="credential-form__field">
                    <label for="name">名称 *</label>
                    <InputText
                        id="name"
                        v-model="form.name"
                        placeholder="如 dependfix-bot"
                        fluid
                        required
                    />
                </div>
                <div class="credential-form__field">
                    <label for="type">类型</label>
                    <Select
                        id="type"
                        v-model="form.type"
                        :options="[
                            { label: '经典 PAT', value: 'classic-pat' },
                            { label: '细粒度 PAT', value: 'fine-grained-pat' },
                            { label: 'GitHub App', value: 'github-app' },
                        ]"
                        option-label="label"
                        option-value="value"
                        fluid
                    />
                </div>
                <div class="credential-form__field">
                    <label for="token">Token{{ editingId ? '（留空不修改）' : ' *' }}</label>
                    <Password
                        id="token"
                        v-model="form.token"
                        :feedback="false"
                        toggle-mask
                        :placeholder="editingId ? '留空保持不变' : 'ghp_... / github_pat_...'"
                        fluid
                        :required="!editingId"
                    />
                </div>
                <div class="credential-form__field">
                    <label for="note">备注</label>
                    <Textarea
                        id="note"
                        v-model="form.note"
                        rows="2"
                        fluid
                    />
                </div>

                <div class="credential-form__actions">
                    <Button
                        label="取消"
                        severity="secondary"
                        text
                        @click="closeDialog"
                    />
                    <Button
                        type="submit"
                        label="保存"
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
