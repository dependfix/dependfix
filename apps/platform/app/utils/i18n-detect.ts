/**
 * 语言检测纯函数（逻辑抽取，便于单测）：
 * 按优先级取第一个非空候选，全部为空时回退默认 locale。
 * 优先级由调用方决定传入顺序：URL 前缀/query > Cookie > Accept-Language > 默认。
 * 候选未在已配置 locale 列表时不做过滤——检测器运行时拿不到 locales 清单，
 * 未配置候选由 vue-i18n fallback 兜底（与 @nuxtjs/i18n 官方 detector 模式一致）。
 * @param candidates 按优先级排序的语言候选（可为 null / 空字符串）
 * @param defaultLocale 兜底默认 locale
 */
export function resolveLocale(
    candidates: (string | null | undefined)[],
    defaultLocale: string,
): string {
    return candidates.find((candidate) => !!candidate) ?? defaultLocale
}
