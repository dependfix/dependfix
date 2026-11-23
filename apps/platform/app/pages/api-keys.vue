<script setup lang="ts">
// API 密钥管理：列表 / 创建（一次性明文）/ 吊销；仅 admin / org_admin（服务端 403 为准）
import { Copy, Plus, Trash } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
import type { ApiKeyView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
})

const { t, d } = useI18n()
const { session } = useSession()
const confirm = useConfirm()

const canManage = computed(() => {
    const role = session.value?.user?.role
    return role === 'admin' || role === 'org_admin'
})

const loading = ref(true)
const creating = ref(false)
const keys = ref<ApiKeyView[]>([])
const error = ref('')
const success = ref('')

const createOpen = ref(false)
const name = ref('')
const createdKey = ref<string | null>(null)
const secretOpen = computed({
    get: () => createdKey.value !== null,
    set: (value: boolean) => {
        if (!value) {
            createdKey.value = null
        }
    },
})
const copied = ref(false)

const fetchData = async () => {
    loading.value = true
    error.value = ''
    try {
        const res = await $fetch<{ items: ApiKeyView[] }>('/api/v1/keys')
        keys.value = res.items
    } catch (e: any) {
        if (e?.statusCode === 403 || e?.response?.status === 403) {
            error.value = t('apiKeys.errors.forbidden')
        } else {
            error.value = t('apiKeys.errors.loadFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
        }
    } finally {
        loading.value = false
    }
}

onMounted(fetchData)

const columns = computed<DataTableColumn<ApiKeyView>[]>(() => [
    { key: 'name', header: t('apiKeys.colName'), sortable: true },
    { key: 'prefix', header: t('apiKeys.colPrefix') },
    { key: 'createdAt', header: t('apiKeys.colCreatedAt'), sortable: true },
    { key: 'expiresAt', header: t('apiKeys.colExpiresAt') },
    { key: 'lastRequest', header: t('apiKeys.colLastRequest') },
    { key: 'actions', header: t('apiKeys.colActions'), width: '120px' },
])

const openCreate = () => {
    name.value = ''
    error.value = ''
    createOpen.value = true
}

const submit = async () => {
    if (!name.value.trim() || creating.value) {
        return
    }
    creating.value = true
    error.value = ''
    try {
        const res = await $fetch<{ key: string }>('/api/v1/keys', {
            method: 'POST',
            body: { name: name.value.trim() },
        })
        createdKey.value = res.key
        createOpen.value = false
        success.value = t('apiKeys.success.created')
        await fetchData()
    } catch (e: any) {
        error.value = t('apiKeys.errors.createFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    } finally {
        creating.value = false
    }
}

const revoke = async (key: ApiKeyView) => {
    if (!await confirm.open({
        title: t('apiKeys.revokeConfirm', { name: key.name || key.start || key.id }),
        tone: 'danger',
    })) {
        return
    }
    error.value = ''
    try {
        await $fetch(`/api/v1/keys/${key.id}`, { method: 'DELETE' })
        success.value = t('apiKeys.success.revoked')
        await fetchData()
    } catch (e: any) {
        error.value = t('apiKeys.errors.revokeFailed', { message: e?.data?.message ?? e?.message ?? t('common.errors.unknown') })
    }
}

const copyKey = async () => {
    if (!createdKey.value) {
        return
    }
    try {
        await navigator.clipboard.writeText(createdKey.value)
        copied.value = true
        setTimeout(() => {
            copied.value = false
        }, 2000)
    } catch {
        error.value = t('apiKeys.errors.copyFailed')
    }
}

const toastMessage = computed(() => success.value)
watch(toastMessage, (value) => {
    if (value) {
        setTimeout(() => {
            success.value = ''
        }, 3000)
    }
})
</script>

<template>
    <div class="api-keys">
        <div class="api-keys__header">
            <div>
                <h2>{{ t('apiKeys.title') }}</h2>
                <p class="text-muted">
                    {{ t('apiKeys.subtitle') }}
                </p>
            </div>
            <CaomeiButton v-if="canManage" @click="openCreate">
                <template #icon>
                    <CaomeiIcon :icon="Plus" />
                </template>
                {{ t('apiKeys.add') }}
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
                :data="keys"
                :columns="columns"
                row-key="id"
                striped
                :empty-text="t('apiKeys.empty')"
            >
                <template #cell-name="{row}">
                    {{ row.name || '—' }}
                </template>
                <template #cell-prefix="{row}">
                    <code>{{ row.start || row.prefix }}</code>
                </template>
                <template #cell-createdAt="{row}">
                    {{ d(new Date(row.createdAt), 'long') }}
                </template>
                <template #cell-expiresAt="{row}">
                    {{ row.expiresAt ? d(new Date(row.expiresAt), 'long') : '—' }}
                </template>
                <template #cell-lastRequest="{row}">
                    {{ row.lastRequest ? d(new Date(row.lastRequest), 'long') : t('apiKeys.neverUsed') }}
                </template>
                <template #cell-actions="{row}">
                    <CaomeiButton
                        v-if="canManage"
                        variant="ghost"
                        rounded
                        size="sm"
                        tone="danger"
                        :label="t('apiKeys.revoke')"
                        @click="revoke(row)"
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
            v-model:open="createOpen"
            :title="t('apiKeys.createTitle')"
            modal
            :style="{width: '440px'}"
        >
            <form class="api-keys__form" @submit.prevent="submit">
                <div class="api-keys__field">
                    <label for="api-key-name">{{ t('apiKeys.nameLabel') }}</label>
                    <CaomeiInput
                        id="api-key-name"
                        v-model="name"
                        :placeholder="t('apiKeys.namePlaceholder')"
                        required
                    />
                </div>
                <small class="text-muted">{{ t('apiKeys.createHint') }}</small>
                <div class="api-keys__actions">
                    <CaomeiButton
                        variant="ghost"
                        type="button"
                        @click="createOpen = false"
                    >
                        {{ t('common.actions.cancel') }}
                    </CaomeiButton>
                    <CaomeiButton type="submit" :disabled="creating">
                        {{ creating ? t('common.empty.loading') : t('common.actions.create') }}
                    </CaomeiButton>
                </div>
            </form>
        </CaomeiDialog>

        <CaomeiDialog
            v-model:open="secretOpen"
            :title="t('apiKeys.createdTitle')"
            modal
            :style="{width: '520px'}"
        >
            <p>{{ t('apiKeys.createdHint') }}</p>
            <div class="api-keys__secret">
                <code class="api-keys__secret-value">{{ createdKey }}</code>
                <CaomeiButton
                    variant="secondary"
                    size="sm"
                    @click="copyKey"
                >
                    <template #icon>
                        <CaomeiIcon :icon="Copy" />
                    </template>
                    {{ copied ? t('apiKeys.copied') : t('apiKeys.copy') }}
                </CaomeiButton>
            </div>
        </CaomeiDialog>
    </div>
</template>

<style scoped>
.api-keys__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $space-4;
    margin-bottom: $space-4;
}

.api-keys__form,
.api-keys__field {
    display: flex;
    flex-direction: column;
    gap: $space-2;
}

.api-keys__form {
    gap: $space-4;
}

.api-keys__actions {
    display: flex;
    justify-content: flex-end;
    gap: $space-2;
}

.api-keys__secret {
    display: flex;
    align-items: center;
    gap: $space-2;
    margin-top: $space-3;
}

.api-keys__secret-value {
    flex: 1;
    overflow-x: auto;
    padding: $space-2;
    border: 1px solid var(--caomei-color-border);
    border-radius: $radius-sm;
    white-space: nowrap;
    user-select: all;
}
</style>
