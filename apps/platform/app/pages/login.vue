<script setup lang="ts">
import { useColorMode } from '~/composables/use-color-mode'
import { authClient } from '~/utils/auth-client'

definePageMeta({
    layout: false,
})

const { dark, toggle, initColorMode } = useColorMode()

onMounted(() => {
    initColorMode()
})

// 认证模式感知：按 authMode 决定第三方登录方式展示；
// socialProviders 由 OAuth（GitHub/Google）与 OIDC SSO 子任务填充
const publicConfig = useRuntimeConfig().public
const authMode = publicConfig.authMode
const registrationClosed = publicConfig.registrationDisabled === true
const socialProviders = ref<string[]>([])

const PROVIDER_LABELS: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
    oidc: '企业 SSO',
}
const providerLabel = (provider: string) => PROVIDER_LABELS[provider] ?? provider

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const onSocialSignIn = async (provider: string) => {
    error.value = ''
    const { error: socialError } = await authClient.signIn.social({
        provider,
        callbackURL: '/dashboard',
    })
    if (socialError) {
        error.value = `登录失败：${socialError.message ?? '未知错误'}`
    }
}

const onSubmit = async () => {
    error.value = ''
    loading.value = true
    try {
        const { error: signInError } = await authClient.signIn.email({
            email: email.value,
            password: password.value,
        })
        if (signInError) {
            error.value = '登录失败：邮箱或密码错误'
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
            <h1 class="auth__title">
                dependfix
            </h1>
            <p class="auth__subtitle">
                登录管理平台
            </p>
            <Card>
                <template #content>
                    <form class="auth-form" @submit.prevent="onSubmit">
                        <div class="auth-form__field">
                            <label for="email">邮箱</label>
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
                            <label for="password">密码</label>
                            <Password
                                id="password"
                                v-model="password"
                                :feedback="false"
                                toggle-mask
                                placeholder="请输入密码"
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
                            label="登录"
                            :loading="loading"
                            fluid
                        />
                    </form>
                    <!-- 第三方登录区：authMode 感知 + 已配置 provider 才显示（OAuth / OIDC 子任务填充） -->
                    <div v-if="authMode && socialProviders.length" class="auth__social">
                        <div class="auth__divider">
                            或
                        </div>
                        <div class="auth__social-buttons">
                            <Button
                                v-for="provider in socialProviders"
                                :key="provider"
                                :label="provider === 'oidc' ? '企业 SSO 登录' : `${providerLabel(provider)} 登录`"
                                icon="pi pi-user"
                                text
                                outlined
                                fluid
                                @click="onSocialSignIn(provider)"
                            />
                        </div>
                    </div>
                    <div v-if="!registrationClosed" class="auth__switch">
                        还没有账号？
                        <NuxtLink to="/register">
                            立即注册
                        </NuxtLink>
                    </div>
                </template>
            </Card>
            <div style="display: flex; justify-content: center; margin-top: 1rem">
                <Button
                    :icon="dark ? 'pi pi-sun' : 'pi pi-moon'"
                    text
                    rounded
                    aria-label="切换暗色模式"
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
    color: var(--p-content-muted-color);
    font-size: $font-size-sm;

    &::before,
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--p-content-border-color);
    }
}
</style>
