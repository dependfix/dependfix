// batch-resume.ts — 批次级「继续执行未完成项」。
//
// 场景（2026-10-18 用户要求）：宿主机重启 / 中断后，失败批次里仍可重试的子项（transient 失败）
// 由用户显式触发一次续跑；不做自动续跑，也不复用原批次（原批次保留历史终态，派生新批次并
// 记录 resumedFromBatchRunId，链路可追溯）。
//
// 判定口径：
// - 原批次仍有 pending / running 子项 → 拒绝（批次仍在进行中，避免重复执行）
// - 已有派生续跑批次仍在 running → 拒绝（批次级互斥，防连点）
// - 候选 = 原批次下 `status='failed'` 且 `failureKind='transient'` 的子项（确定性失败不重试）
import { executeBatchRun } from './batch-executor'
import { ensureDatabaseInitialized } from '#server/database'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { AuditEvent } from '#server/entities/audit-event'
import { logger as platformLogger } from '#server/utils/logger'

/** 续跑被拒绝的原因（HTTP 层映射 409）。 */
export type BatchResumeRejection = 'not-found' | 'in-progress' | 'already-resuming' | 'nothing-to-resume'

export class BatchResumeError extends Error {
    constructor(readonly reason: BatchResumeRejection, message: string) {
        super(message)
        this.name = 'BatchResumeError'
    }
}

export interface BatchResumeResult {
    batchRunId: string
    repositoryCount: number
    /** 被跳过的子项数（非 transient / 仓库已删除等） */
    skippedCount: number
}

/**
 * 计算可续跑子项：失败的 transient 子项，按仓库去重（同仓多次失败只续跑一次）。
 * 确定性失败（failureKind=deterministic）不参与，避免「重试必然再失败」的循环。
 */
export function selectResumableRuns(
    runs: Pick<ScanRun, 'repositoryId' | 'status' | 'failureKind'>[],
): { repositoryIds: string[], skippedCount: number } {
    const repositoryIds = new Set<string>()
    let skippedCount = 0
    for (const run of runs) {
        if (run.status !== 'failed') {
            skippedCount++
            continue
        }
        if (run.failureKind !== 'transient') {
            skippedCount++
            continue
        }
        repositoryIds.add(run.repositoryId)
    }
    return { repositoryIds: [...repositoryIds], skippedCount }
}

/**
 * 执行批次续跑：校验互斥条件 → 派生新批次（source=manual，resumedFromBatchRunId=原批次）。
 */
export async function resumeBatchRun(params: {
    batchRunId: string
    organizationId: string | null
    triggeredByUserId?: string
}): Promise<BatchResumeResult> {
    const ds = await ensureDatabaseInitialized()
    const batchRepo = ds.getRepository(BatchRun)
    const scanRepo = ds.getRepository(ScanRun)

    const batch = await batchRepo.findOne({ where: { id: params.batchRunId } })
    if (batch?.organizationId !== params.organizationId) {
        throw new BatchResumeError('not-found', '批量运行不存在')
    }

    const runs = await scanRepo.find({ where: { batchRunId: batch.id } })
    if (runs.some((run) => run.status === 'pending' || run.status === 'running')) {
        throw new BatchResumeError('in-progress', '批次仍在进行中，不能续跑')
    }

    const resuming = await batchRepo.findOne({
        where: { resumedFromBatchRunId: batch.id, status: 'running' },
    })
    if (resuming) {
        throw new BatchResumeError('already-resuming', `该批次已有进行中的续跑批次 ${resuming.id}`)
    }

    const { repositoryIds, skippedCount } = selectResumableRuns(runs)
    if (repositoryIds.length === 0) {
        throw new BatchResumeError('nothing-to-resume', '没有可继续执行的子项（仅 transient 失败可续跑）')
    }

    const result = await executeBatchRun({
        source: 'manual',
        repositoryIds,
        request: {
            mode: batch.mode as 'report-only' | 'fix' | 'fix-and-pr',
            severityThreshold: batch.severityThreshold,
        },
        organizationId: params.organizationId ?? '',
        triggeredByUserId: params.triggeredByUserId,
        resumedFromBatchRunId: batch.id,
    })
    try {
        const auditRepo = ds.getRepository(AuditEvent)
        await auditRepo.save(auditRepo.create({
            type: 'batch_run_resumed',
            severity: 'info',
            repositoryId: null,
            scanRunId: null,
            payloadJson: JSON.stringify({
                sourceBatchRunId: batch.id,
                batchRunId: result.batchRunId,
                repositoryIds,
                skippedCount,
            }),
            notified: false,
            notifiedVia: null,
        } as AuditEvent))
    } catch (error) {
        // 审计失败不阻断：批次已创建，留日志即可（与仓库配置审计同策略）
        platformLogger.warn('[batch] failed to record batch_run_resumed audit event', { error })
    }
    platformLogger.info('[batch] resumed batch run', {
        sourceBatchRunId: batch.id,
        batchRunId: result.batchRunId,
        repositoryCount: result.repositoryCount,
        skippedCount,
    })
    return { ...result, skippedCount }
}
