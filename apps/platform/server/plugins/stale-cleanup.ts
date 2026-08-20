import { defineNitroPlugin } from 'nitropack/runtime'
import { cleanupStaleRuns } from '#server/services/batch/stale-cleanup'
import { cleanupPendingWorkdirs } from '#server/services/batch/cleanup-pending-workdirs'

/**
 * 周期清理孤儿 ScanRun / BatchRun + `_pending/` 过期 workDir：
 * - 启动延迟 30 秒（让 DB / 队列就绪，避免阻塞 nitro 启动）
 * - 之后每 STALE_CLEANUP_INTERVAL_MS（默认 5 分钟）执行一次
 * - 清理结果通过 console.info / console.error 上报；失败不抛（下次重试）
 * - nitro 关闭时清理 timer（避免热重载期间句柄泄漏）
 *
 * 清理范围：
 * 1. ScanRun / BatchRun 孤儿记录（cleanupStaleRuns——sync 崩溃 / worker SIGKILL / runner 不回执）
 * 2. `_pending/` 过期 workDir（cleanupPendingWorkdirs——PR 失败保留的 24h 诊断目录，
 *    按 .meta.json.expiresAt 清理，闭合「目录无限堆积」缺口）
 *
 * 阈值与 ContainerExecutor.timeoutMs（30 分钟）对齐——超出单次执行超时的 run
 * 必然是孤儿（sync 进程崩溃 / async worker SIGKILL / Action runner 永久不回执等）。
 * 间隔可通过 STALE_CLEANUP_INTERVAL_MS 覆盖（生产保持默认；测试可缩短为毫秒级）。
 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000

export default defineNitroPlugin((nitroApp) => {
    const intervalMs = Number(process.env.STALE_CLEANUP_INTERVAL_MS) || DEFAULT_INTERVAL_MS
    let timer: ReturnType<typeof setInterval> | null = null

    const runOnce = async (): Promise<void> => {
        try {
            const result = await cleanupStaleRuns()
            if (result.scanRunsFailed > 0 || result.batchRunsFailed > 0) {
                console.info(
                    `[stale-cleanup] ${result.checkedAt} — scan=${result.scanRunsFailed} batch=${result.batchRunsFailed}`,
                )
            }
            // _pending/ 过期 workDir 清理（PR 失败保留的诊断目录，默认 24h 过期）
            const pending = await cleanupPendingWorkdirs()
            if (pending.removed > 0) {
                console.info(
                    `[stale-cleanup] ${pending.checkedAt} — pending workdirs removed=${pending.removed} skipped=${pending.skippedMissingMeta}`,
                )
            }
        } catch (error) {
            console.error('[stale-cleanup] 清理失败:', error)
        }
    }

    // 首跑延迟 + 之后周期
    const initialHandle = setTimeout(() => {
        void runOnce()
        timer = setInterval(() => {
            void runOnce()
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
