import type { H3Event } from 'h3'
import { parseSandboxLimits, parseTags, Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { repositoryUpdateSchema } from '#server/schemas/repository'
import { requireAuth, requireOrgResource, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'

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
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
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
        tags: parseTags(found.tags),
        sandboxLimits: parseSandboxLimits(found.sandboxLimits),
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
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'REPO_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)

    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
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
            throw createLocalizedError(event, { statusCode: 409, code: 'REPO_DUPLICATE' })
        }
    }

    // tags 数组 → JSON 字符串列（空数组存 null，实体语义见 Repository.tags；
    // 更新语义与 credentialId/note 一致：undefined=不修改 / null 或 [] = 清空）
    let tagsValue: string | null = found.tags
    if (parsed.data.tags !== undefined) {
        tagsValue = parsed.data.tags && parsed.data.tags.length > 0 ? JSON.stringify(parsed.data.tags) : null
    }

    // sandboxLimits 对象 → JSON 字符串列（与 tags 同模式）
    // 空对象 `{}` 归一为 null（与 createRepository 一致；语义对齐 parseSandboxLimits 字段裁剪）
    let sandboxLimitsValue: string | null = found.sandboxLimits
    if (parsed.data.sandboxLimits !== undefined) {
        sandboxLimitsValue = parsed.data.sandboxLimits && Object.keys(parsed.data.sandboxLimits).length > 0
            ? JSON.stringify(parsed.data.sandboxLimits)
            : null
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
        tags: tagsValue,
        sandboxLimits: sandboxLimitsValue,
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
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
    }
    await requireOrgResource(event, found.organizationId)
    await repo.remove(found)
    return { id, deleted: true }
}

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'REPO_ID_MISSING' })
    }
    switch (event.method) {
        case 'GET':
            return getRepository(event, id)
        case 'PUT':
            return updateRepository(event, id)
        case 'DELETE':
            return deleteRepository(event, id)
        default:
            throw createLocalizedError(event, { statusCode: 405, code: 'METHOD_NOT_ALLOWED' })
    }
})
