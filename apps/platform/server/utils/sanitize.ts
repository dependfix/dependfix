/**
 * 统一敏感信息脱敏工具。
 *
 * 合并 container-executor.ts 的 sanitizeErrorMessage 与 logger.ts 的 sanitizeLogData，
 * 消除重复实现，确保脱敏规则单一事实源。
 *
 * 脱敏规则：
 * - URL 内嵌凭据：`https://x-access-token:TOKEN@github.com/...` → `https://***@...`
 * - Authorization 头：`Authorization: <scheme> <token>` → `Authorization: <scheme> ***`
 * - GitHub PAT 前缀：`ghp_` / `gho_` / `ghs_` / `ghr_` → `***`
 * - 敏感字段名：password / secret / token / credential → `***`
 */

/** 字符串脱敏（核心规则） */
export function sanitizeString(message: string): string {
    return message
        .replace(/https?:\/\/[^/@\s]+@/g, 'https://***@')
        .replace(/(Authorization:\s+(?:basic|token|bearer)\s+)\S+/gi, '$1***')
        .replace(/(ghp_|gho_|ghs_|ghr_)\w+/g, '$1***')
}

/**
 * 深度脱敏（支持字符串、数组、对象递归处理）。
 * 对象的 key 匹配敏感字段名时，value 替换为 `***`。
 */
export function sanitizeDeep(data: unknown): unknown {
    if (typeof data === 'string') {
        return sanitizeString(data)
    }
    if (Array.isArray(data)) {
        return data.map(sanitizeDeep)
    }
    if (data && typeof data === 'object') {
        const result: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            if (/token|secret|password|authorization|credential/i.test(key)) {
                result[key] = '***'
            } else {
                result[key] = sanitizeDeep(value)
            }
        }
        return result
    }
    return data
}
