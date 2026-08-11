// @nuxtjs/i18n 服务端 detector API 类型补充（定向检查用，不参与运行时）
// 背景：@nuxtjs/i18n 通过 addServerImports 将 defineI18nLocaleDetector（runtime/composables/server）
// 与 @intlify/utils/h3 的 try*Locale 注册进 nitro 侧 #imports；客户端生成的类型（.nuxt/types/imports.d.ts）
// 是 export {} + declare global，不含这些导出，且 localeDetector.ts 被模块排除出 .nuxt/tsconfig.json，
// 导致其游离于常规类型检查之外。
// 本文件按真实签名声明（来源：@nuxtjs/i18n/dist/runtime/composables/server.d.ts 与
// @intlify/utils/dist/h3.d.ts），供 tsconfig.i18n.json 定向检查使用；运行时以 nitro 编译为准。
export {}

// 全局 auto-import：i18n.config.ts 使用的 defineI18nConfig（Nuxt 生成类型同源）
declare global {
    const defineI18nConfig: (config: () => Record<string, unknown>) => Record<string, unknown>
}

// #imports：detector 文件依赖的 server 侧导出（tsconfig.i18n.json paths 映射到此文件）
declare module '#imports' {
    export interface LocaleDetectorConfig {
        defaultLocale: string
        fallbackLocale?: unknown
    }
    export type LocaleDetector = (event: unknown, config: LocaleDetectorConfig) => string
    export function defineI18nLocaleDetector(detector: LocaleDetector): LocaleDetector
    export function tryQueryLocale(event: unknown, options?: { lang?: string, name?: string }): Intl.Locale | null
    export function tryCookieLocale(event: unknown, options?: { lang?: string, name?: string }): Intl.Locale | null
    export function tryHeaderLocale(event: unknown, options?: { lang?: string, name?: string }): Intl.Locale | null
}
