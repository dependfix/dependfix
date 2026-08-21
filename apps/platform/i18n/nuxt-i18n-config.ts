/**
 * @nuxtjs/i18n 模块层配置（与 i18n.config.ts 解耦，按 jiti 加载边界拆分）。
 *
 * 拆分原因：
 * - i18n.config.ts 通过 `defineI18nConfig(() => ({...}))` 创建 vue-i18n 配置；
 *   `defineI18nConfig` 是 @nuxtjs/i18n 模块加载时通过 addImports 注入的运行时全局，
 *   只在 Nuxt transform pipeline 就绪后才存在。
 * - nuxt.config.ts 顶层 import 走 jiti（轻量 TS 转换器，无 Nuxt transform pipeline），
 *   若 import 任何调用了 `defineI18nConfig` 的模块，jiti 会在模块顶层 evaluate 时
 *   报 `defineI18nConfig is not defined`。
 * - 因此本文件与 i18n.config.ts 物理拆分：前者承载 Nuxt 模块层字段（jiti 安全），
 *   后者承载 vue-i18n 运行时字段（Nuxt transform pipeline 加载）。
 *
 * 单点声明目标：未来新增/调整语言、修改策略、调整 detector 路径，
 * 只需改本文件或在 `locales/` 下增删对应 `.json`；`nuxt.config.ts` 与
 * `i18n.config.ts` 不需任何 i18n 字段调整。
 *
 * 维护约束：
 * - `nuxtI18n.locales` 中 `code` 决定 URL 前缀（`/en` 即 en，无前缀即 `zh-CN`），
 *   `language` 保留完整 BCP 47 区域码用于 Accept-Language 匹配。
 * - `as const` 锁定字面量类型，避免 spread 时被 Nuxt 模块类型推断为宽化
 *   （`string` 而非字面量），引发 `@nuxtjs/i18n` 字段契约检查报错。
 *
 * 关联规范：[docs/standards/platform.md §7.2 i18n 配置单点声明](../../standards/platform.md#72-i18n-配置单点声明)
 */

// @nuxtjs/i18n 模块层配置（被 nuxt.config.ts i18n 顶层 spread 引用）
export const nuxtI18n = {
    strategy: 'prefix_and_default',
    defaultLocale: 'zh-CN',
    locales: [
        { code: 'zh-CN', name: '简体中文', file: 'zh-CN.json', language: 'zh-CN' },
        // code 决定 URL 前缀（/en）；language 保留完整语言标识用于 Accept-Language 匹配
        { code: 'en', name: 'English', file: 'en-US.json', language: 'en-US' },
    ],
    langDir: 'locales',
    lazy: true,
    // 语言偏好持久化：useCookie 启用 setLocale 写 i18n_locale（切换器/设置页）；
    // redirectOn 'root' 仅根路径做浏览器检测（首页立即跳转无影响），其余路径 locale 由
    // URL 前缀决定（无前缀 = zh-CN / en 前缀 = en），避免客户端检测重置前缀页 locale
    detectBrowserLanguage: {
        useCookie: true,
        cookieKey: 'i18n_locale',
        redirectOn: 'root',
        alwaysRedirect: false,
    },
} as const

// 浏览器语言检测器路径（相对 `i18n/` 目录解析，独立模块便于单测）
export const localeDetectorFile = 'localeDetector.ts'
