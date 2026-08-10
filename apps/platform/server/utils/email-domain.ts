/**
 * 邮箱域名准入工具（注册准入纯函数）。
 * 职责：解析域名名单（逗号分隔 env）、提取邮箱域名、判定域名是否允许注册。
 * 无 better-auth / DataSource 依赖，便于单元测试。
 */

export type AuthMode = 'enterprise' | 'public'

/** 解析逗号分隔的域名名单（env 原始字符串 → 规范化数组：trim + lowercase + 去空）。 */
export const parseDomainList = (raw: string | undefined | null): string[] => {
    if (!raw) {
        return []
    }
    return raw
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length > 0)
}

/** 提取邮箱域名（小写）。无效邮箱（无 @ / @ 后为空）返回 null。 */
export const extractDomain = (email: string | null | undefined): string | null => {
    if (!email) {
        return null
    }
    const at = email.lastIndexOf('@')
    if (at <= 0 || at === email.length - 1) {
        return null
    }
    const domain = email.slice(at + 1).trim().toLowerCase()
    return domain.length > 0 ? domain : null
}

/**
 * 注册准入判定（fail-closed）：
 * - email 缺失/无效 → false（拒绝开通，不静默放行、不生成占位邮箱）
 * - enterprise：白名单为空 = 完全关闭自动开通（platform-auth-users.md §11 决策点 6 修订）；
 *   白名单非空 = 域名必须在白名单内（精确匹配，子域不继承）
 * - public：命中黑名单拒绝，其余放行
 */
export const isEmailDomainAllowed = (options: {
    email: string | null | undefined
    mode: AuthMode
    allowedDomains: string[]
    blockedDomains: string[]
}): boolean => {
    const domain = extractDomain(options.email)
    if (domain === null) {
        return false
    }
    if (options.mode === 'enterprise') {
        return options.allowedDomains.length > 0 && options.allowedDomains.includes(domain)
    }
    return !options.blockedDomains.includes(domain)
}
