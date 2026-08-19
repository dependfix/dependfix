import { LessThan, In } from 'typeorm'
import { EMPTY_BATCH_SUMMARY } from './batch-aggregate'
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
    /** ScanRun stale 阈值（ms）；默认 30 分钟 = ContainerExecutor.timeoutMs 默认 */
    scanRunTimeoutMs?: number
    /** BatchRun stale 阈值（ms）；默认 30 分钟 */
    batchRunTimeoutMs?: number
}

export interface CleanupResult {
    scanRunsFailed: number
    batchRunsFailed: number
    /** 检查时刻（ISO 字符串，便于审计） */
    checkedAt: string
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

    // 1. 找出 stale ScanRun（status in [running, pending] 且 startedAt < cutoff）
    // 注：pending 无 startedAt 但 pending → running 由 worker 同步触发（scan-orchestrator.ts:122），
    // pending 状态的卡死通常是入队后 worker 没消费 — 用 createdAt 兜底（BatchRun 同理）
    const staleScanRuns = await scanRepo.find({
        where: [
            { status: 'running', startedAt: LessThan(scanCutoff) },
            { status: 'pending', createdAt: LessThan(scanCutoff) },
        ],
    })

    let scanRunsFailed = 0
    for (const run of staleScanRuns) {
        run.status = 'failed'
        run.finishedAt = now
        run.errorJson = JSON.stringify({
            code: 'orphan_run',
            message: `超过 ${Math.round(scanRunTimeoutMs / 60000)} 分钟未到达终态，已被 stale cleanup 自动标记为失败`,
        })
        await scanRepo.save(run)
        scanRunsFailed++
    }

    // 2. 找出 stale BatchRun（status='running' 且 createdAt < batchCutoff 且至少有一个下属 stale run）
    // 注：仅当下属确实存在 stale run 时才认为该 BatchRun 是孤儿 — 避免误杀"运行中但慢"的合法批次
    const staleBatchRunIds = new Set<string>()
    for (const run of staleScanRuns) {
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
        batch.status = 'failed'
        batch.finishedAt = now
        if (!batch.summaryJson) {
            batch.summaryJson = JSON.stringify(EMPTY_BATCH_SUMMARY)
        }
        await batchRepo.save(batch)
        batchRunsFailed++
    }

    return {
        scanRunsFailed,
        batchRunsFailed,
        checkedAt: now.toISOString(),
    }
}
