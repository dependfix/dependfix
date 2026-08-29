import type { H3Event } from 'h3'
import { Credential } from '#server/entities/credential'
import { ensureDatabaseInitialized } from '#server/database'
import { credentialSchema } from '#server/schemas/credential'
import { encryptToken, getEncryptionKey } from '#server/services/credential.service'
import { requireAuth, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'

/** 脱敏视图：永不返回 encryptedToken / encryptedPrivateKey / 明文 token */
const toView = (c: Credential) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    note: c.note,
    lastUsedAt: c.lastUsedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    /** token 存在性标记（UI 显示"已配置"，不暴露密文）
     * - PAT 路径：检查 encryptedToken
     * - GitHub App 路径：检查 encryptedPrivateKey
     */
    hasToken: c.type === 'github-app'
        ? Boolean(c.encryptedPrivateKey)
        : Boolean(c.encryptedToken),
    /** GitHub App 路径额外字段（明文公开信息） */
    ...(c.type === 'github-app' && {
        appId: c.appId,
        installationId: c.installationId,
        botLogin: c.botLogin,
    }),
})

/** GET /api/credentials：凭据列表（脱敏） */
const listCredentials = async (event: H3Event) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const creds = await repo.find({ order: { createdAt: 'DESC' } })
    return creds.map(toView)
}

/** POST /api/credentials：创建凭据（凭据密文加密存储，写操作限 admin/org_admin） */
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

    const encryptionKey = getEncryptionKey()
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    // 创建路径经 resolveOrganizationId 填充归属（应用层强制非空，杜绝无归属数据）
    const organizationId = await resolveOrganizationId(ds)

    // discriminated union：type 决定必填字段
    const baseFields = {
        organizationId,
        name: parsed.data.name,
        type: parsed.data.type,
        note: parsed.data.note ?? null,
    }

    let entity: Credential
    if (parsed.data.type === 'github-app') {
        // GitHub App 路径：加密 PEM 私钥；其他字段明文
        const encryptedPrivateKey = encryptToken(parsed.data.encryptedPrivateKey, encryptionKey)
        entity = repo.create({
            ...baseFields,
            encryptedToken: '',
            appId: parsed.data.appId,
            encryptedPrivateKey,
            installationId: parsed.data.installationId,
            botLogin: parsed.data.botLogin ?? null,
        })
    } else {
        // PAT 路径：加密 token；其他 GitHub App 字段为 null
        const encryptedToken = encryptToken(parsed.data.token, encryptionKey)
        entity = repo.create({
            ...baseFields,
            encryptedToken,
            appId: null,
            encryptedPrivateKey: null,
            installationId: null,
            botLogin: null,
        })
    }

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
