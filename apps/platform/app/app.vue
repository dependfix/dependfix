<script setup lang="ts">
// 根组件：caomei-ui 全局 provider 接线（内建文案 / 轻提示 / 二次确认）。
const { locale } = useI18n()

// caomei-ui 内建文案语言标识为 `zh-CN` / `en-US`，平台 i18n 用 `zh-CN` / `en`，此处做单点映射
const caomeiLocale = computed<'zh-CN' | 'en-US'>(() => (locale.value === 'en' ? 'en-US' : 'zh-CN'))

useHead({
    title: 'dependfix',
    titleTemplate: (title) => (title ? `${title} · dependfix` : 'dependfix'),
})
</script>

<template>
    <CaomeiConfigProvider :locale="caomeiLocale">
        <CaomeiToastProvider>
            <CaomeiConfirmDialog>
                <div>
                    <NuxtRouteAnnouncer />
                    <NuxtLayout>
                        <NuxtPage />
                    </NuxtLayout>
                </div>
            </CaomeiConfirmDialog>
        </CaomeiToastProvider>
    </CaomeiConfigProvider>
</template>
