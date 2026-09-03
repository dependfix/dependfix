/**
 * cron 表达式预览工具（前端版；见 todo.md §M12 C65-C1）。
 *
 * 设计：
 * - 复用 apps/platform/package.json 已有的 cron-parser 5.x（server schemas/schedule.ts 同步使用），
 *   不新增第三方依赖；与 server `cronIsValid` 校验口径对齐（5 段或 6 段 + CronExpressionParser.parse 成功）。
 * - 错误类型用 i18n key 字符串（empty / invalidFieldCount / parseError），调用方按 key 翻译；
 *   原始错误信息仅作 errorDetail 透出（开发态 console.warn 可观测）。
 * - 时区：传 IANA 名（如 'Asia/Shanghai'）→ cron-parser 按该时区计算触发时间；
 *   空/undefined → 浏览器本地时区（与 cron-parser 默认行为一致）。
 * - 触发次数默认 3（"next 3 runs"），用户最关心"什么时候会触发"而非完整描述。
 *
 * 关联 todo：todo.md §M12 C65-C1（与 todo.md §M12 C65-C2 共享 cron preview 状态）
 *
 * 测试 helper 模式评估（todo.md §M24.3 S3）：**不适用** setupMemoryDatabase / ensureDatabaseInitialized
 * 等 server 端 DB helper —— cron-preview 是纯前端工具函数（无 DB / 无 server 端 import）；
 * 时区切换测试走 vitest `vi.useFakeTimers` + `vi.setSystemTime`（见 cron-preview.test.ts "时区切换" describe 块，
 * M23.4 commit `df4ba9b` 落地 + M24.3 闭环），与 server test helper 模式正交。
 */
import { CronExpressionParser } from 'cron-parser'

/** 错误类型（i18n key 前缀，调用方用 `t('schedules.cronInvalid.empty')` 等） */
export type CronPreviewErrorKey = 'empty' | 'invalidFieldCount' | 'parseError'

export interface CronPreviewResult {
    /** 是否合法（空串 = false） */
    isValid: boolean
    /** 错误类型（仅 isValid=false 时存在） */
    errorKey?: CronPreviewErrorKey
    /** 错误原始信息（仅开发态使用，不直接渲染给用户） */
    errorDetail?: string
    /** 下 N 次触发时间（仅 isValid=true 时存在；UTC Date 对象，按 timezone 字段解释） */
    nextRuns?: Date[]
}

export interface PreviewCronOptions {
    /** IANA 时区名（如 'Asia/Shanghai'）；空/undefined = 浏览器本地时区 */
    timezone?: string | null
    /** 计算触发次数，默认 3 */
    count?: number
}

/**
 * 计算 cron 下 N 次触发时间。
 *
 * 校验口径（与 server `cronIsValid` 完全对齐）：
 * - 空串 / 全空白 → empty
 * - 字段数 ≠ 5 且 ≠ 6 → invalidFieldCount
 * - CronExpressionParser.parse 抛错 → parseError
 *
 * @param cron cron 表达式（5 段或 6 段）
 * @param options.timezone IANA 时区；空/undefined 用浏览器本地时区
 * @param options.count 计算次数（默认 3）
 */
export function previewCron(cron: string, options: PreviewCronOptions = {}): CronPreviewResult {
    const { timezone, count = 3 } = options
    const trimmed = cron.trim()
    if (!trimmed) {
        return { isValid: false, errorKey: 'empty' }
    }
    const fields = trimmed.split(/\s+/)
    if (fields.length !== 5 && fields.length !== 6) {
        return { isValid: false, errorKey: 'invalidFieldCount' }
    }
    try {
        const intervalOptions: Parameters<typeof CronExpressionParser.parse>[1] = {}
        if (timezone) {
            intervalOptions.tz = timezone
        }
        const interval = CronExpressionParser.parse(trimmed, intervalOptions)
        const nextRuns: Date[] = []
        for (let i = 0; i < count; i++) {
            nextRuns.push(interval.next().toDate())
        }
        return { isValid: true, nextRuns }
    } catch (e) {
        return { isValid: false, errorKey: 'parseError', errorDetail: (e as Error).message }
    }
}
