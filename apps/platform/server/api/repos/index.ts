import type { H3Event } from 'h3'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { repositorySchema } from '#server/schemas/repository'
import { requireAuth, requireRole } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'

const toView = (r: Repository) => ({
    id: r.id,
    owner: r.owner,
    name: r.name,
    platform: r.platform,
    defaultBranch: r.defaultBranch,
    packageManager: r.packageManager,
    credentialId: r.credentialId,
    credentialName: r.credential?.name ?? null,
    actionWorkflowFile: r.actionWorkflowFile,
    executorKind: r.executorKind,
    note: r.note,
    lastScanAt: r.lastScanAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
})

/** GET /api/repos：仓库列表（含关联凭据名称） */
const listRepositories = async (event: H3Event) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)

    const repos = await repo.find({
        order: { createdAt: 'DESC' },
        relations: { credential: true },
    })
    return repos.map(toView)
}

/** POST /api/repos：创建仓库（Zod 校验 + owner/name 唯一性 + 组织归属填充） */
const createRepository = async (event: H3Event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const body = await readBody<Record<string, unknown>>(event)
    const parsed = repositorySchema.safeParse(body)

    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)

    const existing = await repo.findOne({
        where: {
            owner: parsed.data.owner,
            name: parsed.data.name,
            platform: parsed.data.platform,
        },
    })
    if (existing) {
        throw createError({
            statusCode: 409,
            statusMessage: 'Conflict',
            message: '该仓库已存在',
        })
    }

    // 创建路径经 resolveOrganizationId 填充归属（应用层强制非空，杜绝无归属数据）
    const organizationId = await resolveOrganizationId(ds)

    const entity = repo.create({
        organizationId,
        owner: parsed.data.owner,
        name: parsed.data.name,
        platform: parsed.data.platform,
        defaultBranch: parsed.data.defaultBranch,
        packageManager: parsed.data.packageManager,
        credentialId: parsed.data.credentialId ?? null,
        actionWorkflowFile: parsed.data.actionWorkflowFile ?? null,
        executorKind: parsed.data.executorKind,
        note: parsed.data.note ?? null,
    })
    const saved = await repo.save(entity)
    // 保存后重查以加载 relations（创建响应与 GET 语义一致，credentialName 不恒为 null）
    const withRelation = await repo.findOne({
        where: { id: saved.id },
        relations: { credential: true },
    })
    return withRelation ? toView(withRelation) : toView(saved)
}

export default defineEventHandler(async (event) => {
    if (event.method === 'POST') {
        return createRepository(event)
    }
    if (event.method === 'GET') {
        return listRepositories(event)
    }
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
})
