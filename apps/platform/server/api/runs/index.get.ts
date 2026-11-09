import { z } from 'zod'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import {
    applyRunsOrder,
    applyRunsWhere,
    isValidRunsRange,
    runsFilterShape,
    runsPaginationShape,
    runsSortShape,
} from '#server/utils/runs-query'
import { parseRunResource } from '#server/utils/run-resource'

/**
 * 查询参数 schema（todo.md §M14.2 UX-R1 + §M16.1）：
 * - repositoryId / status / failureStage / failureKind / from / to：共用筛选（`runsFilterShape`，列表与日志导出同口径）
 * - sortBy / sortOrder：共用排序（`runsSortShape`；缺省 createdAt DESC，startedAt 排序 NULL 行固定末尾）
 * - ids：可选，逗号分隔 run id 列表（alerts.vue §openRunSidebar 复用，todo.md §T1306）
 *   —— 修复 silent bug：原 server 不识别 `ids`，alerts sidebar 实际拿到全量 run 而非该告警 affected runs
 * - page / pageSize：共用分页片段（`runsPaginationShape`，默认 1 / 100，`pageSize` 超上限静默钳制；
 *   与日志导出的窗口取数同源——两侧各改一份会让「导出当前页」与屏幕所见错位）
 *
 * organizationId 不暴露为 query 参数：服务端隐式从默认组织注入（单组织模型），
 * 与 batch-runs/schedules/repos 列表 handler 风格一致（todo.md §M16.1 组织隔离）。
 */
const querySchema = z.object({
    ...runsFilterShape,
    ...runsPaginationShape,
    ...runsSortShape,
    ids: z.string().optional()
        .transform((v) => (v && v.length > 0 ? v : undefined)),
}).refine(isValidRunsRange, {
    message: 'from must be less than or equal to to',
    path: ['to'],
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
    // 运行结果可信度：exitCode 为进程级事实；环境性失败计数与 summary 同源落库。
    // 旧数据 exitCode 为 null；B 模式执行器不传递 exitCode（触发受理哨兵），但环境性失败计数仍可落库。
    // 消费方须按 null 降级，不得把 null 推断为 0 成功。
    exitCode: r.exitCode,
    environmentalFailureCount: r.environmentalFailureCount,
    // 资源 / OOM 归因：列与 resourceJson 同源；null = 不可采集（原因在 resource.degradedReason）
    memoryMaxBytes: r.memoryMaxBytes,
    peakRssBytes: r.peakRssBytes,
    oomKilled: r.oomKilled,
    resource: parseRunResource(r.resourceJson),
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
    const { repositoryId, ids, status, failureStage, failureKind, from, to, page, pageSize, sortBy, sortOrder } = parsed.data

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const runRepo = ds.getRepository(ScanRun)

    const qb = runRepo.createQueryBuilder('run')
        .leftJoinAndSelect('run.repository', 'repository')
    applyRunsWhere(qb, { repositoryId, status, failureStage, failureKind, from, to }, organizationId)
    if (ids) {
        const idList = ids.split(',').map((s) => s.trim()).filter(Boolean)
        if (idList.length > 0) {
            qb.andWhere('run.id IN (:...ids)', { ids: idList })
        }
    }
    // repositoryId + ids 同传：AND 合并 → 既属于该仓库又是 ids 子集（AND 而非 OR）
    // repository relation 加入组织隔离：跨组织 run 永远不可见（todo.md §M16.1 组织隔离）

    applyRunsOrder(qb, { sortBy, sortOrder })
    const [runs, total] = await qb
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount()

    return {
        items: runs.map(toView),
        total,
        page,
        pageSize,
    }
})
