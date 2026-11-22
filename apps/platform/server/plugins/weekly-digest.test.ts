import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 周汇总插件单测：注册守卫（worker 跳过）+ 触发窗口 + 本进程同周只尝试一次 +
 * 失败允许下一轮重试 + 非法小时 env 回退。周报服务整体 mock，不触达 DB / 渠道。
 */
const { sendWeeklyDigestMock, logInfoMock, logWarnMock, logErrorMock, checkBudgetMock } = vi.hoisted(() => ({
    sendWeeklyDigestMock: vi.fn(),
    logInfoMock: vi.fn(),
    logWarnMock: vi.fn(),
    logErrorMock: vi.fn(),
    checkBudgetMock: vi.fn(() => ({ ok: true, message: '' })),
}))

vi.mock('nitropack/runtime', () => ({
    defineNitroPlugin: (fn: unknown) => fn,
}))
vi.mock('#server/services/notification/weekly-digest.service', () => ({
    sendWeeklyDigest: sendWeeklyDigestMock,
}))
vi.mock('#server/services/mailer/timeout-budget', () => ({
    checkSmtpTimeoutBudget: checkBudgetMock,
}))
vi.mock('#server/services/mailer/transport', () => ({
    SMTP_SOCKET_TIMEOUT_MS: 120_000,
}))
vi.mock('#server/utils/logger', () => ({
    logger: { debug: vi.fn(), info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}))

import weeklyDigestPlugin, {
    WEEKLY_DIGEST_CHECK_INTERVAL_MS,
    WEEKLY_DIGEST_FIRST_RUN_DELAY_MS,
} from './weekly-digest'
import { WEEKLY_DIGEST_MAX_SEND_ATTEMPTS, WEEKLY_DIGEST_RETRY_BACKOFF_MS } from '#server/services/notification/weekly-digest-attempt'

const makeNitroApp = () => ({ hooks: { hook: vi.fn() } })

const runPlugin = (): ReturnType<typeof makeNitroApp> => {
    const nitroApp = makeNitroApp()
    ;(weeklyDigestPlugin as unknown as (app: unknown) => void)(nitroApp)
    return nitroApp
}

const result = () => ({
    weekKey: '2026-W44',
    status: 'sent',
    recipients: 1,
    sent: 1,
    failed: 0,
    noop: 0,
    skipped: 0,
})

describe('weekly-digest 插件注册守卫', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        delete process.env.DEPENDFIX_ROLE
    })

    it('worker 角色：不注册定时器与 close 钩子，并输出跳过日志', () => {
        vi.useFakeTimers()
        process.env.DEPENDFIX_ROLE = 'worker'
        const nitroApp = runPlugin()

        expect(nitroApp.hooks.hook).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
        expect(logInfoMock).toHaveBeenCalled()
    })

    it('启动期按真实常量校验超时预算，违规时 warn 并带两值', () => {
        vi.useFakeTimers()
        checkBudgetMock.mockReturnValueOnce({
            ok: false,
            message: 'socketTimeout=1800000ms >= digestInterval=900000ms',
        })
        runPlugin()

        expect(checkBudgetMock).toHaveBeenCalledWith({
            socketTimeoutMs: 120_000,
            checkIntervalMs: WEEKLY_DIGEST_CHECK_INTERVAL_MS,
        })
        expect(logWarnMock).toHaveBeenCalledWith(expect.stringContaining('socketTimeout=1800000ms'))
    })

    it('预算成立时不输出超时 warn（避免无条件 warn 回归）', () => {
        vi.useFakeTimers()
        runPlugin()
        expect(logWarnMock).not.toHaveBeenCalledWith(expect.stringContaining('socketTimeout='))
    })

    it('未设置角色：照常注册，close 钩子清理定时器', () => {
        vi.useFakeTimers()
        const nitroApp = runPlugin()
        expect(nitroApp.hooks.hook).toHaveBeenCalledWith('close', expect.any(Function))
        expect(vi.getTimerCount()).toBeGreaterThan(0)
        const closeHandler = nitroApp.hooks.hook.mock.calls[0]![1] as () => void
        closeHandler()
        expect(vi.getTimerCount()).toBe(0)
    })
})

describe('weekly-digest 插件触发', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sendWeeklyDigestMock.mockReset()
        sendWeeklyDigestMock.mockResolvedValue(result())
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        delete process.env.DEPENDFIX_ROLE
        delete process.env.DEPENDFIX_WEEKLY_DIGEST_HOUR
    })

    it('周一触发时刻前不发送', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 8, 0))
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS + WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).not.toHaveBeenCalled()
    })

    it('进入窗口后发送一次，同周后续节拍不重复尝试', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)
        const passNow = sendWeeklyDigestMock.mock.calls[0]![0] as Date
        expect(passNow.getTime()).toBe(new Date(2026, 9, 26, 9, 1, 30).getTime())

        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS * 4)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)
    })

    it('下一周同一窗口再次发送', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(7 * 24 * 60 * 60 * 1000)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)
    })

    it('失败后退避 30 分钟内不再尝试，超过退避后重试（异常不静默停用）', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        sendWeeklyDigestMock.mockRejectedValueOnce(new Error('db down'))
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)
        expect(logErrorMock).toHaveBeenCalled()

        // 退避 30 分钟 > 单次检查间隔 15 分钟：下一节拍应被跳过
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)
    })

    it('部分失败 = partial：退避后重试，成功即终态不再尝试', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        sendWeeklyDigestMock.mockResolvedValueOnce({ ...result(), status: 'partial', sent: 1, failed: 1, recipients: 2 })
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        sendWeeklyDigestMock.mockResolvedValueOnce({ ...result(), status: 'sent', sent: 1, skipped: 1, recipients: 2 })
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_RETRY_BACKOFF_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS * 8)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)
    })

    it('无收件人只退避不计次：连续多轮仍可在窗口内补发', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        sendWeeklyDigestMock.mockResolvedValue({ ...result(), status: 'skipped_no_recipient', recipients: 0, sent: 0 })
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        // 连续 8 轮（超过发信尝试上界）仍会重查：证明「无收件人」不消耗发信额度
        for (let attempt = 0; attempt < 8; attempt++) {
            await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_RETRY_BACKOFF_MS)
        }
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(9)

        // 窗口内开启个人开关后补发成功，并进入终态
        sendWeeklyDigestMock.mockResolvedValue({ ...result(), status: 'sent' })
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_RETRY_BACKOFF_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(10)
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_RETRY_BACKOFF_MS * 4)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(10)
    })

    it('发送未结束时跳过节拍（重入守卫：慢发送不并发进入）', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        // 用对象持有 resolve：闭包内赋值不会被 TS 的流分析看到，直接 `let` 会被窄化为 null/undefined
        const deferred: { resolve?: (value: unknown) => void } = {}
        sendWeeklyDigestMock.mockImplementationOnce(() => new Promise((resolve) => {
            deferred.resolve = resolve
        }))
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        // 发送挂起期间跨过多个节拍：不并发进入，尝试计数不会被少计
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS * 3)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        // 以失败结束：结束后按「完成时刻 + 退避」推进，退避到期才允许下一次尝试
        deferred.resolve?.({ ...result(), status: 'failed', sent: 0, failed: 1 })
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)
    })

    it('无收件人后开启开关：退避内不发送，退避到期后当周补发', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        sendWeeklyDigestMock.mockResolvedValueOnce({ ...result(), status: 'skipped_no_recipient', recipients: 0, sent: 0 })
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        sendWeeklyDigestMock.mockResolvedValue({ ...result(), status: 'sent' })
        // 第一个节拍（+15 分钟）仍在退避内 → 不发送
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)
        // 第二个节拍（+30 分钟）退避到期 → 补发并进入终态
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS * 4)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)
    })

    it('发信尝试触顶后本周停止（不退化为整窗高频重试）', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        sendWeeklyDigestMock.mockResolvedValue({ ...result(), status: 'failed', sent: 0, failed: 1 })
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        for (let attempt = 1; attempt < WEEKLY_DIGEST_MAX_SEND_ATTEMPTS; attempt++) {
            await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_RETRY_BACKOFF_MS)
        }
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(WEEKLY_DIGEST_MAX_SEND_ATTEMPTS)

        await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(WEEKLY_DIGEST_MAX_SEND_ATTEMPTS)
    })

    it('组织开关关闭不锁定本周：窗口内开启后下一轮补发', async () => {
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        sendWeeklyDigestMock.mockResolvedValueOnce({ ...result(), status: 'skipped_org_disabled', sent: 0 })
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_CHECK_INTERVAL_MS)
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(2)
    })

    it('非法小时 env → warn 并按默认 9 时触发', async () => {
        process.env.DEPENDFIX_WEEKLY_DIGEST_HOUR = '26'
        vi.setSystemTime(new Date(2026, 9, 26, 9, 1))
        runPlugin()
        await vi.advanceTimersByTimeAsync(WEEKLY_DIGEST_FIRST_RUN_DELAY_MS)
        expect(logWarnMock).toHaveBeenCalled()
        expect(sendWeeklyDigestMock).toHaveBeenCalledTimes(1)
    })
})
