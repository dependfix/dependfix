<script setup lang="ts">
// 用户管理（admin only）：列表/搜索、启用/禁用、角色分配
import type { Role, UserView } from '~/types/platform'

definePageMeta({
    middleware: 'auth',
    roles: ['admin'],
})

const ROLES: { label: string, value: Role }[] = [
    { label: 'Admin', value: 'admin' },
    { label: 'Org Admin', value: 'org_admin' },
    { label: 'Viewer', value: 'viewer' },
]

const loading = ref(true)
const saving = ref(false)
const users = ref<UserView[]>([])
const total = ref(0)
const searchValue = ref('')
const error = ref('')
const success = ref('')

const fetchUsers = async () => {
    loading.value = true
    error.value = ''
    try {
        const res = await $fetch<{ users: UserView[], total: number }>('/api/users', {
            query: searchValue.value.trim() ? { searchValue: searchValue.value.trim() } : {},
        })
        users.value = res.users
        total.value = res.total
    } catch (e: any) {
        error.value = `加载失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        loading.value = false
    }
}

onMounted(fetchUsers)

let searchTimer: ReturnType<typeof setTimeout> | null = null
const onSearch = () => {
    if (searchTimer) {
        clearTimeout(searchTimer)
    }
    searchTimer = setTimeout(fetchUsers, 300)
}

const setRole = async (user: UserView, role: Role) => {
    saving.value = true
    error.value = ''
    try {
        await $fetch(`/api/users/${user.id}`, {
            method: 'PATCH',
            body: { role },
        })
        user.role = role
        success.value = `已更新 ${user.email} 的角色`
    } catch (e: any) {
        // 失败时从服务端刷新列表（v-model 已先写入新值，本地回滚不可靠），恢复真实状态
        const message = `角色更新失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
        await fetchUsers()
        // fetchUsers 会清空 error，刷新完成后重新赋值保证用户可见
        error.value = message
    } finally {
        saving.value = false
    }
}

const toggleBanned = async (user: UserView) => {
    saving.value = true
    error.value = ''
    try {
        await $fetch(`/api/users/${user.id}`, {
            method: 'PATCH',
            body: { banned: !user.banned },
        })
        user.banned = !user.banned
        success.value = user.banned ? `已禁用 ${user.email}` : `已启用 ${user.email}`
    } catch (e: any) {
        error.value = `状态更新失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        saving.value = false
    }
}

const remove = async (user: UserView) => {
    if (!confirm(`确认删除用户 ${user.email}？该操作不可撤销（会级联删除其会话与账号关联）。`)) {
        return
    }
    saving.value = true
    error.value = ''
    try {
        await $fetch(`/api/users/${user.id}`, { method: 'DELETE' })
        users.value = users.value.filter((u) => u.id !== user.id)
        success.value = `已删除 ${user.email}`
    } catch (e: any) {
        error.value = `删除失败：${e?.data?.message ?? e?.message ?? '未知错误'}`
    } finally {
        saving.value = false
    }
}

const roleLabel = (role: Role | null) => ROLES.find((r) => r.value === role)?.label ?? '未知'
const roleSeverity = (role: Role | null) => {
    if (role === 'admin') {
        return 'danger'
    }
    if (role === 'org_admin') {
        return 'warning'
    }
    return 'secondary'
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
    <div class="users">
        <div class="users__header">
            <div>
                <h2>用户管理</h2>
                <p class="text-muted">
                    管理平台用户、角色与访问状态（共 {{ total }} 人）
                </p>
            </div>
            <InputText
                v-model="searchValue"
                placeholder="搜索邮箱 / 姓名"
                class="users__search"
                :disabled="loading"
                @input="onSearch"
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
                    :value="users"
                    striped-rows
                    size="small"
                    :empty-message="'暂无用户'"
                >
                    <Column field="email" header="邮箱" />
                    <Column header="姓名">
                        <template #body="{data}">
                            {{ data.name || '—' }}
                        </template>
                    </Column>
                    <Column header="角色">
                        <template #body="{data}">
                            <Tag :value="roleLabel(data.role)" :severity="roleSeverity(data.role)" />
                        </template>
                    </Column>
                    <Column header="状态">
                        <template #body="{data}">
                            <Tag
                                :value="data.banned ? '已禁用' : '正常'"
                                :severity="data.banned ? 'danger' : 'success'"
                            />
                        </template>
                    </Column>
                    <Column header="邮箱验证">
                        <template #body="{data}">
                            <Tag
                                :value="data.emailVerified ? '已验证' : '未验证'"
                                :severity="data.emailVerified ? 'success' : 'secondary'"
                            />
                        </template>
                    </Column>
                    <Column header="操作" :style="{width: '300px'}">
                        <template #body="{data}">
                            <Select
                                v-model="data.role"
                                :options="ROLES"
                                option-label="label"
                                option-value="value"
                                size="small"
                                :disabled="saving"
                                aria-label="分配角色"
                                @change="setRole(data, data.role)"
                            />
                            <Button
                                :icon="data.banned ? 'pi pi-check-circle' : 'pi pi-ban'"
                                text
                                rounded
                                size="small"
                                :severity="data.banned ? 'success' : 'danger'"
                                :disabled="saving"
                                :aria-label="data.banned ? '启用' : '禁用'"
                                :title="data.banned ? '启用' : '禁用'"
                                @click="toggleBanned(data)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                :disabled="saving"
                                aria-label="删除"
                                title="删除"
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
    </div>
</template>

<style lang="scss" scoped>
.users {
    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-4;
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }

    &__search {
        max-width: 260px;
    }
}
</style>
