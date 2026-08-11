/**
 * Vue I18n 构建期配置：datetime/number 格式按 locale 本地化。
 * - 语言包 messages 不在此处配置（走 langDir 懒加载，见 nuxt.config i18n.locales）。
 * - 路径由 @nuxtjs/i18n 相对 restructureDir（i18n/）解析。
 */
export default defineI18nConfig(() => ({
    datetimeFormats: {
        // 简体中文：2026-08-11 14:30
        'zh-CN': {
            short: {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            },
            long: {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            },
        },
        // English：Aug 11, 2026 14:30（键为 locale code 'en'，对应 nuxt.config locales）
        en: {
            short: {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            },
            long: {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            },
        },
    },
    numberFormats: {
        'zh-CN': {
            decimal: {
                style: 'decimal',
                maximumFractionDigits: 2,
            },
        },
        en: {
            decimal: {
                style: 'decimal',
                maximumFractionDigits: 2,
            },
        },
    },
}))
