<script setup lang="ts">
// 用户管理（admin only）：列表/搜索、启用/禁用、角色分配
// 全部走 better-auth admin 插件原生端点（/api/auth/admin/*，经 authClient.admin.* 封装）
import { Ban, CircleCheck, Trash } from '@lucide/vue'
import type { DataTableColumn } from 'caomei-ui'
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
const confirm = useConfirm()

const ROLES = computed<{ label: string, value: Role }[]>(() => [
    { label: t('common.role.admin'), value: 'admin' },
    { label: t('common.role.orgAdmin'), value: 'org_admin' },
    { label: t('common.role.viewer'), value: 'viewer' },
])

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
    // 禁止 admin 对自己修改角色（防止自我降级锁死唯一管理员）。
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
        // setRole 成功后同步派生 _roleRank（保证 DataTable sortable 业务语义一致）
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
    if (!await confirm.open({ title: t('users.confirm.deleteUser', { email: user.email }), tone: 'danger' })) {
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

const roleLabel = (role: Role | null) => ROLES.value.find((r) => r.value === role)?.label ?? t('users.unknownRole')
const roleTone = (role: Role | null) => {
    if (role === 'admin') {
        return 'danger'
    }
    if (role === 'org_admin') {
        return 'warning'
    }
    return 'neutral'
}

/**
 * 列定义（caomei DataTable 用 `columns` 数组 + `#cell-{key}` 插槽替代迁移前的 `<Column>`）。
 * `key` 即排序字段，故角色列用 `_roleRank`（与 sort-helpers 注入的 rank 一致）。
 */
const columns = computed<DataTableColumn<UserView>[]>(() => [
    { key: 'email', header: t('users.email'), sortable: true },
    { key: 'name', header: t('users.name'), sortable: true },
    { key: '_roleRank', header: t('users.role'), sortable: true },
    { key: 'status', header: t('users.status') },
    { key: 'emailVerified', header: t('users.emailVerified') },
    { key: 'actions', header: t('users.actions'), width: '300px' },
])

/**
 * 角色下拉变更 → 提交（Select 的 v-model 已写入 row.role；这里做非空窄化后调用 setRole）。
 * 迁移到 caomei 后插槽行对象为强类型 `UserView`（迁移前的 `data` 为 any），
 * `role` 可空故不再内联直接传参。
 */
const onRoleChange = (user: UserView) => {
    if (user.role) {
        void setRole(user, user.role)
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
    <div class="users">
        <div class="users__header">
            <div>
                <h2>{{ t('users.title') }}</h2>
                <p class="text-muted">
                    {{ t('users.subtitle', {total}) }}
                </p>
            </div>
            <CaomeiInput
                v-model="searchValue"
                :placeholder="t('users.searchPlaceholder')"
                class="users__search"
                :disabled="loading"
                @update:model-value="onSearch"
            />
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
                :data="users"
                :columns="columns"
                row-key="id"
                striped
                :empty-text="t('users.empty')"
            >
                <template #cell-name="{row}">
                    {{ row.name || '—' }}
                </template>
                <template #cell-_roleRank="{row}">
                    <CaomeiTag :tone="roleTone(row.role)">
                        {{ roleLabel(row.role) }}
                    </CaomeiTag>
                </template>
                <template #cell-status="{row}">
                    <CaomeiTag :tone="row.banned ? 'danger' : 'success'">
                        {{ row.banned ? t('common.status.banned') : t('common.status.active') }}
                    </CaomeiTag>
                </template>
                <template #cell-emailVerified="{row}">
                    <CaomeiTag :tone="row.emailVerified ? 'success' : 'neutral'">
                        {{ row.emailVerified ? t('common.status.verified') : t('common.status.unverified') }}
                    </CaomeiTag>
                </template>
                <template #cell-actions="{row}">
                    <!-- 操作列宽 300px：选择器家族的字段外层是 `inline-flex; width: 100%`（占满整行会
                         把同行图标按钮挤到下一行），故套一层限定宽度的 inline-block 容器让三者同行 -->
                    <div class="users__role-select">
                        <CaomeiSelect
                            v-model="row.role"
                            :options="ROLES"
                            option-label="label"
                            option-value="value"
                            size="sm"
                            :disabled="saving || isSelfTarget(row.id, session?.user?.id)"
                            :label="t('users.assignRole')"
                            @update:model-value="onRoleChange(row)"
                        />
                    </div>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        :tone="row.banned ? 'success' : 'danger'"
                        :disabled="saving"
                        :label="row.banned ? t('users.enable') : t('users.disable')"
                        :title="row.banned ? t('users.enable') : t('users.disable')"
                        @click="toggleBanned(row)"
                    >
                        <template #icon>
                            <CaomeiIcon :icon="row.banned ? CircleCheck : Ban" />
                        </template>
                    </CaomeiButton>
                    <CaomeiButton
                        variant="ghost"
                        rounded
                        size="sm"
                        tone="danger"
                        :disabled="saving"
                        :label="t('users.delete')"
                        :title="t('users.delete')"
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

    // 操作列内的角色选择器：inline-block 容器限宽，与同行两个图标按钮保持单行（见模板注释）
    &__role-select {
        display: inline-block;
        width: 9rem;
        vertical-align: middle;
    }
}
</style>
