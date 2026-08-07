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

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

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
                    <div class="auth__switch">
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
</style>
