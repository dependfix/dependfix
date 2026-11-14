import { formatDurationMs } from '@dependfix/core'
import type { H3Event } from 'h3'
import { parseSandboxLimits, parseTags, parseVerifyCommands, Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { repositorySchema } from '#server/schemas/repository'
import { requireAuth, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import { normalizePRCheckFocus, parsePRCheckFocus } from '#server/utils/pr-check-focus'
import { recordExecutionLimitsAudit, recordMajorUpgradePolicyAudit, recordVerifyCommandsAudit } from '#server/services/repository-audit'
import { resolveExecutionCeilingMs } from '#server/utils/execution-limits'
import { resolveAllowMajorUpgradeDefault } from '#server/utils/allow-major-upgrade'
import { normalizeDockerImage } from '#server/utils/docker-image'

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
    sandboxImage: r.sandboxImage,
    verifyCommands: parseVerifyCommands(r.verifyCommands),
    prCheckFocus: parsePRCheckFocus(r.prCheckFocus),
    executionTimeoutMs: r.executionTimeoutMs,
    verifyCommandTimeoutMs: r.verifyCommandTimeoutMs,
    installTimeoutMs: r.installTimeoutMs,
    cloneTimeoutMs: r.cloneTimeoutMs,
    allowMajorUpgrade: r.allowMajorUpgrade,
    aiEnabled: r.aiEnabled,
    aiTrigger: r.aiTrigger,
    lastScanAt: r.lastScanAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
})

/**
 * GET /api/repos：仓库列表（含关联凭据名称）。
 *
 * 注意：视觉回归的仓库集合门禁（`tests/visual/helpers/visual-db.ts`）依赖本端点返回**全量**仓库；
 * 若未来引入分页 / 默认过滤，需同步调整门禁的集合真值来源（否则窗口外的多余仓库不可见、门禁假绿）。
 */
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

    // verifyCommands 数组 → JSON 字符串列（与 tags 同模式；空数组存 null → 走引擎默认验证链）
    const verifyCommandsValue: string | null = parsed.data.verifyCommands && parsed.data.verifyCommands.length > 0
        ? JSON.stringify(parsed.data.verifyCommands)
        : null

    // prCheckFocus 对象 → JSON 字符串列（三维全空归一为 null = 未配置；规范化负责 trim / 去重 / 小写）
    const prCheckFocusValue = normalizePRCheckFocus(parsed.data.prCheckFocus)

    // 新建仓库默认值：平台部署可通过 ALLOW_MAJOR_UPGRADE_DEFAULT / NUXT_PUBLIC_ALLOW_MAJOR_UPGRADE_DEFAULT
    // 统一开启；请求体显式值优先（表单编辑既有仓库时始终显式提交当前开关状态）
    const allowMajorUpgradeDefault = resolveAllowMajorUpgradeDefault(event)

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
        sandboxImage: normalizeDockerImage(parsed.data.sandboxImage),
        verifyCommands: verifyCommandsValue,
        prCheckFocus: prCheckFocusValue ? JSON.stringify(prCheckFocusValue) : null,
        executionTimeoutMs: parsed.data.executionTimeoutMs ?? null,
        verifyCommandTimeoutMs: parsed.data.verifyCommandTimeoutMs ?? null,
        installTimeoutMs: parsed.data.installTimeoutMs ?? null,
        cloneTimeoutMs: parsed.data.cloneTimeoutMs ?? null,
        allowMajorUpgrade: parsed.data.allowMajorUpgrade ?? allowMajorUpgradeDefault,
    })
    const saved = await repo.save(entity)

    // 审计留痕（见 docs/standards/platform.md §3.8）：自定义验证命令等价于远程命令执行面，创建时若已配置则登记
    if (verifyCommandsValue) {
        await recordVerifyCommandsAudit(ds, {
            repositoryId: saved.id,
            owner: saved.owner,
            name: saved.name,
            previous: [],
            next: parseVerifyCommands(verifyCommandsValue),
        })
    }

    // 保存后重查以加载 relations（创建响应与 GET 语义一致，credentialName 不恒为 null）
    const withRelation = await repo.findOne({
        where: { id: saved.id },
        relations: { credential: true },
    })
    // 跨大版本授权审计：创建时开启才登记（默认关闭不产生噪声）
    if (saved.allowMajorUpgrade) {
        await recordMajorUpgradePolicyAudit(ds, {
            repositoryId: saved.id,
            owner: saved.owner,
            name: saved.name,
            previous: false,
            next: true,
        })
    }

    // 执行预算配置审计：创建时非全空才登记（避免默认继承产生噪声）
    const createdLimits = {
        executionTimeoutMs: saved.executionTimeoutMs,
        verifyCommandTimeoutMs: saved.verifyCommandTimeoutMs,
        installTimeoutMs: saved.installTimeoutMs,
        cloneTimeoutMs: saved.cloneTimeoutMs,
    }
    if (Object.values(createdLimits).some((value) => value !== null)) {
        await recordExecutionLimitsAudit(ds, {
            repositoryId: saved.id,
            owner: saved.owner,
            name: saved.name,
            previous: { executionTimeoutMs: null, verifyCommandTimeoutMs: null, installTimeoutMs: null, cloneTimeoutMs: null },
            next: createdLimits,
        })
    }

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
