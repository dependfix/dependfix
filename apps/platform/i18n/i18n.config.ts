/**
 * vue-i18n 构建期配置：datetime/number 格式按 locale 本地化。
 *
 * 加载路径：被 `nuxt.config.ts` 的 `i18n.vueI18n` 字段按文件路径加载；
 *           由 Nuxt transform pipeline 处理（注入 `defineI18nConfig` 全局），
 *           因此**不能被 jiti 顶层 import**——任何 import 本文件的代码都会在
 *           jiti evaluate 模块顶层时因 `defineI18nConfig is not defined` 报错。
 *           如需在 nuxt.config.ts 顶层引用本文件的导出，请用 named export
 *           承载并拆到独立文件（见 ./nuxt-i18n-config.ts 拆分示例）。
 *
 * 语言包 messages 不在此处配置（走 `nuxtI18n.langDir` 懒加载，见 nuxt-i18n-config.ts）。
 * 路径由 @nuxtjs/i18n 相对 `restructureDir`（`i18n/`）解析。
 *
 * 关联规范：[docs/standards/platform.md §7.2 i18n 配置单点声明](../../standards/platform.md#72-i18n-配置单点声明)
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
        // English：Aug 11, 2026 14:30（键为 locale code 'en'，对应 nuxt-i18n-config.ts locales）
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
