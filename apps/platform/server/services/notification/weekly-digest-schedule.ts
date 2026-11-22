/**
 * 周汇总（`weekly_digest`）的周期与 ISO 周纯函数。
 *
 * 口径见 docs/design/governance/platform-notification.md §6.5：
 * - 每周一 `DEPENDFIX_WEEKLY_DIGEST_HOUR` 时（默认 9，服务器时区）触发；
 * - `weekKey` 按 ISO 8601 周（如 `2026-W43`）与服务器时区计算；
 * - 触发窗口 = 周一触发时刻起 24 小时（补发窗口），窗口外等待下一周，避免进程周末重启后
 *   在工作日中途发送「周报」；
 * - 同周只发一次由逐用户投递键兜底（见 dedupe.ts#buildDigestDeliveryKey），本模块只管「何时应尝试」。
 */

/** 周报触发小时环境变量（容器 / 部署侧覆盖；进程级，变更需重启）。 */
export const WEEKLY_DIGEST_HOUR_ENV = 'DEPENDFIX_WEEKLY_DIGEST_HOUR'

export const DEFAULT_WEEKLY_DIGEST_HOUR = 9

/** 触发窗口：周一触发时刻起 24 小时内允许发送 / 补发。 */
export const WEEKLY_DIGEST_CATCH_UP_MS = 24 * 60 * 60 * 1000

/** 周报检查节拍：15 分钟；SMTP socket 超时必须严格小于该值（见 mailer/timeout-budget）。 */
export const WEEKLY_DIGEST_CHECK_INTERVAL_MS = 15 * 60 * 1000

export interface WeeklyDigestHourParseResult {
    hour: number
    /** 原始值存在但不是 0-23 整数（已回退默认值，调用方可告警）。 */
    invalid: boolean
}

/**
 * 解析触发小时：空 / 未设置为默认值且不算非法；非法值回退默认值并标记 `invalid`。
 * 只接受 0-23 的整数（与「服务器时区的小时」语义一致）。
 */
export const parseWeeklyDigestHour = (raw: string | undefined): WeeklyDigestHourParseResult => {
    if (raw === undefined || raw.trim() === '') {
        return { hour: DEFAULT_WEEKLY_DIGEST_HOUR, invalid: false }
    }
    const value = Number(raw)
    if (Number.isInteger(value) && value >= 0 && value <= 23) {
        return { hour: value, invalid: false }
    }
    return { hour: DEFAULT_WEEKLY_DIGEST_HOUR, invalid: true }
}

/** 解析触发小时（回退语义见 `parseWeeklyDigestHour`）。 */
export const resolveWeeklyDigestHour = (raw: string | undefined = process.env[WEEKLY_DIGEST_HOUR_ENV]): number =>
    parseWeeklyDigestHour(raw).hour

/** 本地日期部分转 UTC 零点：用于与运行时时区 / DST 解耦的日序计算。 */
const toLocalDateUtc = (date: Date): Date =>
    new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))

/**
 * ISO 8601 周键（`YYYY-Www`），按服务器本地日历日期计算。
 * 算法：把本地日期搬到 UTC 零点，取该周周四所在年份作为 ISO 年，再算周序。
 */
export const resolveIsoWeekKey = (date: Date): string => {
    const thursday = toLocalDateUtc(date)
    const dayOfWeek = thursday.getUTCDay() || 7 // 周一 = 1 … 周日 = 7
    thursday.setUTCDate(thursday.getUTCDate() + 4 - dayOfWeek)
    const isoYear = thursday.getUTCFullYear()
    const yearStart = new Date(Date.UTC(isoYear, 0, 1))
    const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
    return `${isoYear}-W${String(week).padStart(2, '0')}`
}

export interface WeeklyDigestSlot {
    /** 本触发窗口所属 ISO 周（`2026-W43`）。 */
    weekKey: string
    /** 本窗口起点（服务器本地时间：周一 `hour`:00）。 */
    slotStart: Date
    /** 下一窗口起点（本地时间：下周一 `hour`:00）。 */
    nextSlotStart: Date
}

/** 计算包含 `now` 的那一周的触发窗口（周一起点 + 下一周起点）。 */
export const resolveWeeklyDigestSlot = (now: Date, hour: number): WeeklyDigestSlot => {
    const daysSinceMonday = (now.getDay() + 6) % 7 // 周一 = 0 … 周日 = 6
    const slotStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, hour, 0, 0, 0)
    const nextSlotStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday + 7, hour, 0, 0, 0)
    return {
        weekKey: resolveIsoWeekKey(slotStart),
        slotStart,
        nextSlotStart,
    }
}

/** `now` 是否落在本周触发窗口内（含起点，24 小时后关闭）。 */
export const isWeeklyDigestDue = (now: Date, hour: number): boolean => {
    const { slotStart } = resolveWeeklyDigestSlot(now, hour)
    const elapsed = now.getTime() - slotStart.getTime()
    return elapsed >= 0 && elapsed < WEEKLY_DIGEST_CATCH_UP_MS
}
