import { z } from 'zod'
import { CronExpressionParser } from 'cron-parser'
import type { ScheduleSelectorKind } from '#server/entities/schedule'

/**
 * cron 表达式校验（cron-parser v5：CronExpressionParser.parse 自动识别 5/6 段）。
 * 注意：parse 本身不严格校验字段数（空串/3 段也会返回成功），
 * 必须先按空白切分确认字段数为 5（分 时 日 月 周）或 6（秒 分 时 日 月 周）。
 */
export const cronIsValid = (cron: string): boolean => {
    const trimmed = cron.trim()
    if (!trimmed) {
        return false
    }
    const fields = trimmed.split(/\s+/)
    if (fields.length !== 5 && fields.length !== 6) {
        return false
    }
    try {
        CronExpressionParser.parse(trimmed)
        return true
    } catch {
        return false
    }
}

/** IANA 时区白名单（Intl.supportedValuesOf；旧运行时无此 API 时跳过校验） */
const timezones = new Set<string>()
try {
    for (const tz of Intl.supportedValuesOf('timeZone')) {
        timezones.add(tz)
    }
} catch {
    // 不支持 supportedValuesOf 的运行时：不校验时区（空集合视为跳过）
}

/** IANA 时区名称校验（undefined/空视为合法——服务器本地时区语义；UTC 为特殊值不在 supportedValuesOf 列表，特判接受） */
export const isValidTimezone = (timezone: string | undefined | null): boolean => {
    if (!timezone) {
        return true
    }
    if (timezone === 'UTC') {
        return true
    }
    return timezones.size === 0 || timezones.has(timezone)
}

/** selectorJson JSON 解析：null 表示空/缺失，undefined 表示 JSON 非法 */
const parseSelectorJson = (raw: string | undefined): unknown => {
    if (!raw?.trim()) {
        return null
    }
    try {
        return JSON.parse(raw)
    } catch {
        return undefined
    }
}

/** 定时计划创建校验（Zod）。selectorJson 为 JSON 字符串，按 selectorKind 交叉校验。 */
export const scheduleSchema = z.object({
    name: z.string().trim().min(1, '计划名称不能为空').max(100),
    cron: z.string().max(100).refine(cronIsValid, '无效的 cron 表达式'),
    timezone: z.string().trim().max(50).refine(isValidTimezone, '无效的时区名称').optional(),
    selectorKind: z.enum(['all', 'organization', 'tag', 'explicit']),
    selectorJson: z.string().optional(),
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'all']).default('high'),
    enabled: z.boolean().default(true),
}).superRefine((data, ctx) => {
    const parsed = parseSelectorJson(data.selectorJson)
    if (parsed === undefined) {
        ctx.addIssue({
            code: 'custom',
            path: ['selectorJson'],
            message: 'selectorJson 不是合法的 JSON 字符串',
        })
        return
    }
    const obj = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    switch (data.selectorKind as ScheduleSelectorKind) {
        case 'organization': {
            const organizationId = obj?.organizationId
            if (typeof organizationId !== 'string' || !organizationId.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['selectorJson'],
                    message: '选择策略 organization 需要 selectorJson.organizationId',
                })
            }
            break
        }
        case 'tag': {
            const tag = obj?.tag
            if (typeof tag !== 'string' || !tag.trim()) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['selectorJson'],
                    message: '选择策略 tag 需要 selectorJson.tag',
                })
            }
            break
        }
        case 'explicit': {
            const repositoryIds = obj?.repositoryIds
            if (!Array.isArray(repositoryIds) || repositoryIds.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['selectorJson'],
                    message: '选择策略 explicit 需要 selectorJson.repositoryIds（非空数组）',
                })
            } else if (repositoryIds.length > 100) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['selectorJson'],
                    message: 'explicit 策略单次最多选择 100 个仓库',
                })
            } else if (!repositoryIds.every((id) => typeof id === 'string' && id.trim().length > 0 && id.trim().length <= 36)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['selectorJson'],
                    message: 'explicit 策略的 repositoryIds 必须是非空字符串（≤ 36 字符）',
                })
            }
            break
        }
        default:
            // all：selectorJson 忽略（可缺省）
            break
    }
})

/** 手动批量扫描校验（Zod）：勾选仓库列表 + 扫描参数 */
export const batchScanSchema = z.object({
    repositoryIds: z.array(z.string().trim().min(1).max(36)).min(1, '至少选择一个仓库').max(100, '单次批量最多 100 个仓库'),
    mode: z.enum(['report-only', 'fix', 'fix-and-pr']).default('report-only'),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'all']).default('high'),
})

export type ScheduleInput = z.infer<typeof scheduleSchema>
export type BatchScanInput = z.infer<typeof batchScanSchema>
