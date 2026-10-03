import { defineNitroPlugin } from 'nitropack/runtime'
import { cleanupStaleRuns, type OrphanedRunRef } from '#server/services/batch/stale-cleanup'
import { reconcileRunningBatchRuns } from '#server/services/batch/batch-reconciler'
import { cleanupPendingWorkdirs } from '#server/services/batch/cleanup-pending-workdirs'
import { getQueueService, type QueueService } from '#server/services/queue/queue.service'
import type { ScanQueue } from '#server/services/queue/scan-queue'

/**
 * 周期清理孤儿 ScanRun / BatchRun + 周期兜底对账 + `_pending/` 过期 workDir：
 * - 启动延迟 30 秒（让 DB / 队列就绪，避免阻塞 nitro 启动）
 * - 之后每 STALE_CLEANUP_INTERVAL_MS（默认 5 分钟）执行一次
 * - 清理结果通过 console.info / console.error 上报；失败不抛（下次重试）
 * - nitro 关闭时清理 timer（避免热重载期间句柄泄漏）
 *
 * 执行范围（按顺序）：
 * 1. ScanRun / BatchRun 孤儿记录（cleanupStaleRuns——sync 崩溃 / worker SIGKILL / runner 不回执）
 * 2. BatchRun 周期兜底对账（reconcileRunningBatchRuns——子项已终态但父批次未被查看 / 零子项孤儿）
 * 3. `_pending/` 过期 workDir（cleanupPendingWorkdirs——PR 失败保留的 24h 诊断目录）
 *
 * 顺序说明：先清孤儿（把卡死子 run 落 failed），再对账（把刚落 failed 的子项聚合成父批次终态）。
 * 阈值与 ContainerExecutor.timeoutMs（30 分钟）对齐——running 超过该阈值的 run 必然是孤儿；
 * pending 是否孤儿由队列状态判定（async 下仍有非终态 job → 排队 / 执行中，不误杀）。
 * 间隔可通过 STALE_CLEANUP_INTERVAL_MS 覆盖（生产保持默认；测试可缩短为毫秒级）。
 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000

/**
 * 释放孤儿 run 占用的队列去重键（jobId = scan-<repositoryId>）。
 * 背景：stale cleanup 只把 DB ScanRun 置 failed，BullMQ job 若仍处于 waiting/active，
 * 去重键会被持续占用 → 后续触发被 SCAN_PENDING_MERGED 永久合并。
 * 归属收敛：仅释放 job.data.runId === 孤儿 runId 的 job——同仓库若已被用户重新触发替换为
 * 新 run 的 job，不得误删。移除失败（active 仍被 worker 锁定）仅告警，不阻断清理。
 */
export const releaseOrphanQueueJobs = async (
    scanQueue: ScanQueue | null,
    orphanedRuns: OrphanedRunRef[],
): Promise<void> => {
    if (!scanQueue || orphanedRuns.length === 0) {
        return
    }
    let removed = 0
    for (const run of orphanedRuns) {
        try {
            const { removed: hit } = await scanQueue.remove(run.repositoryId, run.runId)
            if (hit) {
                removed++
            }
        } catch (error) {
            console.error(`[stale-cleanup] 释放孤儿 run ${run.runId} 队列 job 失败:`, error)
        }
    }
    if (removed > 0) {
        console.info(`[stale-cleanup] 释放孤儿队列 job：removed=${removed}/${orphanedRuns.length}`)
    }
}

/**
 * 单轮清理（导出便于单测覆盖）：孤儿 ScanRun/BatchRun → 兜底对账 → `_pending/` 过期 workDir。
 * 三类任务各自独立捕获，任一失败不阻塞其余（避免 cleanupStaleRuns 抛错时对账被跳过）。
 */
export const runStaleCleanupOnce = async (): Promise<void> => {
    // 队列服务单例（惰性）：async 模式用于 pending 孤儿判定 + 释放孤儿 job。
    // 初始化失败降级为"无队列"语义（pending 超时按孤儿处理，本轮不释放 job）
    let queueService: QueueService | null = null
    try {
        queueService = await getQueueService()
    } catch (error) {
        console.error('[stale-cleanup] 队列服务初始化失败:', error)
    }
    const scanQueue: ScanQueue | null = queueService?.mode === 'async' ? queueService.queue : null

    try {
        const result = await cleanupStaleRuns({
            // async 队列模式：pending 超时但仍有非终态 job（排队 / 执行中）→ 合法等待，不误杀；
            // 其余（job 缺失或已终态）→ 孤儿
            isPendingOrphan: scanQueue
                ? async (run) => !(await scanQueue.hasLiveJob(run.repositoryId))
                : undefined,
        })
        if (result.scanRunsFailed > 0 || result.batchRunsFailed > 0) {
            console.info(
                `[stale-cleanup] ${result.checkedAt} — scan=${result.scanRunsFailed} batch=${result.batchRunsFailed}`,
            )
        }
        // 释放孤儿 run 占用的队列去重键，避免重新触发被"已有进行中的扫描任务"永久合并
        await releaseOrphanQueueJobs(scanQueue, result.orphanedRuns)
    } catch (error) {
        console.error('[stale-cleanup] 孤儿清理失败:', error)
    }

    // 周期兜底对账：子项已全部终态但父批次仍 running 的批次终结化 + 进行中批次进度写回
    try {
        const reconciled = await reconcileRunningBatchRuns()
        if (reconciled.completed > 0 || reconciled.progressUpdated > 0 || reconciled.orphaned > 0) {
            console.info(
                `[stale-cleanup] ${reconciled.checkedAt} — batch reconcile: scanned=${reconciled.scanned} completed=${reconciled.completed} progress=${reconciled.progressUpdated} orphaned=${reconciled.orphaned}`,
            )
        }
    } catch (error) {
        console.error('[stale-cleanup] 批次对账失败:', error)
    }

    // `_pending/` 过期 workDir 清理（PR 失败保留的诊断目录，默认 24h 过期）
    try {
        const pending = await cleanupPendingWorkdirs()
        if (pending.removed > 0) {
            console.info(
                `[stale-cleanup] ${pending.checkedAt} — pending workdirs removed=${pending.removed} skipped=${pending.skippedMissingMeta}`,
            )
        }
    } catch (error) {
        console.error('[stale-cleanup] pending workdir 清理失败:', error)
    }
}

export default defineNitroPlugin((nitroApp) => {
    const intervalMs = Number(process.env.STALE_CLEANUP_INTERVAL_MS) || DEFAULT_INTERVAL_MS
    let timer: ReturnType<typeof setInterval> | null = null

    // 首跑延迟 + 之后周期
    const initialHandle = setTimeout(() => {
        void runStaleCleanupOnce()
        timer = setInterval(() => {
            void runStaleCleanupOnce()
        }, intervalMs)
    }, FIRST_RUN_DELAY_MS)

    nitroApp.hooks.hook('close', () => {
        clearTimeout(initialHandle)
        if (timer) {
            clearInterval(timer)
            timer = null
        }
    })
})
