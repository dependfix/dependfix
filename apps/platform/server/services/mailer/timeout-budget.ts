/**
 * SMTP 传输超时与周报检查节拍的关系断言。
 *
 * 为什么需要：nodemailer 默认 `socketTimeout` 为 10 分钟，单看已小于 15 分钟检查节拍，但
 * ① 默认值不是约束（升级 / 手改 options 会静默漂移）；② socket 超时是「空闲」超时，多收件人
 * 顺序发送的实际总时长可跨过节拍。启动期把「socket 超时 < 检查节拍」变成显式断言，让配置
 * 漂移在启动时可见；违反时只 warn 不阻断（超时过短属运维取舍，不应让平台起不来）。
 */

export interface SmtpTimeoutBudget {
    /** nodemailer socketTimeout（毫秒） */
    socketTimeoutMs: number
    /** 周报检查节拍（毫秒） */
    checkIntervalMs: number
}

export interface SmtpTimeoutBudgetResult {
    ok: boolean
    /** 两值都写进说明，便于日志直接核对（成功 / 违规共用） */
    message: string
}

/** 校验 socket 超时必须严格小于周报检查节拍。 */
export const checkSmtpTimeoutBudget = (budget: SmtpTimeoutBudget): SmtpTimeoutBudgetResult => {
    const { socketTimeoutMs, checkIntervalMs } = budget
    if (socketTimeoutMs < checkIntervalMs) {
        return {
            ok: true,
            message: `socketTimeout=${socketTimeoutMs}ms < digestInterval=${checkIntervalMs}ms`,
        }
    }
    return {
        ok: false,
        message: `socketTimeout=${socketTimeoutMs}ms >= digestInterval=${checkIntervalMs}ms：`
            + '单次发送可能跨过检查节拍（发送结束后下一节拍继续）；请调小 socketTimeout 或调大检查节拍',
    }
}
