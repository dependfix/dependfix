<script setup lang="ts">
import { useColorMode } from '~/composables/use-color-mode'

// 首页：已登录跳转仪表板，未登录跳转登录页
const { session, isPending } = useSession()
const { dark, initColorMode } = useColorMode()
const { t } = useI18n()

// 首页 reload 时也可能没有 .dark class（layout: false 独立 layout），
// 主动调 initColorMode 与 auth 页对齐
onMounted(() => {
    initColorMode()
})

// auth 页品牌 mark：跟随 .dark class 动态切换（与站点主题切换逻辑一致）
// 之前用 <picture media="(prefers-color-scheme: dark)"> 只跟随系统偏好，
// 与用户在站内手动 toggle 暗色模式的 .dark class 冲突，导致深色背景下显示浅色 mark
const authLogoSrc = computed(() => dark.value ? '/brand/logo-navy.svg' : '/brand/logo-light.svg')

watch(
    () => isPending.value,
    (pending) => {
        if (!pending) {
            navigateTo(session.value?.user ? '/dashboard' : '/login')
        }
    },
    { immediate: true },
)
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
                {{ t('index.subtitle') }}
            </p>
            <CaomeiProgressSpinner
                v-if="isPending"
                class="auth__spinner"
                size="lg"
            />
        </div>
    </div>
</template>

<style lang="scss" scoped>
// 加载指示器对齐迁移前的 40px（caomei 尺寸档最大为 lg = 32px）。
// 库的档位变量规则由 `:where()` 包裹（特异性 0），此 scoped 规则可直接覆盖。
.auth__spinner {
    --caomei-progress-spinner-size: 40px;
}
</style>
