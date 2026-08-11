import { resolveLocale } from '../app/utils/i18n-detect'
import { defineI18nLocaleDetector, tryCookieLocale, tryHeaderLocale, tryQueryLocale } from '#imports'

/**
 * 语言检测器：URL 前缀 > Cookie（i18n_locale）> 浏览器 Accept-Language > 默认 zh-CN。
 * - URL 前缀由 @nuxtjs/i18n prefix_and_default 策略路由层处理（/en 即 en，无前缀即 zh-CN）；
 *   本检测器负责无前缀首次访问时的 fallback 探测。
 * - 检测器运行时上下文仅提供 { defaultLocale, fallbackLocale }（无 locales 清单），
 *   故按官方模式取第一个非空候选，未配置的候选由 vue-i18n fallback 兜底。
 * - 优先级裁决逻辑抽离为 resolveLocale 纯函数（app/utils/i18n-detect.ts，单测覆盖）。
 */
export default defineI18nLocaleDetector((event, config) => {
    const candidates = [
        // query locale（?locale=en，禁用默认值回退：取不到返回 null 继续探测）
        tryQueryLocale(event, { lang: '', name: 'locale' })?.toString(),
        // cookie locale（i18n_locale，语言切换器与设置页写 cookie 后首次访问命中）
        tryCookieLocale(event, { lang: '', name: 'i18n_locale' })?.toString(),
        // 浏览器语言偏好（Accept-Language）
        tryHeaderLocale(event, { lang: '' })?.toString(),
    ]
    return resolveLocale(candidates, config.defaultLocale)
})
