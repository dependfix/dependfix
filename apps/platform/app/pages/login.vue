<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { useColorMode } from '~/composables/use-color-mode'
import { authClient } from '~/utils/auth-client'
import { isEmailNotVerifiedError, isRateLimitedError } from '~/utils/auth-errors'
import { type SocialProvider, resolveSocialProviderName, resolveSocialProviders } from '~/utils/social-providers'

definePageMeta({
    layout: false,
})

const { dark, toggle, initColorMode } = useColorMode()
const { t } = useI18n()

onMounted(() => {
    initColorMode()
})

// 认证模式感知：按 authMode 决定第三方登录方式展示；
// socialProviders 由 OAuth（GitHub/Google）与 OIDC SSO 子任务填充
const publicConfig = useRuntimeConfig().public
const authMode = publicConfig.authMode
const registrationClosed = publicConfig.registrationDisabled === true
// 第三方登录方式（public：GitHub/Google；enterprise：OIDC SSO；凭据配置才可用）
// authMode 运行时收窄：服务端 assertAuthMode 已保证只可能是 public|enterprise
const socialProviders = computed<SocialProvider[]>(() => resolveSocialProviders({
    authMode: publicConfig.authMode as 'public' | 'enterprise',
    githubAvailable: publicConfig.githubAvailable === true,
    googleAvailable: publicConfig.googleAvailable === true,
    oidcAvailable: publicConfig.oidcAvailable === true,
}))

/** 按钮文案：GitHub / Google 用品牌大小写，OIDC 沿用「企业 SSO 登录」专用键。 */
const socialProviderLabel = (provider: SocialProvider) => provider === 'oidc'
    ? t('auth.login.ssoLogin')
    : t('auth.login.socialLogin', { provider: resolveSocialProviderName(provider) })

// auth 页品牌 mark：跟随 .dark class 动态切换（与主题切换逻辑一致）
// 之前用 <picture media="(prefers-color-scheme: dark)"> 只跟随系统偏好，
// 与用户在站内手动 toggle 暗色模式的 .dark class 冲突，导致深色背景下显示浅色 mark
const authLogoSrc = computed(() => dark.value ? '/brand/logo-navy.svg' : '/brand/logo-light.svg')

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
/** 登录被拒的原因是「邮箱未验证」：此时给重发入口，而不是让用户以为是密码错误 */
const emailNotVerified = ref(false)
const resendState = ref<'idle' | 'sending' | 'sent' | 'rate-limited' | 'failed'>('idle')

const onSocialSignIn = async (provider: SocialProvider) => {
    error.value = ''
    const { error: socialError } = await authClient.signIn.social({
        provider,
        callbackURL: '/dashboard',
    })
    if (socialError) {
        error.value = t('auth.login.errors.loginFailed', { message: socialError.message ?? t('common.errors.unknown') })
    }
}

/** 复用 better-auth 既有端点重发验证邮件（限流 60s / 3 次，429 给可读提示）。 */
const onResendVerification = async () => {
    if (!email.value || resendState.value === 'sending') {
        return
    }
    resendState.value = 'sending'
    const { error: resendError } = await authClient.sendVerificationEmail({
        email: email.value,
        callbackURL: '/login',
    })
    if (!resendError) {
        resendState.value = 'sent'
        return
    }
    resendState.value = isRateLimitedError(resendError) ? 'rate-limited' : 'failed'
}

const onSubmit = async () => {
    error.value = ''
    emailNotVerified.value = false
    resendState.value = 'idle'
    loading.value = true
    try {
        const { error: signInError } = await authClient.signIn.email({
            email: email.value,
            password: password.value,
        })
        if (signInError) {
            // 未验证邮箱（better-auth FORBIDDEN / EMAIL_NOT_VERIFIED）与密码错误分开呈现：
            // 前者可自助恢复，后者才提示「邮箱或密码错误」
            if (isEmailNotVerifiedError(signInError)) {
                emailNotVerified.value = true
                error.value = t('auth.login.errors.emailNotVerified')
            } else if (isRateLimitedError(signInError)) {
                error.value = t('auth.login.errors.tooManyRequests')
            } else {
                error.value = t('auth.login.errors.invalidCredentials')
            }
            return
        }
        // 刷新会话缓存后再导航：signIn 后 session atom 可能尚未就绪，
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
            <img
                class="auth__logo"
                :src="authLogoSrc"
                alt="dependfix"
            >
            <h1 class="auth__title">
                dependfix
            </h1>
            <p class="auth__subtitle">
                {{ t('auth.login.subtitle') }}
            </p>
            <CaomeiCard>
                <form class="auth-form" @submit.prevent="onSubmit">
                    <div class="auth-form__field">
                        <label for="email">{{ t('auth.login.email') }}</label>
                        <CaomeiInput
                            id="email"
                            v-model="email"
                            type="email"
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div class="auth-form__field">
                        <label for="password">{{ t('auth.login.password') }}</label>
                        <CaomeiPassword
                            id="password"
                            v-model="password"
                            :placeholder="t('auth.login.passwordPlaceholder')"
                            required
                        />
                    </div>
                    <CaomeiMessage
                        v-if="error"
                        tone="danger"
                        :closable="false"
                    >
                        {{ error }}
                    </CaomeiMessage>
                    <!-- 未验证邮箱：给出自助恢复入口（复用 better-auth 端点，不新增后端能力） -->
                    <div v-if="emailNotVerified" class="auth-form__resend">
                        <CaomeiButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            :disabled="resendState === 'sending'"
                            @click="onResendVerification"
                        >
                            {{ resendState === 'sending' ? t('auth.login.resend.sending') : t('auth.login.resend.action') }}
                        </CaomeiButton>
                        <p v-if="resendState === 'sent'" class="auth-form__resend-hint">
                            {{ t('auth.login.resend.sent') }}
                        </p>
                        <p v-else-if="resendState === 'rate-limited'" class="auth-form__resend-hint">
                            {{ t('auth.login.resend.rateLimited') }}
                        </p>
                        <p v-else-if="resendState === 'failed'" class="auth-form__resend-hint">
                            {{ t('auth.login.resend.failed') }}
                        </p>
                    </div>
                    <CaomeiButton
                        type="submit"
                        :loading="loading"
                        block
                    >
                        {{ t('auth.login.submit') }}
                    </CaomeiButton>
                </form>
                <!-- 第三方登录区：authMode 感知 + 已配置 provider 才显示（OAuth / OIDC 子任务填充） -->
                <div v-if="authMode && socialProviders.length" class="auth__social">
                    <div class="auth__divider">
                        {{ t('auth.login.or') }}
                    </div>
                    <div class="auth__social-buttons">
                        <SocialLoginButton
                            v-for="provider in socialProviders"
                            :key="provider"
                            :provider="provider"
                            :label="socialProviderLabel(provider)"
                            @select="onSocialSignIn(provider)"
                        />
                    </div>
                </div>
                <div v-if="!registrationClosed" class="auth__switch">
                    {{ t('auth.login.noAccount') }}
                    <NuxtLink to="/register">
                        {{ t('auth.login.registerNow') }}
                    </NuxtLink>
                </div>
            </CaomeiCard>
            <div style="display: flex; justify-content: center; margin-top: 1rem">
                <CaomeiButton
                    variant="ghost"
                    rounded
                    :label="t('auth.login.toggleDarkMode')"
                    @click="toggle"
                >
                    <template #icon>
                        <CaomeiIcon :icon="dark ? Sun : Moon" />
                    </template>
                </CaomeiButton>
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
        @include field-stack;

        label {
            font-size: $font-size-sm;
            font-weight: 500;
        }
    }

    // 未验证邮箱的自助恢复入口：与错误提示同组，提示文案随发送结果切换
    &__resend {
        display: flex;
        flex-direction: column;
        gap: $space-2;
        margin-top: -$space-2;
    }

    &__resend-hint {
        margin: 0;
        font-size: $font-size-sm;
        color: var(--caomei-color-text-muted);
    }
}

.auth__social {
    margin-top: $space-4;

    &-buttons {
        display: flex;
        flex-direction: column;
        gap: $space-2;
    }
}

.auth__divider {
    display: flex;
    align-items: center;
    gap: $space-3;
    margin-bottom: $space-3;
    color: var(--caomei-color-text-muted);
    font-size: $font-size-sm;

    &::before,
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--caomei-color-border);
    }
}
</style>
