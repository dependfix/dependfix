import { formatDurationMs } from '@dependfix/core'
import type { H3Event } from 'h3'
import { normalizeDockerImage } from '#server/utils/docker-image'
import { parseSandboxLimits, parseTags, parseVerifyCommands, Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { repositoryUpdateSchema } from '#server/schemas/repository'
import { requireAuth, requireOrgResource, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { normalizePRCheckFocus, parsePRCheckFocus } from '#server/utils/pr-check-focus'
import { recordExecutionLimitsAudit, recordMajorUpgradePolicyAudit, recordVerifyCommandsAudit } from '#server/services/repository-audit'
import { resolveExecutionCeilingMs } from '#server/utils/execution-limits'

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
        sandboxImage: found.sandboxImage,
        verifyCommands: parseVerifyCommands(found.verifyCommands),
        prCheckFocus: parsePRCheckFocus(found.prCheckFocus),
        executionTimeoutMs: found.executionTimeoutMs,
        verifyCommandTimeoutMs: found.verifyCommandTimeoutMs,
        installTimeoutMs: found.installTimeoutMs,
        cloneTimeoutMs: found.cloneTimeoutMs,
        allowMajorUpgrade: found.allowMajorUpgrade,
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

    // 封顶校验（AC2）：仓库值不得超过平台封顶，超限 400 且不落库
    const ceilingMs = resolveExecutionCeilingMs(process.env)
    const requestedExecutionTimeoutMs = parsed.data.executionTimeoutMs
    if (requestedExecutionTimeoutMs !== null && requestedExecutionTimeoutMs !== undefined
        && requestedExecutionTimeoutMs > ceilingMs) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'REPO_VALIDATION_FAILED',
            data: {
                issues: [{
                    path: ['executionTimeoutMs'],
                    message: `执行上限不能超过平台封顶 ${formatDurationMs(ceilingMs)}`,
                }],
            },
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

    // 仓库级沙箱镜像：undefined=不修改 / null 或空串=清空（回退平台默认）
    const sandboxImageValue: string | null = parsed.data.sandboxImage !== undefined
        ? normalizeDockerImage(parsed.data.sandboxImage)
        : found.sandboxImage

    // verifyCommands 数组 → JSON 字符串列（与 tags 同模式；更新语义：undefined=不修改 / null 或 [] = 清空 → 走默认链）
    const previousCommands = parseVerifyCommands(found.verifyCommands)
    let verifyCommandsValue: string | null = found.verifyCommands
    if (parsed.data.verifyCommands !== undefined) {
        verifyCommandsValue = parsed.data.verifyCommands && parsed.data.verifyCommands.length > 0
            ? JSON.stringify(parsed.data.verifyCommands)
            : null
    }

    // prCheckFocus 对象 → JSON 字符串列（更新语义：undefined=不修改 / null 或三维全空=清空 → 未配置）
    let prCheckFocusValue: string | null = found.prCheckFocus
    if (parsed.data.prCheckFocus !== undefined) {
        const normalized = normalizePRCheckFocus(parsed.data.prCheckFocus)
        prCheckFocusValue = normalized ? JSON.stringify(normalized) : null
    }

    // 变更前的跨大版本授权（审计用；Object.assign 会原地修改 found）
    const previousAllowMajorUpgrade = found.allowMajorUpgrade

    // 变更前的执行预算快照（审计用；Object.assign 会原地修改 found）
    const previousLimits = {
        executionTimeoutMs: found.executionTimeoutMs,
        verifyCommandTimeoutMs: found.verifyCommandTimeoutMs,
        installTimeoutMs: found.installTimeoutMs,
        cloneTimeoutMs: found.cloneTimeoutMs,
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
        sandboxImage: sandboxImageValue,
        verifyCommands: verifyCommandsValue,
        prCheckFocus: prCheckFocusValue,
        executionTimeoutMs: parsed.data.executionTimeoutMs !== undefined ? parsed.data.executionTimeoutMs : found.executionTimeoutMs,
        verifyCommandTimeoutMs: parsed.data.verifyCommandTimeoutMs !== undefined ? parsed.data.verifyCommandTimeoutMs : found.verifyCommandTimeoutMs,
        installTimeoutMs: parsed.data.installTimeoutMs !== undefined ? parsed.data.installTimeoutMs : found.installTimeoutMs,
        cloneTimeoutMs: parsed.data.cloneTimeoutMs !== undefined ? parsed.data.cloneTimeoutMs : found.cloneTimeoutMs,
        allowMajorUpgrade: parsed.data.allowMajorUpgrade !== undefined ? parsed.data.allowMajorUpgrade : found.allowMajorUpgrade,
    })
    const saved = await repo.save(found)

    // 审计留痕（见 docs/standards/platform.md §3.8）：仅在实际发生变化时登记，避免无关字段更新产生噪声
    const nextCommands = parseVerifyCommands(verifyCommandsValue)
    if (JSON.stringify(previousCommands) !== JSON.stringify(nextCommands)) {
        await recordVerifyCommandsAudit(ds, {
            repositoryId: saved.id,
            owner: saved.owner,
            name: saved.name,
            previous: previousCommands,
            next: nextCommands,
        })
    }

    // 跨大版本授权审计：仅在实际变化时登记
    if (previousAllowMajorUpgrade !== saved.allowMajorUpgrade) {
        await recordMajorUpgradePolicyAudit(ds, {
            repositoryId: saved.id,
            owner: saved.owner,
            name: saved.name,
            previous: previousAllowMajorUpgrade,
            next: saved.allowMajorUpgrade,
        })
    }

    // 执行预算配置审计：仅在实际变化时登记
    const nextLimits = {
        executionTimeoutMs: saved.executionTimeoutMs,
        verifyCommandTimeoutMs: saved.verifyCommandTimeoutMs,
        installTimeoutMs: saved.installTimeoutMs,
        cloneTimeoutMs: saved.cloneTimeoutMs,
    }
    if (JSON.stringify(previousLimits) !== JSON.stringify(nextLimits)) {
        await recordExecutionLimitsAudit(ds, {
            repositoryId: saved.id,
            owner: saved.owner,
            name: saved.name,
            previous: previousLimits,
            next: nextLimits,
        })
    }

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
