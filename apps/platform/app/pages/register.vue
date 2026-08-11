<script setup lang="ts">
import { useColorMode } from '~/composables/use-color-mode'
import { authClient } from '~/utils/auth-client'

definePageMeta({
    layout: false,
})

const { dark, toggle, initColorMode } = useColorMode()
const { t } = useI18n()

onMounted(() => {
    initColorMode()
})

const email = ref('')
const name = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

// 注册策略感知：enterprise 展示白名单域提示；REGISTRATION_DISABLED 隐藏注册入口
const publicConfig = useRuntimeConfig().public
const isEnterprise = publicConfig.authMode === 'enterprise'
// 防御运行时 NUXT_PUBLIC_ALLOWED_EMAIL_DOMAINS 覆盖：Nuxt 运行时 env 覆盖后该值可能为
// 逗号分隔字符串（destr 解析，非 build 期数组）——统一归一为数组
const rawAllowedDomains: string[] | string = publicConfig.allowedEmailDomains as string[] | string
const allowedDomains: string[] = typeof rawAllowedDomains === 'string'
    ? rawAllowedDomains.split(',').map((d: string) => d.trim().toLowerCase()).filter((d: string) => d.length > 0)
    : rawAllowedDomains
const showDomainHint = isEnterprise && allowedDomains.length > 0
const registrationClosed = publicConfig.registrationDisabled === true

const onSubmit = async () => {
    error.value = ''
    if (password.value !== confirmPassword.value) {
        error.value = t('auth.register.errors.passwordMismatch')
        return
    }
    if (password.value.length < 8) {
        error.value = t('auth.register.errors.passwordTooShort')
        return
    }
    loading.value = true
    try {
        const { error: signUpError } = await authClient.signUp.email({
            email: email.value,
            password: password.value,
            name: name.value.trim() || (email.value.split('@')[0] ?? ''),
        })
        if (signUpError) {
            // 准入拒绝映射：域名不在允许列表（enterprise 白名单 / public 黑名单）与注册关闭分别提示
            if (signUpError.code === 'EMAIL_DOMAIN_NOT_ALLOWED') {
                error.value = t('auth.register.errors.domainNotAllowed')
            } else if (signUpError.message?.includes('sign up is not enabled') || signUpError.code === 'EMAIL_PASSWORD_SIGN_UP_DISABLED') {
                error.value = t('auth.register.errors.signUpDisabled')
            } else {
                error.value = t('auth.register.errors.registerFailed', { message: signUpError.message ?? t('common.errors.unknown') })
            }
            return
        }
        // 刷新会话缓存后再导航：signUp 后 session atom 可能尚未就绪，
        // 立即导航会触发 auth middleware 误判未登录（与 middleware 异步等待配套）
        await refreshNuxtData('session')
        await navigateTo('/dashboard')
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="auth">
        <div class="auth__card">
            <h1 class="auth__title">
                dependfix
            </h1>
            <p class="auth__subtitle">
                {{ t('auth.register.subtitle') }}
            </p>
            <Card>
                <template #content>
                    <Message
                        v-if="registrationClosed"
                        severity="warn"
                        :closable="false"
                    >
                        {{ t('auth.register.registrationClosed') }}
                    </Message>
                    <Message
                        v-else-if="showDomainHint"
                        severity="info"
                        :closable="false"
                    >
                        {{ t('auth.register.onlyDomains', {domains: allowedDomains.map((d) => `@${d}`).join(t('auth.register.domainSeparator'))}) }}
                    </Message>
                    <form
                        v-if="!registrationClosed"
                        class="auth-form"
                        @submit.prevent="onSubmit"
                    >
                        <div class="auth-form__field">
                            <label for="name">{{ t('auth.register.name') }}</label>
                            <InputText
                                id="name"
                                v-model="name"
                                :placeholder="t('auth.register.namePlaceholder')"
                                fluid
                            />
                        </div>
                        <div class="auth-form__field">
                            <label for="email">{{ t('auth.register.email') }}</label>
                            <InputText
                                id="email"
                                v-model="email"
                                type="email"
                                placeholder="you@example.com"
                                fluid
                                required
                            />
                        </div>
                        <div class="auth-form__field">
                            <label for="password">{{ t('auth.register.password') }}</label>
                            <Password
                                id="password"
                                v-model="password"
                                :feedback="false"
                                toggle-mask
                                :placeholder="t('auth.register.passwordPlaceholder')"
                                fluid
                                required
                            />
                        </div>
                        <div class="auth-form__field">
                            <label for="confirm-password">{{ t('auth.register.confirmPassword') }}</label>
                            <Password
                                id="confirm-password"
                                v-model="confirmPassword"
                                :feedback="false"
                                toggle-mask
                                :placeholder="t('auth.register.confirmPasswordPlaceholder')"
                                fluid
                                required
                            />
                        </div>
                        <Message
                            v-if="error"
                            severity="error"
                            :closable="false"
                        >
                            {{ error }}
                        </Message>
                        <Button
                            type="submit"
                            :label="t('auth.register.submit')"
                            :loading="loading"
                            fluid
                        />
                    </form>
                    <div class="auth__switch">
                        {{ t('auth.register.hasAccount') }}
                        <NuxtLink to="/login">
                            {{ t('auth.register.backToLogin') }}
                        </NuxtLink>
                    </div>
                </template>
            </Card>
            <div style="display: flex; justify-content: center; margin-top: 1rem">
                <Button
                    :icon="dark ? 'pi pi-sun' : 'pi pi-moon'"
                    text
                    rounded
                    :aria-label="t('auth.register.toggleDarkMode')"
                    @click="toggle"
                />
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.auth-form {
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
</style>
