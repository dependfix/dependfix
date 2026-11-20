import { z } from 'zod'
import { LRUCache } from 'lru-cache'
import { ensureDatabaseInitialized } from '#server/database'
import { requireRole } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'
import { createLocalizedError } from '#server/utils/localized-error'
import { ApiKey } from '#server/entities/api-key'
import { API_KEY_PREFIX, API_KEY_SCOPE_READ, generateApiKey, hashApiKey } from '#server/utils/api-key'
import { recordApiAccess } from '#server/utils/api-key-guard'

/**
 * POST /api/v1/keys：创建当前组织的只读 API key（会话 + admin / org_admin）。
 *
 * - 每组织最多 10 把，超出 409
 * - 90 天 TTL 由服务端固定，不接受客户端自定义
 * - 返回一次性明文 `key`；后续列表只出前缀
 * - 创建接口自身限流：10 次 / 5 分钟（按组织）
 */
const bodySchema = z.object({
    name: z.string().trim().min(1).max(32),
})

const API_KEY_LIMIT = 10
const API_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000
const createLimit = new LRUCache<string, { count: number, resetAt: number }>({ max: 1000 })

/** 测试辅助：清空创建限流计数 */
export const resetApiKeyCreateLimit = (): void => createLimit.clear()

export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const repo = ds.getRepository(ApiKey)

    const now = Date.now()
    const windowMs = 5 * 60 * 1000
    const maxCreates = Number.parseInt(process.env.API_KEY_CREATE_RATE_LIMIT_MAX ?? '10', 10) || 10
    const current = createLimit.get(organizationId)
    if (current && now < current.resetAt && current.count >= maxCreates) {
        setHeader(event, 'Retry-After', Math.max(1, Math.ceil((current.resetAt - now) / 1000)))
        await recordApiAccess(event, { keyId: null, organizationId, statusCode: 429 })
        throw createLocalizedError(event, { statusCode: 429, code: 'RATE_LIMITED' })
    }
    if (!current || now >= current.resetAt) {
        createLimit.set(organizationId, { count: 1, resetAt: now + windowMs })
    } else {
        current.count += 1
    }

    const parsed = bodySchema.safeParse(await readBody(event))
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'API_V1_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    if (await repo.count({ where: { referenceId: organizationId } }) >= API_KEY_LIMIT) {
        throw createLocalizedError(event, { statusCode: 409, code: 'API_KEY_LIMIT_REACHED' })
    }

    const plaintext = generateApiKey()
    const saved = await repo.save(repo.create({
        name: parsed.data.name,
        start: plaintext.slice(0, 8),
        referenceId: organizationId,
        prefix: API_KEY_PREFIX,
        key: hashApiKey(plaintext),
        enabled: true,
        requestCount: 0,
        expiresAt: new Date(now + API_KEY_TTL_MS),
        metadata: JSON.stringify({ scopes: [API_KEY_SCOPE_READ] }),
    }))

    await recordApiAccess(event, { keyId: saved.id, organizationId, statusCode: 200 })

    return {
        id: saved.id,
        name: saved.name,
        prefix: saved.prefix,
        start: saved.start,
        createdAt: saved.createdAt,
        expiresAt: saved.expiresAt,
        key: plaintext,
    }
})
