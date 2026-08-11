<script setup lang="ts">
// 个人设置：资料（姓名/头像）、修改密码、修改邮箱、绑定账号状态、语言偏好
// 全部操作走 better-auth 原生端点（/api/auth/*，经 authClient 封装），不自建代理 API
import { authClient } from '~/utils/auth-client'

definePageMeta({
    middleware: 'auth',
})

// 语言偏好：选择即 setLocale 写 i18n_locale cookie，与导航栏切换器联动
const { locale, setLocale, locales, t } = useI18n()
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
    github: 'GitHub',
    google: 'Google',
    oidc: 'OIDC SSO',
}
const providerLabel = (providerId: string) => {
    if (providerId === 'credential') {
        return t('settings.credentialProvider')
    }
    return PROFILE_LABELS[providerId] ?? providerId
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
            error.value = t('settings.errors.loadFailed', { message: accountError.message ?? t('common.errors.unknown') })
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
        error.value = t('settings.errors.loadFailed', { message: e?.message ?? t('common.errors.unknown') })
    }
}

onMounted(async () => {
    loading.value = true
    nameForm.value = session.value?.user?.name ?? ''
    emailForm.value = session.value?.user?.email ?? ''
    await fetchAccounts()
    loading.value = false
})

const saveName = async () => {
    const trimmedName = nameForm.value.trim()
    // better-auth updateUser 的 name 仅接受 string（不支持 null 清空语义），
    // 空值视为未修改并提示，避免"保存成功但值未变"误导
    if (!trimmedName) {
        error.value = t('settings.errors.nameRequired')
        return
    }
    nameSaving.value = true
    error.value = ''
    try {
        const { error: updateError } = await authClient.updateUser({
            name: trimmedName,
        })
        if (updateError) {
            error.value = t('settings.errors.saveFailed', { message: updateError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.profileUpdated')
        await refreshNuxtData()
    } catch (e: any) {
        error.value = t('settings.errors.saveFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        nameSaving.value = false
    }
}

const changePassword = async () => {
    error.value = ''
    if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
        error.value = t('settings.errors.passwordMismatch')
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
            error.value = t('settings.errors.changeFailed', { message: changeError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.passwordChanged')
        passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    } catch (e: any) {
        error.value = t('settings.errors.changeFailed', { message: e?.message ?? t('common.errors.unknown') })
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
            error.value = t('settings.errors.changeFailed', { message: changeError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.emailChanged')
        await refreshNuxtData()
    } catch (e: any) {
        error.value = t('settings.errors.changeFailed', { message: e?.message ?? t('common.errors.unknown') })
    } finally {
        emailSaving.value = false
    }
}

const unlink = async (account: BoundAccount) => {
    if (!confirm(t('settings.confirm.unlinkAccount', { provider: providerLabel(account.providerId) }))) {
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
            error.value = t('settings.errors.unlinkFailed', { message: unlinkError.message ?? t('common.errors.unknown') })
            return
        }
        success.value = t('settings.success.unlinked', { provider: providerLabel(account.providerId) })
        await fetchAccounts()
    } catch (e: any) {
        error.value = t('settings.errors.unlinkFailed', { message: e?.message ?? t('common.errors.unknown') })
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
                <h2>{{ t('settings.title') }}</h2>
                <p class="text-muted">
                    {{ t('settings.subtitle') }}
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
                    {{ t('settings.profileCard') }}
                </template>
                <template #content>
                    <form class="settings-form" @submit.prevent="saveName">
                        <div class="settings-form__field">
                            <label for="name">{{ t('settings.displayName') }}</label>
                            <InputText
                                id="name"
                                v-model="nameForm"
                                :placeholder="t('settings.displayNamePlaceholder')"
                                fluid
                                required
                            />
                        </div>
                        <div class="settings-form__field">
                            <label>{{ t('settings.emailLabel') }}</label>
                            <div class="text-muted">
                                {{ session?.user?.email }}
                            </div>
                            <small class="text-muted">{{ t('settings.emailHint') }}</small>
                        </div>
                        <div class="settings-form__field">
                            <label>{{ t('settings.roleLabel') }}</label>
                            <Tag :value="session?.user?.role ?? 'viewer'" severity="secondary" />
                        </div>
                        <Button
                            type="submit"
                            :label="t('settings.saveProfile')"
                            icon="pi pi-check"
                            :loading="nameSaving"
                        />
                    </form>
                </template>
            </Card>

            <Card>
                <template #title>
                    {{ t('settings.passwordCard') }}
                </template>
                <template #content>
                    <form class="settings-form" @submit.prevent="changePassword">
                        <div class="settings-form__field">
                            <label for="currentPassword">{{ t('settings.currentPassword') }}</label>
                            <Password
                                id="currentPassword"
                                v-model="passwordForm.currentPassword"
                                :feedback="false"
                                toggle-mask
                                :placeholder="t('settings.currentPasswordPlaceholder')"
                                fluid
                                required
                            />
                        </div>
                        <div class="settings-form__field">
                            <label for="newPassword">{{ t('settings.newPassword') }}</label>
                            <Password
                                id="newPassword"
                                v-model="passwordForm.newPassword"
                                :feedback="false"
                                toggle-mask
                                :placeholder="t('settings.newPasswordPlaceholder')"
                                fluid
                                required
                            />
                        </div>
                        <div class="settings-form__field">
                            <label for="confirmPassword">{{ t('settings.confirmNewPassword') }}</label>
                            <Password
                                id="confirmPassword"
                                v-model="passwordForm.confirmPassword"
                                :feedback="false"
                                toggle-mask
                                :placeholder="t('settings.confirmNewPasswordPlaceholder')"
                                fluid
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            :label="t('settings.changePassword')"
                            icon="pi pi-lock"
                            :loading="passwordSaving"
                        />
                        <small class="text-muted">{{ t('settings.passwordChangedHint') }}</small>
                    </form>
                </template>
            </Card>

            <Card>
                <template #title>
                    {{ t('settings.emailCard') }}
                </template>
                <template #content>
                    <form class="settings-form" @submit.prevent="changeEmail">
                        <div class="settings-form__field">
                            <label for="newEmail">{{ t('settings.newEmail') }}</label>
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
                            :label="t('settings.changeEmail')"
                            icon="pi pi-envelope"
                            :loading="emailSaving"
                        />
                        <small class="text-muted">{{ t('settings.emailChangedHint') }}</small>
                    </form>
                </template>
            </Card>

            <Card>
                <template #title>
                    {{ t('settings.accountsCard') }}
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
                                :aria-label="t('settings.unlink')"
                                :title="t('settings.unlink')"
                                @click="unlink(account)"
                            />
                        </div>
                    </div>
                    <p v-else class="text-muted">
                        {{ t('settings.noAccounts') }}
                    </p>
                    <small class="text-muted">{{ t('settings.accountsHint') }}</small>
                </template>
            </Card>

            <Card>
                <template #title>
                    {{ t('settings.languageCard') }}
                </template>
                <template #content>
                    <div class="settings-form__field">
                        <label for="language">{{ t('settings.languageLabel') }}</label>
                        <Select
                            id="language"
                            :model-value="locale"
                            :options="locales"
                            option-label="name"
                            option-value="code"
                            fluid
                            @update:model-value="switchLocale"
                        />
                        <small class="text-muted">{{ t('settings.languageHint') }}</small>
                    </div>
                </template>
            </Card>
        </div>
        <p v-else class="text-muted">
            {{ t('common.empty.loading') }}
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
