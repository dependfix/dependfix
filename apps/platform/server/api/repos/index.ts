import type { H3Event } from 'h3'
import { parseSandboxLimits, parseTags, Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { repositorySchema } from '#server/schemas/repository'
import { requireAuth, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
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
    tags: parseTags(r.tags),
    sandboxLimits: parseSandboxLimits(r.sandboxLimits),
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
        // 顶层 message 用 code 翻译的静态文本，data.issues 保留 zod 原 issue 数组供客户端细化展示
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'REPO_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
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
        throw createLocalizedError(event, {
            statusCode: 409,
            code: 'REPO_DUPLICATE',
        })
    }

    // 创建路径经 resolveOrganizationId 填充归属（应用层强制非空，杜绝无归属数据）
    const organizationId = await resolveOrganizationId(ds)

    // tags 数组 → JSON 字符串列（空数组存 null，实体语义见 Repository.tags）
    let tags: string | null = null
    if (parsed.data.tags !== undefined && parsed.data.tags !== null) {
        tags = parsed.data.tags.length > 0 ? JSON.stringify(parsed.data.tags) : null
    }

    // sandboxLimits 对象 → JSON 字符串列（与 tags 同模式；null → 走平台 SANDBOX_DEFAULTS）
    // 空对象 `{}` 归一为 null：避免 POST `{}` → GET 拿到 undefined 的语义不对称（与 parseSandboxLimits 的字段裁剪对齐）
    const sandboxLimits: string | null = parsed.data.sandboxLimits && Object.keys(parsed.data.sandboxLimits).length > 0
        ? JSON.stringify(parsed.data.sandboxLimits)
        : null

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
        tags,
        sandboxLimits,
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
    throw createLocalizedError(event, { statusCode: 405, code: 'METHOD_NOT_ALLOWED' })
})
