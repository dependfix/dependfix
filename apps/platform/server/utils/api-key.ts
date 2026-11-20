import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ApiKey } from '#server/entities/api-key'

/**
 * API key 自建存储工具（设计稿 §5.1 回退路径）。
 *
 * 选择理由：`@better-auth/api-key` 的 organization 归属模式强制依赖 better-auth organization
 * 插件，与平台自有 Organization 实体冲突；按设计预置回退改为「实体 + SHA-256 + 常量时间比较」。
 *
 * - 明文格式：`dfk_` + 48 位 base64url（高熵，仅创建响应返回一次）
 * - 存储：SHA-256 十六进制摘要（不可逆）；校验用 `timingSafeEqual`
 * - scope 存 `metadata.scopes`（本期仅 `read`）
 */

export const API_KEY_PREFIX = 'dfk_'
export const API_KEY_SCOPE_READ = 'read'

export const generateApiKey = (): string => `${API_KEY_PREFIX}${randomBytes(36).toString('base64url')}`

export const hashApiKey = (key: string): string => createHash('sha256').update(key).digest('hex')

/** 常量时间比较（长度不同直接 false，不泄露前缀匹配长度） */
export const verifyApiKeyHash = (key: string, storedHash: string): boolean => {
    const actual = Buffer.from(hashApiKey(key), 'utf8')
    const expected = Buffer.from(storedHash, 'utf8')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const readApiKeyScopes = (metadata: string | null | undefined): string[] => {
    if (!metadata) {
        return []
    }
    try {
        const parsed = JSON.parse(metadata) as { scopes?: unknown }
        return Array.isArray(parsed.scopes)
            ? parsed.scopes.filter((scope): scope is string => typeof scope === 'string')
            : []
    } catch {
        return []
    }
}

export const isApiKeyExpired = (key: Pick<ApiKey, 'expiresAt'>, now = Date.now()): boolean => (
    key.expiresAt !== null && key.expiresAt.getTime() <= now
)
