import { z } from 'zod'
import { In, type FindOptionsWhere } from 'typeorm'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'

const PAGE_SIZE_DEFAULT = 100
const PAGE_SIZE_MAX = 200

/**
 * 查询参数 schema（todo.md §M14.2 UX-R1 + §M16.1）：
 * - repositoryId：可选，按仓库过滤（既有，`repo-history-dialog.vue` 主调用方）
 * - ids：可选，逗号分隔 run id 列表（alerts.vue §openRunSidebar 复用，todo.md §T1306）
 *   —— 修复 silent bug：原 server 不识别 `ids`，alerts sidebar 实际拿到全量 run 而非该告警 affected runs
 * - page：默认 1，最小 1
 * - pageSize：默认 100，上限 200（超出自动钳制，不抛错；防止单次拉取过大影响性能）
 *
 * organizationId 不暴露为 query 参数：服务端隐式从默认组织注入（单组织模型），
 * 与 batch-runs/schedules/repos 列表 handler 风格一致（todo.md §M16.1 组织隔离）。
 */
const querySchema = z.object({
    repositoryId: z.string().min(1).optional(),
    ids: z.string().optional()
        .transform((v) => (v && v.length > 0 ? v : undefined)),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).default(PAGE_SIZE_DEFAULT)
        .transform((v) => Math.min(v, PAGE_SIZE_MAX)),
})

const toView = (r: ScanRun) => ({
    id: r.id,
    repositoryId: r.repositoryId,
    owner: r.repository?.owner ?? null,
    name: r.repository?.name ?? null,
    mode: r.mode,
    severityThreshold: r.severityThreshold,
    executorKind: r.executorKind,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    runUrl: r.runUrl,
    summary: r.summaryJson ? JSON.parse(r.summaryJson) as Record<string, unknown> : null,
    error: r.errorJson ? JSON.parse(r.errorJson) as { code: string, message: string } | null : null,
})

/**
 * GET /api/runs：扫描历史列表（按仓库过滤 + 分页）。
 *
 * 返回 `{items, total, page, pageSize}` —— 与 alerts handler 既有风格一致（todo.md §M14.2 决策）。
 * 向后兼容：pageSize 缺省 = 100（既有 take 行为）；items 字段既有结构不变。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const parsed = querySchema.safeParse(query)
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'RUNS_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }
    const { repositoryId, ids, page, pageSize } = parsed.data

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const runRepo = ds.getRepository(ScanRun)

    const where: FindOptionsWhere<ScanRun> = { repository: { organizationId } }
    if (repositoryId) {
        where.repositoryId = repositoryId
    }
    if (ids) {
        const idList = ids.split(',').map((s) => s.trim()).filter(Boolean)
        if (idList.length > 0) {
            where.id = In(idList)
        }
    }
    // repositoryId + ids 同传：TypeORM AND 合并 → 既属于该仓库又是 ids 子集（AND 而非 OR）
    // repository relation 加入组织隔离：跨组织 run 永远不可见（todo.md §M16.1 组织隔离）

    const [runs, total] = await runRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        relations: { repository: true },
    })

    return {
        items: runs.map(toView),
        total,
        page,
        pageSize,
    }
})
