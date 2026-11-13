import { scanRequestSchema } from '#server/schemas/scan'
import { ScanRun } from '#server/entities/scan-run'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import {
    ScanAlreadyCompletedError,
    serializeScanRun,
    triggerScanForRepository,
} from '#server/services/scan-trigger.service'
import { requireOrgResource, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'

/**
 * POST /api/runs/[id]/retry：运行失败「受约束重试入口」（写操作限 admin/org_admin）。
 *
 * 受约束面（口径见 docs/design/governance/run-failure-taxonomy.md §5.5）：
 * - **仅 `transient` 失败可重试**：来源运行须已终态（`pending` / `running` 拒绝），
 *   且 `failureKind === 'transient'`；`deterministic` / `unknown` / 成功态一律拒绝（前端不可见 + 后端拒绝）
 * - **来源与参数均由服务端派生**：前端只传 runId——新 run 的 `mode` / `severityThreshold` /
 *   `executorKind` 取来源运行，来源 run id 写入新 run 的 `retriedFromRunId`（不可伪造）
 * - **同仓库去重合并**：复用 `triggerScanForRepository` 与 scan 端点同一路径，
 *   已有进行中任务时按既有「已合并」语义回应（前端提示且不跳转）
 * - 不做批量重试；不提供「强制重试」逃生舱
 *
 * 边界：AI 研判 override 不随 `ScanRun` 落库（仅落 `ai_config_snapshot`），故重试时 AI 设置
 * 按仓库 / 组织默认重新解析（与「以原参数重新入队」的持久化参数面一致）；
 * 来源运行的 `mode` / `severityThreshold` / `executorKind` 若无法通过请求校验（历史脏值），
 * 以 409 `RUN_RETRY_NOT_ALLOWED` 拒绝并落 warn 日志留痕（不静默降级、不 500）。
 */
export default defineEventHandler(async (event) => {
    const { user } = await requireRole(event, ['admin', 'org_admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const run = await ds.getRepository(ScanRun).findOne({ where: { id } })
    if (!run) {
        throw createLocalizedError(event, { statusCode: 404, code: 'SCAN_RUN_NOT_FOUND' })
    }

    const repository = await ds.getRepository(Repository).findOne({ where: { id: run.repositoryId } })
    if (!repository) {
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
    }
    await requireOrgResource(event, repository.organizationId)

    // 守卫 1：来源运行必须已结束——非终态不可作为重试来源
    if (run.status === 'pending' || run.status === 'running') {
        throw createLocalizedError(event, { statusCode: 409, code: 'RUN_RETRY_SOURCE_RUNNING' })
    }

    // 守卫 2：仅 transient 可重试（deterministic / unknown / 成功态 ⇒ failureKind 非 transient）。
    // 隐式不变量依赖：`failureKind` 只由失败终态（failed / dispatched）写入，见
    // `services/run-failure-classify.ts` 的 CLASSIFIABLE_STATUSES（口径 docs/design/governance/run-failure-taxonomy.md §5.5）
    if (run.failureKind !== 'transient') {
        console.warn(
            `[runs] retry rejected for ${run.id}: failureKind=${run.failureKind ?? 'null'} (only transient is retryable)`,
        )
        throw createLocalizedError(event, {
            statusCode: 409,
            code: 'RUN_RETRY_NOT_ALLOWED',
            data: { failureKind: run.failureKind },
        })
    }

    // 参数由服务端按来源运行派生（前端不可声明）
    // sandbox 入口已恢复：重试保留原执行器；出站策略由执行器第二道闸校验
    // （缺失时返回 `sandbox_fix_requires_egress_policy`），不在 API 层改写用户配置。
    const retryExecutorKind = run.executorKind
    const parsedParams = scanRequestSchema.safeParse({
        mode: run.mode,
        severityThreshold: run.severityThreshold,
        ...(retryExecutorKind ? { executorKind: retryExecutorKind } : {}),
    })
    if (!parsedParams.success) {
        console.warn(
            `[runs] retry rejected for ${run.id}: stored params not reusable `
            + `(mode=${run.mode}, threshold=${run.severityThreshold}, executor=${run.executorKind})`,
        )
        throw createLocalizedError(event, {
            statusCode: 409,
            code: 'RUN_RETRY_PARAMS_INVALID',
            data: { issues: parsedParams.error.issues },
        })
    }

    try {
        const { run: retriedRun, merged } = await triggerScanForRepository(
            run.repositoryId,
            parsedParams.data,
            { retriedFromRunId: run.id, triggeredByUserId: user.id },
        )
        return { ...serializeScanRun(retriedRun), ...(merged ? { merged } : {}) }
    } catch (error) {
        if (error instanceof ScanAlreadyCompletedError) {
            throw createLocalizedError(event, { statusCode: 409, code: 'SCAN_ALREADY_COMPLETED' })
        }
        throw error
    }
})
