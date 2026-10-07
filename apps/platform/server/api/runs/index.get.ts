import { z } from 'zod'
import { In, type FindOptionsWhere } from 'typeorm'
import { ScanRun, SCAN_RUN_STATUSES, type ScanRunStatus } from '#server/entities/scan-run'
import { RUN_FAILURE_KINDS, RUN_FAILURE_STAGES, type RunFailureKind, type RunFailureStage } from '#server/services/run-failure-classify'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'

const PAGE_SIZE_DEFAULT = 100
const PAGE_SIZE_MAX = 200

/**
 * 逗号分隔多值 query（`status=failed,dispatched`）→ 去空后的数组。
 * 空串 / 仅分隔符 / 缺省 → `undefined`（不应用该维度过滤）。
 */
const parseMultiValue = (raw: string | undefined): string[] | undefined => {
    if (!raw || raw.length === 0) {
        return undefined
    }
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return list.length > 0 ? list : undefined
}

/** 多值 query 字段：逗号分隔 + 取值必须落在白名单内（非法值 400，不静默丢弃）；原始串限长防异常输入 */
const multiValueEnum = (allowed: readonly string[], field: string) =>
    z.string().max(500).optional()
        .transform((v) => parseMultiValue(v))
        .refine((v) => v === undefined || v.every((item) => allowed.includes(item)), {
            message: `invalid ${field} value`,
        })

/**
 * 查询参数 schema（todo.md §M14.2 UX-R1 + §M16.1）：
 * - repositoryId：可选，按仓库过滤（既有，`repo-history-dialog.vue` 主调用方）
 * - ids：可选，逗号分隔 run id 列表（alerts.vue §openRunSidebar 复用，todo.md §T1306）
 *   —— 修复 silent bug：原 server 不识别 `ids`，alerts sidebar 实际拿到全量 run 而非该告警 affected runs
 * - status：可选，逗号分隔运行状态（多值，白名单校验）
 * - failureStage / failureKind：可选，逗号分隔失败分类维度（运行失败筛选）
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
    status: multiValueEnum(SCAN_RUN_STATUSES, 'status'),
    failureStage: multiValueEnum(RUN_FAILURE_STAGES, 'failureStage'),
    failureKind: multiValueEnum(RUN_FAILURE_KINDS, 'failureKind'),
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
    // 失败分类（非失败终态为 null；落库口径见 run-failure-classify.ts）
    failureCode: r.failureCode,
    failureStage: r.failureStage,
    failureKind: r.failureKind,
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
    const { repositoryId, ids, status, failureStage, failureKind, page, pageSize } = parsed.data

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
    // 状态 / 失败阶段 / 处置建议多值过滤（白名单校验已在 querySchema 完成）
    if (status) {
        where.status = In(status as ScanRunStatus[])
    }
    if (failureStage) {
        where.failureStage = In(failureStage as RunFailureStage[])
    }
    if (failureKind) {
        where.failureKind = In(failureKind as RunFailureKind[])
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
