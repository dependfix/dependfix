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
import { toRunListView } from '#server/services/view/runs'

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
        items: runs.map(toRunListView),
        total,
        page,
        pageSize,
    }
})
