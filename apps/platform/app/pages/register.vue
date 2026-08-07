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
const name = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

const onSubmit = async () => {
    error.value = ''
    if (password.value !== confirmPassword.value) {
        error.value = '两次输入的密码不一致'
        return
    }
    if (password.value.length < 8) {
        error.value = '密码至少 8 位'
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
            error.value = `注册失败：${signUpError.message ?? '未知错误'}`
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
                创建管理平台账号
            </p>
            <Card>
                <template #content>
                    <form class="auth-form" @submit.prevent="onSubmit">
                        <div class="auth-form__field">
                            <label for="name">名称（可选）</label>
                            <InputText
                                id="name"
                                v-model="name"
                                placeholder="管理员"
                                fluid
                            />
                        </div>
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
                                placeholder="至少 8 位"
                                fluid
                                required
                            />
                        </div>
                        <div class="auth-form__field">
                            <label for="confirm-password">确认密码</label>
                            <Password
                                id="confirm-password"
                                v-model="confirmPassword"
                                :feedback="false"
                                toggle-mask
                                placeholder="再次输入密码"
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
                            label="注册"
                            :loading="loading"
                            fluid
                        />
                    </form>
                    <div class="auth__switch">
                        已有账号？
                        <NuxtLink to="/login">
                            返回登录
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
