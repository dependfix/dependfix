<script setup lang="ts">
// 个人设置：资料（姓名/头像）、修改密码、修改邮箱、绑定账号状态、语言偏好
// 全部操作走 better-auth 原生端点（/api/auth/*，经 authClient 封装），不自建代理 API
import { authClient } from '~/utils/auth-client'

definePageMeta({
    middleware: 'auth',
})

// 语言偏好：选择即 setLocale 写 i18n_locale cookie，与导航栏切换器联动
const { locale, setLocale, locales } = useI18n()
const switchLocale = async (code: string) => {
    await setLocale(code as typeof locale.value)
}

interface BoundAccount {
    id: string
    providerId: string
    accountId: string
    createdAt: string
}

const PROFILE_LABELS: Record<string, string> = {
    credential: '邮箱密码',
    github: 'GitHub',
    google: 'Google',
    oidc: 'OIDC SSO',
}

const { session } = useSession()
const accounts = ref<BoundAccount[]>([])
const loading = ref(true)
const error = ref('')
const success = ref('')

const nameForm = ref('')
const nameSaving = ref(false)

const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' })
const passwordSaving = ref(false)

const emailForm = ref('')
const emailSaving = ref(false)

const unlinkSaving = ref<{ id: string } | null>(null)

const fetchAccounts = async () => {
    error.value = ''
    try {
        const { data, error: accountError } = await authClient.listAccounts()
        if (accountError) {
            error.value = `加载失败：${accountError.message ?? '未知错误'}`
            return
        }
        // 仅展示第三方绑定账号（credential = 邮箱密码，不属于"绑定账号"管理范围）
        accounts.value = (data ?? [])
            .filter((a) => a.providerId !== 'credential')
            .map((a) => ({
                id: a.id,
                providerId: a.providerId,
                accountId: a.accountId,
                createdAt: typeof a.createdAt === 'string' ? a.createdAt : a.createdAt.toISOString(),
            }))
    } catch (e: any) {
        error.value = `加载失败：${e?.message ?? '未知错误'}`
    }
}

onMounted(async () => {
    loading.value = true
    nameForm.value = session.value?.user?.name ?? ''
    emailForm.value = session.value?.user?.email ?? ''
    await fetchAccounts()
    loading.value = false
})

const providerLabel = (providerId: string) => PROFILE_LABELS[providerId] ?? providerId

const saveName = async () => {
    const trimmedName = nameForm.value.trim()
    // better-auth updateUser 的 name 仅接受 string（不支持 null 清空语义），
    // 空值视为未修改并提示，避免"保存成功但值未变"误导
    if (!trimmedName) {
        error.value = '姓名不能为空'
        return
    }
    nameSaving.value = true
    error.value = ''
    try {
        const { error: updateError } = await authClient.updateUser({
            name: trimmedName,
        })
        if (updateError) {
            error.value = `保存失败：${updateError.message ?? '未知错误'}`
            return
        }
        success.value = '个人资料已更新'
        await refreshNuxtData()
    } catch (e: any) {
        error.value = `保存失败：${e?.message ?? '未知错误'}`
    } finally {
        nameSaving.value = false
    }
}

const changePassword = async () => {
    error.value = ''
    if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
        error.value = '两次输入的新密码不一致'
        return
    }
    passwordSaving.value = true
    try {
        const { error: changeError } = await authClient.changePassword({
            currentPassword: passwordForm.value.currentPassword,
            newPassword: passwordForm.value.newPassword,
            revokeOtherSessions: true,
        })
        if (changeError) {
            error.value = `修改失败：${changeError.message ?? '未知错误'}`
            return
        }
        success.value = '密码已修改，其他设备会话已失效'
        passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    } catch (e: any) {
        error.value = `修改失败：${e?.message ?? '未知错误'}`
    } finally {
        passwordSaving.value = false
    }
}

const changeEmail = async () => {
    error.value = ''
    emailSaving.value = true
    try {
        const { error: changeError } = await authClient.changeEmail({
            newEmail: emailForm.value.trim(),
        })
        if (changeError) {
            error.value = `修改失败：${changeError.message ?? '未知错误'}`
            return
        }
        success.value = '邮箱已修改'
        await refreshNuxtData()
    } catch (e: any) {
        error.value = `修改失败：${e?.message ?? '未知错误'}`
    } finally {
        emailSaving.value = false
    }
}

const unlink = async (account: BoundAccount) => {
    if (!confirm(`确认解绑 ${providerLabel(account.providerId)} 账号？`)) {
        return
    }
    error.value = ''
    unlinkSaving.value = { id: account.id }
    try {
        const { error: unlinkError } = await authClient.unlinkAccount({
            providerId: account.providerId,
            accountId: account.accountId,
        })
        if (unlinkError) {
            error.value = `解绑失败：${unlinkError.message ?? '未知错误'}`
            return
        }
        success.value = `已解绑 ${providerLabel(account.providerId)}`
        await fetchAccounts()
    } catch (e: any) {
        error.value = `解绑失败：${e?.message ?? '未知错误'}`
    } finally {
        unlinkSaving.value = null
    }
}

const toastMessage = computed(() => success.value)
let toastTimer: ReturnType<typeof setTimeout> | null = null
watch(toastMessage, (v) => {
    if (toastTimer) {
        clearTimeout(toastTimer)
    }
    if (v) {
        toastTimer = setTimeout(() => {
            success.value = ''
        }, 3000)
    }
})
onUnmounted(() => {
    if (toastTimer) {
        clearTimeout(toastTimer)
    }
})
</script>

<template>
    <div class="settings">
        <div class="settings__header">
            <div>
                <h2>个人设置</h2>
                <p class="text-muted">
                    管理个人资料、密码、邮箱与绑定账号
                </p>
            </div>
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

        <div v-if="!loading" class="settings__grid">
            <Card>
                <template #title>
                    个人资料
                </template>
                <template #content>
                    <form class="settings-form" @submit.prevent="saveName">
                        <div class="settings-form__field">
                            <label for="name">显示名</label>
                            <InputText
                                id="name"
                                v-model="nameForm"
                                placeholder="输入显示名"
                                fluid
                                required
                            />
                        </div>
                        <div class="settings-form__field">
                            <label>邮箱</label>
                            <div class="text-muted">
                                {{ session?.user?.email }}
                            </div>
                            <small class="text-muted">邮箱修改见下方"邮箱"卡片</small>
                        </div>
                        <div class="settings-form__field">
                            <label>角色</label>
                            <Tag :value="session?.user?.role ?? 'viewer'" severity="secondary" />
                        </div>
                        <Button
                            type="submit"
                            label="保存资料"
                            icon="pi pi-check"
                            :loading="nameSaving"
                        />
                    </form>
                </template>
            </Card>

            <Card>
                <template #title>
                    修改密码
                </template>
                <template #content>
                    <form class="settings-form" @submit.prevent="changePassword">
                        <div class="settings-form__field">
                            <label for="currentPassword">当前密码</label>
                            <Password
                                id="currentPassword"
                                v-model="passwordForm.currentPassword"
                                :feedback="false"
                                toggle-mask
                                placeholder="请输入当前密码"
                                fluid
                                required
                            />
                        </div>
                        <div class="settings-form__field">
                            <label for="newPassword">新密码</label>
                            <Password
                                id="newPassword"
                                v-model="passwordForm.newPassword"
                                :feedback="false"
                                toggle-mask
                                placeholder="至少 8 位"
                                fluid
                                required
                            />
                        </div>
                        <div class="settings-form__field">
                            <label for="confirmPassword">确认新密码</label>
                            <Password
                                id="confirmPassword"
                                v-model="passwordForm.confirmPassword"
                                :feedback="false"
                                toggle-mask
                                placeholder="再次输入新密码"
                                fluid
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            label="修改密码"
                            icon="pi pi-lock"
                            :loading="passwordSaving"
                        />
                        <small class="text-muted">修改后其他设备会话将失效（需重新登录）</small>
                    </form>
                </template>
            </Card>

            <Card>
                <template #title>
                    邮箱
                </template>
                <template #content>
                    <form class="settings-form" @submit.prevent="changeEmail">
                        <div class="settings-form__field">
                            <label for="newEmail">新邮箱</label>
                            <InputText
                                id="newEmail"
                                v-model="emailForm"
                                type="email"
                                placeholder="you@example.com"
                                fluid
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            label="修改邮箱"
                            icon="pi pi-envelope"
                            :loading="emailSaving"
                        />
                        <small class="text-muted">SMTP 未配置时直接生效；已配置时需邮件确认</small>
                    </form>
                </template>
            </Card>

            <Card>
                <template #title>
                    绑定账号
                </template>
                <template #content>
                    <div v-if="accounts.length" class="settings-accounts">
                        <div
                            v-for="account in accounts"
                            :key="account.id"
                            class="settings-accounts__item"
                        >
                            <div>
                                <Tag :value="providerLabel(account.providerId)" severity="secondary" />
                                <small class="text-muted">{{ account.accountId }}</small>
                            </div>
                            <Button
                                icon="pi pi-times"
                                text
                                rounded
                                size="small"
                                severity="danger"
                                :loading="unlinkSaving?.id === account.id"
                                aria-label="解绑"
                                title="解绑"
                                @click="unlink(account)"
                            />
                        </div>
                    </div>
                    <p v-else class="text-muted">
                        暂无绑定账号
                    </p>
                    <small class="text-muted">第三方登录绑定（GitHub / Google / OIDC）随认证扩展开放</small>
                </template>
            </Card>

            <Card>
                <template #title>
                    语言偏好
                </template>
                <template #content>
                    <div class="settings-form__field">
                        <label for="language">界面语言</label>
                        <Select
                            id="language"
                            :model-value="locale"
                            :options="locales"
                            option-label="name"
                            option-value="code"
                            fluid
                            @update:model-value="switchLocale"
                        />
                        <small class="text-muted">多语言切换即写入偏好，刷新后保持</small>
                    </div>
                </template>
            </Card>
        </div>
        <p v-else class="text-muted">
            加载中…
        </p>
    </div>
</template>

<style lang="scss" scoped>
.settings {
    &__header {
        margin-bottom: $space-5;
    }

    &__header h2 {
        margin: 0 0 $space-1;
    }

    &__header p {
        margin: 0;
        font-size: $font-size-sm;
    }

    &__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: $space-4;
    }
}

.settings-form {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    &__field {
        display: flex;
        flex-direction: column;
        gap: $space-2;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }
}

.settings-accounts {
    display: flex;
    flex-direction: column;
    gap: $space-2;

    &__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-3;
        padding: $space-2 0;
        border-bottom: 1px solid var(--p-content-border-color);

        div {
            display: flex;
            align-items: center;
            gap: $space-2;
        }
    }
}
</style>
