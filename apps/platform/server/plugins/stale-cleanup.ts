import { parseDurationMs } from '@dependfix/core'
import { defineNitroPlugin } from 'nitropack/runtime'
import { cleanupStaleRuns, findRecentOrphanedRuns } from '#server/services/batch/stale-cleanup'
import { reconcileRunningBatchRuns } from '#server/services/batch/batch-reconciler'
import { cleanupPendingWorkdirs } from '#server/services/batch/cleanup-pending-workdirs'
import { releaseOrphanQueueJobs } from '#server/services/queue/orphan-job-release'
import { getQueueService, type QueueService } from '#server/services/queue/queue.service'
import type { ScanQueue } from '#server/services/queue/scan-queue'
import { resolveExecutionTimeoutMs } from '#server/services/executor/container-executor'
import { logger } from '#server/utils/logger'
import { shouldSkipHttpOnlyPlugin } from '#server/utils/process-role'

/**
 * 周期清理孤儿 ScanRun / BatchRun + 周期兜底对账 + `_pending/` 过期 workDir：
 * - 启动延迟 30 秒（让 DB / 队列就绪，避免阻塞 nitro 启动）
 * - 之后每 STALE_CLEANUP_INTERVAL_MS（默认 5 分钟）执行一次
 * - 清理结果通过统一 logger 上报（控制台 + 数据卷日志文件）；失败不抛（下次重试）
 * - nitro 关闭时清理 timer（避免热重载期间句柄泄漏）
 *
 * 执行范围（按顺序）：
 * 1. ScanRun / BatchRun 孤儿记录（cleanupStaleRuns——sync 崩溃 / worker SIGKILL / runner 不回执）
 * 2. 释放孤儿 run 占用的队列去重键（僵尸 waiting/active job；无消费者 / 归属终态 run）
 * 3. BatchRun 周期兜底对账（reconcileRunningBatchRuns——子项已终态但父批次未被查看 / 零子项孤儿）
 * 4. `_pending/` 过期 workDir（cleanupPendingWorkdirs——PR 失败保留的 24h 诊断目录）
 *
 * 顺序说明：先清孤儿（把卡死子 run 落 failed），再释放 job / 对账（把刚落 failed 的子项
 * 聚合成父批次终态并解除去重键），避免新触发被永久合并。
 *
 * 阈值：
 * - running：`resolveExecutionTimeoutMs() + STALE_CLEANUP_RUNNING_GRACE_MS`（缺省 30m + 5m）
 * - pending：`STALE_CLEANUP_PENDING_GRACE_MS`（缺省 5m）+ job 现场判定（不再用 hasLiveJob 一票否决）
 * - BatchRun：30m
 * 间隔可通过 STALE_CLEANUP_INTERVAL_MS 覆盖（生产保持默认；测试可缩短为毫秒级）。
 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000
const DEFAULT_RUNNING_GRACE_MS = 5 * 60 * 1000
const DEFAULT_PENDING_GRACE_MS = 5 * 60 * 1000

/** 解析时长阈值（支持 `300000` / `5m`；非法 / 空串 / 0 / 负数回退默认，避免 0 宽限造成误杀） */
const resolveGraceMs = (raw: string | undefined, fallback: number): number =>
    parseDurationMs(raw, { defaultUnit: 'ms' }) ?? fallback

/**
 * 单轮清理（导出便于单测覆盖）：孤儿 ScanRun/BatchRun → 释放去重键 → 兜底对账 → `_pending/` 过期 workDir。
 * 各类任务各自独立捕获，任一失败不阻塞其余（避免 cleanupStaleRuns 抛错时对账被跳过）。
 */
export const runStaleCleanupOnce = async (): Promise<void> => {
    // 队列服务单例（惰性）：async 模式用于 job 现场判定 + 释放去重键。
    // 初始化失败降级为"无队列"语义（pending 超时按孤儿处理，本轮不释放 job）
    let queueService: QueueService | null = null
    try {
        queueService = await getQueueService()
    } catch (error) {
        logger.error('[stale-cleanup] 队列服务初始化失败', { error })
    }
    const scanQueue: ScanQueue | null = queueService?.mode === 'async' ? queueService.queue : null

    // 消费者探测在一轮内只查一次（多个 pending run 复用同一结果）
    let consumersProbe: Promise<boolean | null> | null = null
    const resolveConsumers = (): Promise<boolean | null> => {
        if (!scanQueue) {
            return Promise.resolve(null)
        }
        consumersProbe ??= scanQueue.hasConsumers()
        return consumersProbe
    }

    try {
        const result = await cleanupStaleRuns({
            // running 阈值与容器执行器超时同源（缺省 30 分钟，可经 EXECUTION_TIMEOUT_MS 覆盖）
            scanRunTimeoutMs: resolveExecutionTimeoutMs(),
            runningGraceMs: resolveGraceMs(process.env.STALE_CLEANUP_RUNNING_GRACE_MS, DEFAULT_RUNNING_GRACE_MS),
            // 有队列探针时用较短的 pending 宽限（无消费者 / 归属终态可快速收敛）；
            // 无队列（sync 降级）时沿用执行超时阈值，保持既有语义（pending 本就不该由 sync 产生）
            pendingOrphanAgeMs: scanQueue
                ? resolveGraceMs(process.env.STALE_CLEANUP_PENDING_GRACE_MS, DEFAULT_PENDING_GRACE_MS)
                : resolveExecutionTimeoutMs(),
            // 队列现场探针：job 不存在 / 已终态 / 归属终态 run / 无消费者 → 孤儿
            queueJobProbe: scanQueue
                ? {
                    inspect: (repositoryId) => scanQueue.inspect(repositoryId),
                    hasConsumers: resolveConsumers,
                }
                : undefined,
        })
        if (result.scanRunsFailed > 0 || result.batchRunsFailed > 0) {
            const consumers = scanQueue ? await resolveConsumers() : null
            let consumersLabel = 'unknown'
            if (consumers !== null) {
                consumersLabel = consumers ? 'yes' : 'no'
            }
            logger.info(
                `[stale-cleanup] ${result.checkedAt} — scan=${result.scanRunsFailed} batch=${result.batchRunsFailed} consumers=${consumersLabel}`,
            )
        }
        // 释放孤儿 run 占用的队列去重键，避免重新触发被"已有进行中的扫描任务"永久合并。
        // 候选 = 本轮新失败 + 近期已判 orphan_run 的 run（后者用于 active 锁未过期导致 remove 失败的重试）
        if (scanQueue) {
            let releaseCandidates = result.orphanedRuns
            try {
                const recent = await findRecentOrphanedRuns()
                if (recent.length > 0) {
                    const seen = new Set(releaseCandidates.map((run) => run.runId))
                    releaseCandidates = [
                        ...releaseCandidates,
                        ...recent.filter((run) => !seen.has(run.runId)),
                    ]
                }
            } catch (error) {
                logger.warn('[stale-cleanup] 近期孤儿 run 查询失败（仅释放本轮候选）', { error })
            }
            const released = await releaseOrphanQueueJobs(scanQueue, releaseCandidates)
            if (released.removed > 0 || released.skipped > 0) {
                logger.info(
                    `[stale-cleanup] 释放孤儿队列 job：removed=${released.removed} skipped=${released.skipped}/${releaseCandidates.length}`,
                )
            }
        }
    } catch (error) {
        logger.error('[stale-cleanup] 孤儿清理失败', { error })
    }

    // 周期兜底对账：子项已全部终态但父批次仍 running 的批次终结化 + 进行中批次进度写回
    try {
        const reconciled = await reconcileRunningBatchRuns()
        if (reconciled.completed > 0 || reconciled.progressUpdated > 0 || reconciled.orphaned > 0) {
            logger.info(
                `[stale-cleanup] ${reconciled.checkedAt} — batch reconcile: scanned=${reconciled.scanned} completed=${reconciled.completed} progress=${reconciled.progressUpdated} orphaned=${reconciled.orphaned}`,
            )
        }
    } catch (error) {
        logger.error('[stale-cleanup] 批次对账失败', { error })
    }

    // `_pending/` 过期 workDir 清理（PR 失败保留的诊断目录，默认 24h 过期）
    try {
        const pending = await cleanupPendingWorkdirs()
        if (pending.removed > 0) {
            logger.info(
                `[stale-cleanup] ${pending.checkedAt} — pending workdirs removed=${pending.removed} skipped=${pending.skippedMissingMeta}`,
            )
        }
    } catch (error) {
        logger.error('[stale-cleanup] pending workdir 清理失败', { error })
    }
}

export default defineNitroPlugin((nitroApp) => {
    // 队列 worker 进程跳过周期清理：周期任务只需一个进程执行——容器双进程形态下 HTTP 主进程恒存在，
    // 且 §10.6 已把「worker 崩溃后的兜底」挂在它身上；两进程同跑会产生重复 DB 查询与
    // `_pending/` 目录删除竞态。角色判定与清单见 docs/standards/platform.md §10.6。
    if (shouldSkipHttpOnlyPlugin('stale-cleanup', process.env, logger)) {
        return
    }

    const intervalMs = resolveGraceMs(process.env.STALE_CLEANUP_INTERVAL_MS, DEFAULT_INTERVAL_MS)
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
