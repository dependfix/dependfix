import { LRUCache } from 'lru-cache'
import { getRequestIP, setHeader } from 'h3'
import { requireAuth } from './guard'
import { createLocalizedError } from './localized-error'
import { resolveOrganizationId } from './organization'
import { hashApiKey, isApiKeyExpired, readApiKeyScopes, verifyApiKeyHash } from './api-key'
import { logger } from './logger'
import { ensureDatabaseInitialized } from '#server/database'
import { ApiKey } from '#server/entities/api-key'
import { ApiRequestLog } from '#server/entities/api-request-log'

/**
 * v1 只读面鉴权：API key（`Authorization: Bearer dfk_...`）优先，无 key 时回退会话 Cookie。
 *
 * - key 采用自建存储：SHA-256 摘要查库 + 常量时间比较；`referenceId` = 组织 id，过期 / 禁用 / 吊销一律 401
 * - 本期 scope 只有 `read`：key 的 `metadata.scopes` 不含 read → 403，并写访问日志
 * - 限流按端点档位：常规 600 次 / 5 分钟、日志 60 次 / 5 分钟（进程内 LRU；多实例需切 Redis，边界见设计稿 §5.4）
 * - 会话访问按会话授权且不注入 scopes（浏览器路径零回归）
 */

export interface V1AuthContext {
    kind: 'api-key' | 'session'
    organizationId: string
    userId: string | null
    keyId: string | null
    scopes: string[]
}

interface RateLimitBucket {
    count: number
    resetAt: number
}

const rateLimitCache = new LRUCache<string, RateLimitBucket>({ max: 10_000 })

/** 无效 key 尝试日志：同 IP + key 提示 1 分钟去重，且每 IP 每分钟最多 5 条（防随机前缀绕过） */
const authFailureLogCache = new LRUCache<string, number>({ max: 1_000 })
const authFailureIpCache = new LRUCache<string, { count: number, resetAt: number }>({ max: 1_000 })
const AUTH_FAILURE_LOG_INTERVAL_MS = 60_000
const AUTH_FAILURE_LOG_PER_IP_MAX = 5

/** 测试辅助：清空 401 尝试日志去重（不改变生产语义） */
export const resetApiKeyAuthFailureLog = (): void => {
    authFailureLogCache.clear()
    authFailureIpCache.clear()
}

/** 只取 `dfk_` 后 4 位随机字符：足以区分尝试，又不构成可复用凭据（避免被脱敏规则整体抹平） */
const keyHintOf = (keyValue: string): string => keyValue.replace(/^dfk_/i, '').slice(0, 4)

const maybeLogInvalidApiKey = (
    event: Parameters<typeof setHeader>[0],
    keyHint: string,
    reason: 'not_found' | 'disabled_or_expired' | 'hash_mismatch',
): void => {
    const ip = getRequestIP(event) ?? 'unknown'
    const now = Date.now()
    const bucket = `${ip}:${keyHint}`
    const last = authFailureLogCache.get(bucket)
    if (last !== undefined && now - last < AUTH_FAILURE_LOG_INTERVAL_MS) {
        return
    }
    const ipBucket = authFailureIpCache.get(ip)
    if (!ipBucket || now >= ipBucket.resetAt) {
        authFailureIpCache.set(ip, { count: 1, resetAt: now + AUTH_FAILURE_LOG_INTERVAL_MS })
    } else {
        if (ipBucket.count >= AUTH_FAILURE_LOG_PER_IP_MAX) {
            return
        }
        ipBucket.count += 1
        authFailureIpCache.set(ip, ipBucket)
    }
    authFailureLogCache.set(bucket, now)
    logger.warn('[v1][auth] invalid api key', {
        ip,
        keyHint,
        reason,
        method: event.method,
        path: event.path.split('?')[0]!.slice(0, 255),
    })
}

const readPositiveInt = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? '', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const rateLimitWindowMs = (): number => readPositiveInt(process.env.API_KEY_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000)

export const apiKeyRateLimitMax = (kind: 'regular' | 'log'): number => (
    kind === 'log'
        ? readPositiveInt(process.env.API_KEY_RATE_LIMIT_LOG_MAX, 60)
        : readPositiveInt(process.env.API_KEY_RATE_LIMIT_REGULAR_MAX, 600)
)

/** 测试辅助：清空限流计数（不改变生产语义） */
export const resetApiKeyRateLimit = (): void => {
    rateLimitCache.clear()
}

export const recordApiAccess = async (
    event: Parameters<typeof setHeader>[0],
    input: { keyId: string | null, organizationId: string, statusCode: number },
): Promise<void> => {
    try {
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(ApiRequestLog).save(ds.getRepository(ApiRequestLog).create({
            apiKeyId: input.keyId,
            organizationId: input.organizationId,
            method: event.method,
            path: event.path.split('?')[0]!.slice(0, 255),
            statusCode: input.statusCode,
            ipAddress: getRequestIP(event)?.slice(0, 45) ?? null,
            userAgent: (event.headers.get('user-agent') ?? '').slice(0, 255) || null,
        }))
    } catch {
        // 访问日志失败不阻断只读请求（审计降级，安全边界不依赖日志可用性）
    }
    try {
        await maybeCleanupRequestLogs(await ensureDatabaseInitialized())
    } catch {
        // 保留清理失败独立降级，不影响日志写入结果
    }
}

let lastRequestLogCleanup = 0
/** 访问日志保留 30 天（每小时最多清理一次，避免每次请求都扫表） */
const maybeCleanupRequestLogs = async (ds: Awaited<ReturnType<typeof ensureDatabaseInitialized>>): Promise<void> => {
    const now = Date.now()
    if (now - lastRequestLogCleanup < 60 * 60 * 1000) {
        return
    }
    lastRequestLogCleanup = now
    await ds.getRepository(ApiRequestLog)
        .createQueryBuilder()
        .delete()
        .where('created_at < :cutoff', { cutoff: new Date(now - 30 * 24 * 60 * 60 * 1000) })
        .execute()
}

const consumeRateLimit = (event: Parameters<typeof setHeader>[0], keyId: string, kind: 'regular' | 'log'): boolean => {
    const bucketKey = `${keyId}:${kind}`
    const now = Date.now()
    const max = apiKeyRateLimitMax(kind)
    const windowMs = rateLimitWindowMs()
    const current = rateLimitCache.get(bucketKey)
    if (!current || now >= current.resetAt) {
        rateLimitCache.set(bucketKey, { count: 1, resetAt: now + windowMs })
        return true
    }
    if (current.count >= max) {
        setHeader(event, 'Retry-After', Math.max(1, Math.ceil((current.resetAt - now) / 1000)))
        return false
    }
    current.count += 1
    rateLimitCache.set(bucketKey, current)
    return true
}

/**
 * 解析 v1 请求身份：API key 或会话。未通过时抛本地化错误并写访问日志。
 *
 * @param options.rateLimitClass 端点档位（日志端点传 `log`；默认 `regular`）
 * @param options.requireScope 需要的 scope（数据端点传 `read`；本期仅 read）
 */
export const requireV1Auth = async (
    event: Parameters<typeof requireAuth>[0],
    options: { rateLimitClass?: 'regular' | 'log', requireScope?: string } = {},
): Promise<V1AuthContext> => {
    const authorization = event.headers.get('authorization') ?? ''
    const bearer = /^Bearer\s+(dfk_\S+)$/i.exec(authorization)
    if (!bearer) {
        // 无 key：回退会话（浏览器 / 运维 curl 带 Cookie）；不注入 scopes
        const { user } = await requireAuth(event)
        const ds = await ensureDatabaseInitialized()
        return {
            kind: 'session',
            organizationId: await resolveOrganizationId(ds),
            userId: user.id,
            keyId: null,
            scopes: [],
        }
    }

    const keyValue = bearer[1]!
    const keyHint = keyHintOf(keyValue)
    const ds = await ensureDatabaseInitialized()
    const key = await ds.getRepository(ApiKey).findOne({ where: { key: hashApiKey(keyValue) } })
    if (!key) {
        maybeLogInvalidApiKey(event, keyHint, 'not_found')
        throw createLocalizedError(event, { statusCode: 401, code: 'UNAUTHORIZED' })
    }
    if (!key.enabled || isApiKeyExpired(key)) {
        maybeLogInvalidApiKey(event, keyHint, 'disabled_or_expired')
        throw createLocalizedError(event, { statusCode: 401, code: 'UNAUTHORIZED' })
    }
    // 防御性分支：按哈希等值命中后恒为真，保留作存量数据损坏 / 编码异常兜底
    if (!verifyApiKeyHash(keyValue, key.key)) {
        maybeLogInvalidApiKey(event, keyHint, 'hash_mismatch')
        throw createLocalizedError(event, { statusCode: 401, code: 'UNAUTHORIZED' })
    }
    const scopes = readApiKeyScopes(key.metadata)
    if (options.requireScope && !scopes.includes(options.requireScope)) {
        await recordApiAccess(event, { keyId: key.id, organizationId: key.referenceId, statusCode: 403 })
        throw createLocalizedError(event, { statusCode: 403, code: 'FORBIDDEN' })
    }
    // 使用计数是尽力而为的审计信号：DB 抖动不得把有效 key 的只读请求变成 500
    try {
        await ds.getRepository(ApiKey).createQueryBuilder()
            .update(ApiKey)
            .set({ lastRequest: new Date(), requestCount: () => 'request_count + 1' })
            .where('id = :id', { id: key.id })
            .execute()
    } catch {
        // 计数失败不阻断鉴权
    }
    if (!consumeRateLimit(event, key.id, options.rateLimitClass ?? 'regular')) {
        await recordApiAccess(event, { keyId: key.id, organizationId: key.referenceId, statusCode: 429 })
        throw createLocalizedError(event, { statusCode: 429, code: 'RATE_LIMITED' })
    }
    await recordApiAccess(event, { keyId: key.id, organizationId: key.referenceId, statusCode: 200 })

    return {
        kind: 'api-key',
        organizationId: key.referenceId,
        userId: null,
        keyId: key.id,
        scopes,
    }
}
