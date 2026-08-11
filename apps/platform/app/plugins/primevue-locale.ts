import { usePrimeVue } from 'primevue/config'
import { en } from 'primelocale/js/en.js'
import { zh_CN } from 'primelocale/js/zh_CN.js'

/**
 * PrimeVue 内置文案 locale 联动：
 * 跟随 @nuxtjs/i18n locale 变化同步 usePrimeVue().config.locale，
 * 使对话框确认/取消、表格空态等组件内置文案随语言切换。
 * primelocale 为 PrimeVue 官方 locale 数据包（zh_CN / en）。
 */
export default defineNuxtPlugin((nuxtApp) => {
    const primevue = usePrimeVue()

    // 初始按当前 locale 设置（SSR 首屏与客户端首载一致）
    const i18n = nuxtApp.$i18n
    const primevueLocales: Record<string, typeof zh_CN> = {
        'zh-CN': zh_CN,
        en,
    }
    primevue.config.locale = primevueLocales[i18n.locale.value] ?? en

    // locale 变化联动（客户端；SSR 侧由上面的初始设置覆盖首屏）
    if (import.meta.client) {
        watch(
            () => i18n.locale.value,
            (locale) => {
                primevue.config.locale = primevueLocales[locale] ?? en
            },
        )
    }
})
