import { defineNitroPlugin } from 'nitropack/runtime'
import {
    isWeeklyDigestDue,
    parseWeeklyDigestHour,
    resolveWeeklyDigestSlot,
    WEEKLY_DIGEST_CHECK_INTERVAL_MS,
    WEEKLY_DIGEST_HOUR_ENV,
} from '#server/services/notification/weekly-digest-schedule'
import { sendWeeklyDigest } from '#server/services/notification/weekly-digest.service'
import { SMTP_SOCKET_TIMEOUT_MS } from '#server/services/mailer/transport'
import { checkSmtpTimeoutBudget } from '#server/services/mailer/timeout-budget'
import {
    createWeeklyDigestAttemptState,
    reduceWeeklyDigestAttempt,
    type WeeklyDigestAttemptState,
} from '#server/services/notification/weekly-digest-attempt'
import { logger } from '#server/utils/logger'
import { captureLifecycleError } from '#server/utils/observability'
import { shouldSkipHttpOnlyPlugin } from '#server/utils/process-role'

/**
 * 周汇总周期插件（设计稿 §6.5 / §7.3 / §15 D6）：
 * - 启动延迟 30 秒（等 DB 就绪）后每 15 分钟检查一次「是否处于本周触发窗口」；
 * - 窗口 = 服务器本地周一 `DEPENDFIX_WEEKLY_DIGEST_HOUR` 时（默认 9）起 24 小时，
 *   进程在窗口内重启仍会补发；窗口外等待下一周；
 * - 尝试状态按结果推进（`weekly-digest-attempt.ts`）：`sent` / 全量已发为终态；
 *   `partial` / `failed` / `noop` 计次并退避 30 分钟；`skipped_no_recipient` 只退避不计次
 *   （窗口内开启个人开关仍可补发）；配置关闭不占用本周；
 * - 触顶 `WEEKLY_DIGEST_MAX_SEND_ATTEMPTS` 后本周不再尝试，真正的「每周一封」由逐用户投递键兜底；
 * - 按角色只在一个进程运行：与 `stale-cleanup` 同属 HTTP-only（容器双进程形态下 HTTP 主进程
 *   恒存在），避免 HTTP / worker 双发。判定见 docs/standards/platform.md §10.6。
 *
 * 失败不抛出：服务内部 best-effort 落 notification_log；意外异常按失败退避并在后续节拍重试。
 */
export const WEEKLY_DIGEST_FIRST_RUN_DELAY_MS = 30 * 1000
export { WEEKLY_DIGEST_CHECK_INTERVAL_MS }

export default defineNitroPlugin((nitroApp) => {
    if (shouldSkipHttpOnlyPlugin('weekly-digest', process.env, logger)) {
        return
    }

    // 传输超时必须小于检查节拍：否则单次挂起的发送会跨过节拍（发送结束后下一节拍继续）；只 warn，不阻断启动
    const timeoutBudget = checkSmtpTimeoutBudget({
        socketTimeoutMs: SMTP_SOCKET_TIMEOUT_MS,
        checkIntervalMs: WEEKLY_DIGEST_CHECK_INTERVAL_MS,
    })
    if (!timeoutBudget.ok) {
        logger.warn(`[weekly-digest] ${timeoutBudget.message}`)
    }

    const parsedHour = parseWeeklyDigestHour(process.env[WEEKLY_DIGEST_HOUR_ENV])
    if (parsedHour.invalid) {
        logger.warn(
            `[weekly-digest] invalid ${WEEKLY_DIGEST_HOUR_ENV}=${JSON.stringify(process.env[WEEKLY_DIGEST_HOUR_ENV])}（仅支持 0-23 整数）——回退 ${parsedHour.hour} 时`,
        )
    }
    const hour = parsedHour.hour
    let state: WeeklyDigestAttemptState | null = null
    /** 重入守卫：上一次发送未结束时跳过节拍（SMTP 挂起可跨过 15 分钟间隔）。 */
    let running = false

    const tick = async (): Promise<void> => {
        if (running) {
            return
        }
        const now = new Date()
        if (!isWeeklyDigestDue(now, hour)) {
            return
        }
        const { weekKey } = resolveWeeklyDigestSlot(now, hour)
        if (state?.weekKey !== weekKey) {
            state = createWeeklyDigestAttemptState(weekKey)
        }
        const current = state
        if (current.done || now.getTime() < current.nextAttemptAtMs) {
            return
        }
        running = true
        try {
            const result = await sendWeeklyDigest(now)
            // 退避以上一次发送的**完成时刻**为基准，避免发送耗时吞掉退避窗口
            state = reduceWeeklyDigestAttempt(current, result.status, Date.now())
        } catch (error) {
            // 意外异常按「失败」推进（计次 + 退避），不会在同一节拍内无限重试
            state = reduceWeeklyDigestAttempt(current, 'failed', Date.now())
            logger.error('[weekly-digest] 周报发送失败', { error })
            // 可观测性通道：周报停摆是已知高风险（SMTP 挂起时无任何用户可见信号）；
            // DSN 未配置时为 no-op，退避与重试语义不变
            captureLifecycleError(error, { source: 'weekly_digest' })
        } finally {
            running = false
        }
    }

    let timer: ReturnType<typeof setInterval> | null = null
    const initialHandle = setTimeout(() => {
        void tick()
        timer = setInterval(() => {
            void tick()
        }, WEEKLY_DIGEST_CHECK_INTERVAL_MS)
    }, WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)

    nitroApp.hooks.hook('close', () => {
        clearTimeout(initialHandle)
        if (timer) {
            clearInterval(timer)
            timer = null
        }
    })
})
