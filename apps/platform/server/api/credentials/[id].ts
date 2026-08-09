import type { H3Event } from 'h3'
import { Credential } from '#server/entities/credential'
import { ensureDatabaseInitialized } from '#server/database'
import { credentialUpdateSchema } from '#server/schemas/credential'
import { encryptToken, getEncryptionKey } from '#server/services/credential.service'
import { requireAuth, requireOrgResource, requireRole } from '#server/utils/guard'

/** GET /api/credentials/[id]：凭据详情（脱敏） */
const getCredential = async (event: H3Event, id: string) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '凭据不存在' })
    }
    return {
        id: found.id,
        name: found.name,
        type: found.type,
        note: found.note,
        lastUsedAt: found.lastUsedAt,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
        hasToken: Boolean(found.encryptedToken),
    }
}

/** PUT /api/credentials/[id]：更新凭据（token 为空表示不修改；写操作限 admin/org_admin） */
const updateCredential = async (event: H3Event, id: string) => {
    await requireRole(event, ['admin', 'org_admin'])
    const body = await readBody<Record<string, unknown>>(event)
    const parsed = credentialUpdateSchema.safeParse(body)

    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '凭据不存在' })
    }
    await requireOrgResource(event, found.organizationId)

    if (parsed.data.name !== undefined) {
        found.name = parsed.data.name
    }
    if (parsed.data.type !== undefined) {
        found.type = parsed.data.type
    }
    if (parsed.data.token !== undefined && parsed.data.token !== '') {
        found.encryptedToken = encryptToken(parsed.data.token, getEncryptionKey())
    }
    if (parsed.data.note !== undefined) {
        found.note = parsed.data.note
    }
    const saved = await repo.save(found)
    return { id: saved.id, updated: true }
}

/** DELETE /api/credentials/[id]：删除凭据（写操作限 admin/org_admin） */
const deleteCredential = async (event: H3Event, id: string) => {
    await requireRole(event, ['admin', 'org_admin'])
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '凭据不存在' })
    }
    await requireOrgResource(event, found.organizationId)
    await repo.remove(found)
    return { id, deleted: true }
}

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少凭据 id' })
    }
    switch (event.method) {
        case 'GET':
            return getCredential(event, id)
        case 'PUT':
            return updateCredential(event, id)
        case 'DELETE':
            return deleteCredential(event, id)
        default:
            throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
    }
})
