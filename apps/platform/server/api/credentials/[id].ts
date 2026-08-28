import type { H3Event } from 'h3'
import { Credential } from '#server/entities/credential'
import { ensureDatabaseInitialized } from '#server/database'
import { credentialUpdateSchema } from '#server/schemas/credential'
import { encryptToken, getEncryptionKey } from '#server/services/credential.service'
import { requireAuth, requireOrgResource, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'

/** GET /api/credentials/[id]：凭据详情（脱敏） */
const getCredential = async (event: H3Event, id: string) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createLocalizedError(event, { statusCode: 404, code: 'CREDENTIAL_NOT_FOUND' })
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
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'CREDENTIAL_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Credential)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createLocalizedError(event, { statusCode: 404, code: 'CREDENTIAL_NOT_FOUND' })
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
        throw createLocalizedError(event, { statusCode: 404, code: 'CREDENTIAL_NOT_FOUND' })
    }
    await requireOrgResource(event, found.organizationId)
    await repo.remove(found)
    return { id, deleted: true }
}

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'CREDENTIAL_ID_MISSING' })
    }
    switch (event.method) {
        case 'GET':
            return getCredential(event, id)
        case 'PUT':
            return updateCredential(event, id)
        case 'DELETE':
            return deleteCredential(event, id)
        default:
            throw createLocalizedError(event, { statusCode: 405, code: 'METHOD_NOT_ALLOWED' })
    }
})
