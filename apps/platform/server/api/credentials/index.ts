import type { H3Event } from 'h3'
import { Credential } from '../../entities/credential'
import { ensureDatabaseInitialized } from '../../database'
import { credentialSchema } from '../../schemas/credential'
import { encryptToken, getEncryptionKey } from '../../services/credential.service'
import { requireAuth } from '../../utils/guard'

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

/** POST /api/credentials：创建凭据（token 加密存储） */
const createCredential = async (event: H3Event) => {
    await requireAuth(event)
    const body = await readBody<Record<string, unknown>>(event)
    const parsed = credentialSchema.safeParse(body)

    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const encrypted = encryptToken(parsed.data.token, getEncryptionKey())

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const entity = repo.create({
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
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
})
