import { LessThan, In } from 'typeorm'
import { applyFailureClassification } from '../run-failure-classify'
import { persistBatchFailedIfRunning } from './batch-writeback'
import { ScanRun } from '#server/entities/scan-run'
import { BatchRun } from '#server/entities/batch-run'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * 孤儿运行兜底清理：
 * - ScanRun stale：startedAt 距今 > scanRunTimeoutMs（默认 30 分钟，与单次执行超时对齐），
 *   状态仍为 running/pending → 强制 failed + errorJson 标记 orphan_run；
 * - BatchRun stale：createdAt 距今 > batchRunTimeoutMs（默认 30 分钟），状态仍为 running，
 *   且至少有一个下属 stale ScanRun → 强制 failed + finishedAt（避免 BatchRun 永远聚合 running）。
 *
 * 触发场景：sync 模式进程崩溃 / async worker SIGKILL / GitHub Action runner 永久不回执等
 * 导致 ScanRun 已落库为 running 但永远无终态的边界场景。
 *
 * 设计原则：
 * - 仅清理超过单次执行超时的 run（避免误杀正在执行的 30 分钟长任务）；
 * - 幂等：仅命中 status='running' / 'pending' 的行，不重复处理已 failed/completed；
 * - 失败路径走 save() 抛错 → 抛出给调用方记录日志，下次重试。
 */
export interface CleanupOptions {
    /** ScanRun stale 阈值（ms）；缺省 30 分钟 = `DEFAULT_EXECUTION_TIMEOUT_MS`。生产调用方（stale-cleanup 插件）传 `resolveExecutionTimeoutMs()` 保持与执行超时同源 */
    scanRunTimeoutMs?: number
    /** BatchRun stale 阈值（ms）；默认 30 分钟 */
    batchRunTimeoutMs?: number
    /**
     * pending run（createdAt 已超 scanRunTimeoutMs）的孤儿判定回调：
     * - 返回 true → 视为孤儿（force failed + orphan_run）
     * - 返回 false → 仍在队列中排队 / 执行，跳过（避免串行队列排队被误杀）
     * 缺省时一律视为孤儿（保留无队列 / 同步场景的既有语义）。
     */
    isPendingOrphan?: (run: ScanRun) => Promise<boolean>
}

export interface CleanupResult {
    scanRunsFailed: number
    batchRunsFailed: number
    /** 被 force failed 的孤儿 run（供调用方按 run 归属释放队列去重键） */
    orphanedRuns: OrphanedRunRef[]
    /** 检查时刻（ISO 字符串，便于审计） */
    checkedAt: string
}

/** 孤儿 run 引用：repositoryId 定位队列 jobId，runId 用于归属校验 */
export interface OrphanedRunRef {
    repositoryId: string
    runId: string
}

const DEFAULT_SCAN_RUN_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_BATCH_RUN_TIMEOUT_MS = 30 * 60 * 1000

export const cleanupStaleRuns = async (options: CleanupOptions = {}): Promise<CleanupResult> => {
    const scanRunTimeoutMs = options.scanRunTimeoutMs ?? DEFAULT_SCAN_RUN_TIMEOUT_MS
    const batchRunTimeoutMs = options.batchRunTimeoutMs ?? DEFAULT_BATCH_RUN_TIMEOUT_MS
    const now = new Date()
    const scanCutoff = new Date(now.getTime() - scanRunTimeoutMs)
    const batchCutoff = new Date(now.getTime() - batchRunTimeoutMs)

    const ds = await ensureDatabaseInitialized()
    const scanRepo = ds.getRepository(ScanRun)
    const batchRepo = ds.getRepository(BatchRun)

    // 1. 找出 stale ScanRun（status in [running, pending] 且超阈值）
    // 注：running 用 startedAt、pending 用 createdAt 判断是否超阈值；pending → running 由 worker
    // 触发（scan-orchestrator），是否孤儿由 isPendingOrphan 判定——async 队列下 job 仍在排队 /
    // 执行 → 非孤儿，避免串行队列排队被误杀；缺省回调时按孤儿处理（保留同步场景既有语义）
    const staleScanRuns = await scanRepo.find({
        where: [
            { status: 'running', startedAt: LessThan(scanCutoff) },
            { status: 'pending', createdAt: LessThan(scanCutoff) },
        ],
    })

    let scanRunsFailed = 0
    const failedRuns: ScanRun[] = []
    for (const run of staleScanRuns) {
        // pending 的孤儿判定：回调返回 false（或查询失败保守跳过）视为仍在队列中合法等待，
        // 跳过且不参与 BatchRun 孤儿判定
        if (run.status === 'pending' && options.isPendingOrphan) {
            let orphan = true
            try {
                orphan = await options.isPendingOrphan(run)
            } catch (error) {
                // 队列状态查询失败（Redis 抖动）：保守判定为"仍在队列中"，避免误杀合法排队 run
                console.warn(`[stale-cleanup] pending run ${run.id} 队列状态查询失败，跳过:`, error)
                orphan = false
            }
            if (!orphan) {
                continue
            }
        }
        run.status = 'failed'
        run.finishedAt = now
        const orphanFailure = {
            code: 'orphan_run',
            message: `超过 ${Math.round(scanRunTimeoutMs / 60000)} 分钟未到达终态，已被 stale cleanup 自动标记为失败`,
        }
        run.errorJson = JSON.stringify(orphanFailure)
        applyFailureClassification(run, { status: 'failed', error: orphanFailure })
        await scanRepo.save(run)
        failedRuns.push(run)
        scanRunsFailed++
    }

    const orphanedRuns: OrphanedRunRef[] = failedRuns.map((run) => ({
        repositoryId: run.repositoryId,
        runId: run.id,
    }))

    // 2. 找出 stale BatchRun（status='running' 且 createdAt < batchCutoff 且至少有一个下属 stale run）
    // 注：仅当下属确实存在 stale run 时才认为该 BatchRun 是孤儿 — 避免误杀"运行中但慢"的合法批次
    const staleBatchRunIds = new Set<string>()
    for (const run of failedRuns) {
        if (run.batchRunId) {
            staleBatchRunIds.add(run.batchRunId)
        }
    }
    const staleBatchCandidates = staleBatchRunIds.size > 0
        ? await batchRepo.find({
            where: {
                status: 'running',
                createdAt: LessThan(batchCutoff),
                id: In(Array.from(staleBatchRunIds)),
            },
        })
        : []

    let batchRunsFailed = 0
    for (const batch of staleBatchCandidates) {
        // 条件失败写回（乐观锁 = 读取时 running）：只写 status / finishedAt（+ 空 summary 兜底），
        // 不整行 save —— 候选实体为读取期快照，整行写会把并发聚合的计数覆盖回旧值
        const persisted = await persistBatchFailedIfRunning(batchRepo, batch, {
            finishedAt: now,
            fillEmptySummary: true,
        })
        if (persisted) {
            batchRunsFailed++
        }
    }

    return {
        scanRunsFailed,
        batchRunsFailed,
        orphanedRuns,
        checkedAt: now.toISOString(),
    }
}
