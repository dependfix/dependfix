<script setup lang="ts">
// 首页：已登录跳转仪表板，未登录跳转登录页
const { session, isPending } = useSession()
const { t } = useI18n()

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
            <h1 class="auth__title">
                dependfix
            </h1>
            <p class="auth__subtitle">
                {{ t('index.subtitle') }}
            </p>
            <ProgressSpinner v-if="isPending" style="width: 40px; height: 40px" />
        </div>
    </div>
</template>
