import type { H3Event } from 'h3'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { repositoryUpdateSchema } from '#server/schemas/repository'
import { requireAuth, requireOrgResource, requireRole } from '#server/utils/guard'

/** GET /api/repos/[id]：仓库详情 */
const getRepository = async (event: H3Event, id: string) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)

    const found = await repo.findOne({
        where: { id },
        relations: { credential: true },
    })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '仓库不存在' })
    }
    return {
        id: found.id,
        owner: found.owner,
        name: found.name,
        platform: found.platform,
        defaultBranch: found.defaultBranch,
        packageManager: found.packageManager,
        credentialId: found.credentialId,
        credentialName: found.credential?.name ?? null,
        actionWorkflowFile: found.actionWorkflowFile,
        executorKind: found.executorKind,
        note: found.note,
        lastScanAt: found.lastScanAt,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
    }
}

/** PUT /api/repos/[id]：更新仓库（部分字段，写操作限 admin/org_admin + 组织归属校验） */
const updateRepository = async (event: H3Event, id: string) => {
    await requireRole(event, ['admin', 'org_admin'])
    const body = await readBody<Record<string, unknown>>(event)
    const parsed = repositoryUpdateSchema.safeParse(body)

    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '仓库不存在' })
    }
    await requireOrgResource(event, found.organizationId)

    // 唯一性冲突预检（owner/name 变更时）
    if (parsed.data.owner !== undefined || parsed.data.name !== undefined) {
        const nextOwner = parsed.data.owner ?? found.owner
        const nextName = parsed.data.name ?? found.name
        const conflict = await repo.findOne({
            where: { owner: nextOwner, name: nextName, platform: parsed.data.platform ?? found.platform },
        })
        if (conflict && conflict.id !== id) {
            throw createError({ statusCode: 409, statusMessage: 'Conflict', message: '该仓库已存在' })
        }
    }

    Object.assign(found, {
        owner: parsed.data.owner ?? found.owner,
        name: parsed.data.name ?? found.name,
        platform: parsed.data.platform ?? found.platform,
        defaultBranch: parsed.data.defaultBranch ?? found.defaultBranch,
        packageManager: parsed.data.packageManager ?? found.packageManager,
        credentialId: parsed.data.credentialId !== undefined ? parsed.data.credentialId : found.credentialId,
        actionWorkflowFile: parsed.data.actionWorkflowFile !== undefined ? parsed.data.actionWorkflowFile : found.actionWorkflowFile,
        executorKind: parsed.data.executorKind ?? found.executorKind,
        note: parsed.data.note !== undefined ? parsed.data.note : found.note,
    })
    const saved = await repo.save(found)
    return { id: saved.id, updated: true }
}

/** DELETE /api/repos/[id]：删除仓库（写操作限 admin/org_admin + 组织归属校验） */
const deleteRepository = async (event: H3Event, id: string) => {
    await requireRole(event, ['admin', 'org_admin'])
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '仓库不存在' })
    }
    await requireOrgResource(event, found.organizationId)
    await repo.remove(found)
    return { id, deleted: true }
}

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少仓库 id' })
    }
    switch (event.method) {
        case 'GET':
            return getRepository(event, id)
        case 'PUT':
            return updateRepository(event, id)
        case 'DELETE':
            return deleteRepository(event, id)
        default:
            throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
    }
})
