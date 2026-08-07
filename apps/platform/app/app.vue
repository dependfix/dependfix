<script setup lang="ts">
// 根组件：PrimeVue 由 @primevue/nuxt-module 自动注册，无需手动导入
useHead({
    title: 'dependfix',
    titleTemplate: (title) => (title ? `${title} · dependfix` : 'dependfix'),
})
</script>

<template>
    <div>
        <NuxtRouteAnnouncer />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>
