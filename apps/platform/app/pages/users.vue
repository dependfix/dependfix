<script setup lang="ts">
// 用户管理（admin only）：列表/搜索、启用/禁用、角色分配
// 全部走 better-auth admin 插件原生端点（/api/auth/admin/*，经 authClient.admin.* 封装）
import type { Role, UserView } from '~/types/platform'
import { authClient } from '~/utils/auth-client'
import { updateRoleRank, withRoleRank } from '~/utils/sort-helpers'
import { isSelfTarget } from '~/utils/user-protection'

definePageMeta({
    middleware: 'auth',
    roles: ['admin'],
})

const { t } = useI18n()
const { session } = useSession()

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
        const { data, error: listError } = await authClient.admin.listUsers({
            query: searchValue.value.trim() ? { searchValue: searchValue.value.trim() } : {},
        })
        if (listError) {
            error.value = t('users.errors.loadFailed', { message: listError.message ?? t('common.errors.unknown') })
            return
        }
        users.value = withRoleRank((data?.users ?? []).map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name ?? null,
            image: u.image ?? null,
            role: (u.role ?? null) as Role | null,
            banned: u.banned ?? false,
            banReason: u.banReason ?? null,
            emailVerified: u.emailVerified,
            createdAt: typeof u.createdAt === 'string' ? u.createdAt : u.createdAt.toISOString(),
            updatedAt: typeof u.updatedAt === 'string' ? u.updatedAt : u.updatedAt.toISOString(),
        })))
        total.value = data?.total ?? users.value.length
    } catch (e: any) {
        error.value = t('users.errors.loadFailed', { message: e?.message ?? t('common.errors.unknown') })
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
    // 禁止 admin 对自己修改角色（防止自我降级锁死唯一管理员；见 todo.md §C65-A1）。
    // isSelfTarget null-safe 兜底由 auth middleware 保证 session 就绪。
    if (isSelfTarget(user.id, session.value?.user?.id)) {
        // Select v-model 已先写入新值，刷新列表恢复真实状态后再提示
        await fetchUsers()
        error.value = t('users.errors.cannotSelfModify')
        return
    }
    saving.value = true
    error.value = ''
    try {
        // 客户端类型面仅推断默认角色（admin/user）；服务端 roles 配置三角色并校验，
        // 此处显式窄化到客户端可接受类型，运行时角色值由服务端 setRole 校验兜底
        const { error: roleError } = await authClient.admin.setRole({
            userId: user.id,
            role: role as 'user' | 'admin',
        })
        if (roleError) {
            // Select v-model 已先写入新值，失败时先刷新列表恢复真实状态，
            // 再赋值错误消息（fetchUsers 开头会清空 error，须在刷新后设置）
            await fetchUsers()
            error.value = t('users.errors.roleUpdateFailed', { message: roleError.message ?? t('common.errors.unknown') })
            return
        }
        // RG-B07 修复：setRole 成功后同步派生 _roleRank（保证 DataTable sortable 业务语义一致）
        updateRoleRank(user, role)
        success.value = t('users.success.roleUpdated', { email: user.email })
    } catch (e: any) {
        await fetchUsers()
        error.value = t('users.errors.roleUpdateFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
}

const toggleBanned = async (user: UserView) => {
    saving.value = true
    error.value = ''
    try {
        if (user.banned) {
            const { error: unbanError } = await authClient.admin.unbanUser({
                userId: user.id,
            })
            if (unbanError) {
                error.value = t('users.errors.enableFailed', { message: unbanError.message ?? t('common.errors.unknown') })
                return
            }
            user.banned = false
            success.value = t('users.success.enabled', { email: user.email })
        } else {
            const { error: banError } = await authClient.admin.banUser({
                userId: user.id,
            })
            if (banError) {
                error.value = t('users.errors.disableFailed', { message: banError.message ?? t('common.errors.unknown') })
                return
            }
            user.banned = true
            success.value = t('users.success.disabled', { email: user.email })
        }
    } catch (e: any) {
        error.value = t('users.errors.statusUpdateFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
}

const remove = async (user: UserView) => {
    if (!confirm(t('users.confirm.deleteUser', { email: user.email }))) {
        return
    }
    saving.value = true
    error.value = ''
    try {
        const { error: removeError } = await authClient.admin.removeUser({
            userId: user.id,
        })
        if (removeError) {
            error.value = t('users.errors.deleteFailed', { message: removeError.message ?? t('common.errors.unknown') })
            return
        }
        users.value = users.value.filter((u) => u.id !== user.id)
        success.value = t('users.success.deleted', { email: user.email })
    } catch (e: any) {
        error.value = t('users.errors.deleteFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        saving.value = false
    }
}

const roleLabel = (role: Role | null) => ROLES.find((r) => r.value === role)?.label ?? t('users.unknownRole')
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
                <h2>{{ t('users.title') }}</h2>
                <p class="text-muted">
                    {{ t('users.subtitle', {total}) }}
                </p>
            </div>
            <InputText
                v-model="searchValue"
                :placeholder="t('users.searchPlaceholder')"
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
                    removable-sort
                    :empty-message="t('users.empty')"
                >
                    <Column
                        field="email"
                        :header="t('users.email')"
                        sortable
                    />
                    <Column
                        field="name"
                        :header="t('users.name')"
                        sortable
                    >
                        <template #body="{data}">
                            {{ data.name || '—' }}
                        </template>
                    </Column>
                    <Column
                        field="_roleRank"
                        :header="t('users.role')"
                        sortable
                        :default-sort-order="-1"
                    >
                        <template #body="{data}">
                            <Tag :value="roleLabel(data.role)" :severity="roleSeverity(data.role)" />
                        </template>
                    </Column>
                    <Column :header="t('users.status')">
                        <template #body="{data}">
                            <Tag
                                :value="data.banned ? t('common.status.banned') : t('common.status.active')"
                                :severity="data.banned ? 'danger' : 'success'"
                            />
                        </template>
                    </Column>
                    <Column :header="t('users.emailVerified')">
                        <template #body="{data}">
                            <Tag
                                :value="data.emailVerified ? t('common.status.verified') : t('common.status.unverified')"
                                :severity="data.emailVerified ? 'success' : 'secondary'"
                            />
                        </template>
                    </Column>
                    <Column :header="t('users.actions')" :style="{width: '300px'}">
                        <template #body="{data}">
                            <Select
                                v-model="data.role"
                                :options="ROLES"
                                option-label="label"
                                option-value="value"
                                size="small"
                                :disabled="saving || isSelfTarget(data.id, session?.user?.id)"
                                :aria-label="t('users.assignRole')"
                                @change="setRole(data, data.role)"
                            />
                            <Button
                                :icon="data.banned ? 'pi pi-check-circle' : 'pi pi-ban'"
                                text
                                rounded
                                size="small"
                                :severity="data.banned ? 'success' : 'danger'"
                                :disabled="saving"
                                :aria-label="data.banned ? t('users.enable') : t('users.disable')"
                                :title="data.banned ? t('users.enable') : t('users.disable')"
                                @click="toggleBanned(data)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                :disabled="saving"
                                :aria-label="t('users.delete')"
                                :title="t('users.delete')"
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
