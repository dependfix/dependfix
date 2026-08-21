import { describe, expect, it } from 'vitest'
import { previewCron, type CronPreviewResult } from './cron-preview'

/** 取首个 nextRun：result.isValid 为 true 时必有；测试断言前置，确保非空且符合预期 */
function firstRun(result: CronPreviewResult): Date {
    if (!result.isValid || !result.nextRuns || result.nextRuns.length === 0) {
        throw new Error(`expected nextRuns non-empty, got ${JSON.stringify(result)}`)
    }
    return result.nextRuns[0]!
}

describe('previewCron', () => {
    describe('校验口径', () => {
        it('空串 → empty', () => {
            expect(previewCron('')).toEqual({ isValid: false, errorKey: 'empty' })
        })

        it('全空白 → empty', () => {
            expect(previewCron('   ')).toEqual({ isValid: false, errorKey: 'empty' })
            expect(previewCron('\t \n')).toEqual({ isValid: false, errorKey: 'empty' })
        })

        it('字段数非法 → invalidFieldCount', () => {
            // 3 段
            expect(previewCron('0 2 *').errorKey).toBe('invalidFieldCount')
            // 4 段
            expect(previewCron('0 2 * *').errorKey).toBe('invalidFieldCount')
            // 7 段
            expect(previewCron('0 2 * * 1 2 3').errorKey).toBe('invalidFieldCount')
        })

        it('非法 cron 语法 → parseError', () => {
            const result = previewCron('0 2 * * foo')
            expect(result.isValid).toBe(false)
            expect(result.errorKey).toBe('parseError')
            expect(result.errorDetail).toBeDefined()
        })
    })

    describe('合法 cron', () => {
        it('5 段 cron（每周一 02:00）→ 返回 next 3 次且时间正确', () => {
            const result = previewCron('0 2 * * 1')
            expect(result.isValid).toBe(true)
            expect(result.nextRuns).toBeDefined()
            expect(result.nextRuns).toHaveLength(3)
            // 三次都应该是周一(getDay: 0=Sun, 1=Mon)
            for (const date of result.nextRuns!) {
                expect(date.getDay()).toBe(1)
                expect(date.getHours()).toBe(2)
                expect(date.getMinutes()).toBe(0)
            }
            // 三次触发应该是相邻的周一（间隔 7 天）
            const diff = firstRun(result).getTime() - result.nextRuns![1]!.getTime()
            expect(Math.abs(diff)).toBe(7 * 24 * 60 * 60 * 1000)
        })

        it('6 段 cron（含秒）→ 返回 next 3 次', () => {
            const result = previewCron('0 0 2 * * 1')
            expect(result.isValid).toBe(true)
            expect(result.nextRuns).toHaveLength(3)
        })

        it('count 自定义生效（count=5）', () => {
            const result = previewCron('0 2 * * 1', { count: 5 })
            expect(result.isValid).toBe(true)
            expect(result.nextRuns).toHaveLength(5)
        })

        it('count 默认值 = 3', () => {
            const result = previewCron('0 2 * * 1')
            expect(result.nextRuns).toHaveLength(3)
        })
    })

    describe('时区切换', () => {
        it('同一 cron 在 UTC 与 Asia/Shanghai 下 nextRun 偏移 8 小时', () => {
            const utcResult = previewCron('0 2 * * 1', { timezone: 'UTC' })
            const shResult = previewCron('0 2 * * 1', { timezone: 'Asia/Shanghai' })
            expect(utcResult.isValid).toBe(true)
            expect(shResult.isValid).toBe(true)
            // Shanghai 在 UTC+8：Asia/Shanghai 02:00 对应 UTC 18:00（前一日）
            expect(firstRun(shResult).getUTCHours()).toBe(18)
            // UTC 02:00 对应 Shanghai 10:00（同日）
            expect(firstRun(utcResult).getUTCHours()).toBe(2)
            // Shanghai 的 02:00（UTC 18:00）一定不在 UTC 02:00 这个时刻
            expect(firstRun(shResult).getTime()).not.toBe(firstRun(utcResult).getTime())
            // 至少差 8 小时（UTC+8 偏移）；实际可能差 8 或 16 小时（跨日边界）
            const diffHours = Math.abs(firstRun(shResult).getTime() - firstRun(utcResult).getTime()) / 1000 / 60 / 60
            expect(diffHours % 24).toBe(8)
        })

        it('空 timezone 用浏览器本地（不传 timezone）→ 与显式 null 等价', () => {
            const r1 = previewCron('0 2 * * 1')
            const r2 = previewCron('0 2 * * 1', { timezone: null })
            expect(r1.isValid).toBe(true)
            expect(r2.isValid).toBe(true)
            // 不传 timezone 与 timezone: null 的 nextRun 应当一致
            expect(firstRun(r1).getTime()).toBe(firstRun(r2).getTime())
        })
    })
})
