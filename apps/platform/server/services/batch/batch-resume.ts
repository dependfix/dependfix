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
import { In } from 'typeorm'
import { executeBatchRun } from './batch-executor'
import { ensureDatabaseInitialized } from '#server/database'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { AuditEvent } from '#server/entities/audit-event'
import { Repository } from '#server/entities/repository'
import { logger as platformLogger } from '#server/utils/logger'

/** 续跑被拒绝的原因（HTTP 层映射 409）。 */
export type BatchResumeRejection = 'not-found' | 'in-progress' | 'already-resuming' | 'nothing-to-resume' | 'invalid-params'

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
 * 计算可续跑子项：failed + transient（确定性失败不参与，避免「重试必然再失败」的循环）
 * 与 dispatched（Action 已派发未回执）子项，按仓库去重（同仓多次失败只续跑一次）。
 * 迁移前存量 `failureKind=null` 不参与（先跑 backfill），已在设计 §5.4 声明。
 */
export function selectResumableRuns(
    runs: Pick<ScanRun, 'repositoryId' | 'status' | 'failureKind'>[],
): { repositoryIds: string[], skippedCount: number } {
    const repositoryIds = new Set<string>()
    let skippedCount = 0
    for (const run of runs) {
        // `dispatched`（Action 已派发未回执）同属未完成；failed 只接受 transient
        const resumable = run.status === 'dispatched'
            || (run.status === 'failed' && run.failureKind === 'transient')
        if (!resumable) {
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

    const MODES = ['report-only', 'fix', 'fix-and-pr'] as const
    const SEVERITIES = ['critical', 'high', 'medium', 'all'] as const
    if (!MODES.includes(batch.mode as typeof MODES[number]) || !SEVERITIES.includes(batch.severityThreshold as typeof SEVERITIES[number])) {
        throw new BatchResumeError('invalid-params', '来源批次参数非法，无法续跑')
    }

    const selected = selectResumableRuns(runs)
    if (selected.repositoryIds.length === 0) {
        throw new BatchResumeError('nothing-to-resume', '没有可继续执行的子项（仅 transient 失败可续跑）')
    }

    // 组织归属复核（多组织扩展点）：跨组织 / 已删除仓库计入 skipped
    const repos = await ds.getRepository(Repository).find({
        where: { organizationId: params.organizationId ?? '', id: In(selected.repositoryIds) },
    })
    const allowed = new Set(repos.map((repo) => repo.id))
    const repositoryIds = selected.repositoryIds.filter((id) => allowed.has(id))
    const skippedCount = selected.skippedCount + (selected.repositoryIds.length - repositoryIds.length)
    if (repositoryIds.length === 0) {
        throw new BatchResumeError('nothing-to-resume', '没有可继续执行的子项（仓库不可用）')
    }

    const result = await executeBatchRun({
        // 保留原批次来源语义：定时批次续跑仍是 scheduled（scheduleId 继承），优先级不降级
        source: batch.source,
        scheduleId: batch.scheduleId,
        repositoryIds,
        request: {
            mode: batch.mode as typeof MODES[number],
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
