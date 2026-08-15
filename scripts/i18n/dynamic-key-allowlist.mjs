/**
 * 动态 key 白名单（dependfix 适配版）
 *
 * 供两类消费者使用：
 * - scripts/i18n/audit-locale-keys.mjs：unused 候选审计时豁免这些动态生成的 key 模式
 * - eslint.config.js（apps/platform 的 ESLINT_I18N 块）：@intlify/vue-i18n no-unused-keys 的 ignores
 *
 * dependfix 平台当前全部使用静态 key（t('common.nav.dashboard')），尚无动态 key 拼接；
 * 保留本文件与导出结构，供未来引入动态 key 时登记模式，避免审计/ESLint 误报 unused。
 */
const DYNAMIC_KEY_PATTERN_SOURCES = [
    // 示例（未来登记格式）：
    // '^common\\.status\\.',
    // '^alerts\\.severity\\.',
]

export const i18nDynamicKeyPatternSources = DYNAMIC_KEY_PATTERN_SOURCES

export const i18nDynamicKeyPatterns = DYNAMIC_KEY_PATTERN_SOURCES.map((source) => new RegExp(source, 'u'))

export const vueI18nNoUnusedKeyIgnores = DYNAMIC_KEY_PATTERN_SOURCES.map((source) => `/${source}/`)
