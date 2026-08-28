import type { H3Event } from 'h3'
import { Credential } from '#server/entities/credential'
import { ensureDatabaseInitialized } from '#server/database'
import { credentialSchema } from '#server/schemas/credential'
import { encryptToken, getEncryptionKey } from '#server/services/credential.service'
import { requireAuth, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'

/** 脱敏视图：永不返回 encryptedToken / 明文 token */
const toView = (c: Credential) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    note: c.note,
    lastUsedAt: c.lastUsedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    /** token 存在性标记（UI 显示"已配置"，不暴露密文） */
    hasToken: Boolean(c.encryptedToken),
})

/** GET /api/credentials：凭据列表（脱敏） */
const listCredentials = async (event: H3Event) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const creds = await repo.find({ order: { createdAt: 'DESC' } })
    return creds.map(toView)
}

/** POST /api/credentials：创建凭据（token 加密存储，写操作限 admin/org_admin） */
const createCredential = async (event: H3Event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const body = await readBody<Record<string, unknown>>(event)
    const parsed = credentialSchema.safeParse(body)

    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'CREDENTIAL_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const encrypted = encryptToken(parsed.data.token, getEncryptionKey())

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    // 创建路径经 resolveOrganizationId 填充归属（应用层强制非空，杜绝无归属数据）
    const organizationId = await resolveOrganizationId(ds)

    const entity = repo.create({
        organizationId,
        name: parsed.data.name,
        type: parsed.data.type,
        encryptedToken: encrypted,
        note: parsed.data.note ?? null,
    })
    const saved = await repo.save(entity)
    return toView(saved)
}

export default defineEventHandler(async (event) => {
    if (event.method === 'POST') {
        return createCredential(event)
    }
    if (event.method === 'GET') {
        return listCredentials(event)
    }
    throw createLocalizedError(event, { statusCode: 405, code: 'METHOD_NOT_ALLOWED' })
})
