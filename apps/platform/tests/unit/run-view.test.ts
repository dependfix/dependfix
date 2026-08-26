import { describe, expect, it } from 'vitest'
import {
    alertsFound,
    formatRunDuration,
    runExecutorLabel,
    runModeLabel,
    runThresholdLabel,
    shortRunId,
} from '../../app/utils/run-view'

const t = (key: string, params?: Record<string, string | number>) => {
    if (!params) {
        return key
    }
    const entries = Object.entries(params).map(([k, v]) => `${k}:${v}`).join(',')
    return `${key}(${entries})`
}

describe('utils/run-view', () => {
    describe('shortRunId', () => {
        it('截取 ID 前 8 位', () => {
            expect(shortRunId('12345678-abcdefgh-ijklmnop')).toBe('12345678')
        })

        it('当 ID 长度不足 8 时返回原值', () => {
            expect(shortRunId('run-1')).toBe('run-1')
        })
    })

    describe('alertsFound', () => {
        it('读取有效数字', () => {
            expect(alertsFound({ alertsFound: 5 })).toBe(5)
        })

        it('summary 为 null 时返回 0', () => {
            expect(alertsFound(null)).toBe(0)
        })

        it('字段缺失或非数字时返回 0', () => {
            expect(alertsFound({})).toBe(0)
            expect(alertsFound({ alertsFound: '5' })).toBe(0)
            expect(alertsFound({ alertsFound: Number.NaN })).toBe(0)
            expect(alertsFound({ alertsFound: Number.POSITIVE_INFINITY })).toBe(0)
        })
    })

    describe('runModeLabel', () => {
        it('报告模式返回国际化 key', () => {
            expect(runModeLabel('report-only', t)).toBe('common.scanMode.reportOnly')
        })

        it('未知模式返回原值', () => {
            expect(runModeLabel('custom', t)).toBe('custom')
        })
    })

    describe('runExecutorLabel', () => {
        it('github-action 走 repos.githubAction', () => {
            expect(runExecutorLabel('github-action', t)).toBe('repos.githubAction')
        })

        it('sandbox 走 repos.sandboxContainer', () => {
            expect(runExecutorLabel('sandbox', t)).toBe('repos.sandboxContainer')
        })

        it('其它走平台容器', () => {
            expect(runExecutorLabel('container', t)).toBe('repos.platformContainer')
        })
    })

    describe('runThresholdLabel', () => {
        it('all 走 common.severity.all', () => {
            expect(runThresholdLabel('all', t)).toBe('common.severity.all')
        })

        it('其他原样返回', () => {
            expect(runThresholdLabel('high', t)).toBe('high')
        })
    })

    describe('formatRunDuration', () => {
        it('缺任一字段返回破折号', () => {
            expect(formatRunDuration(null, '2026-08-26T10:00:00.000Z', t)).toBe('—')
            expect(formatRunDuration('2026-08-26T10:00:00.000Z', null, t)).toBe('—')
        })

        it('结束早于开始返回破折号', () => {
            expect(formatRunDuration('2026-08-26T10:00:12.000Z', '2026-08-26T10:00:00.000Z', t)).toBe('—')
        })

        it('非法日期返回破折号', () => {
            expect(formatRunDuration('not-a-date', '2026-08-26T10:00:00.000Z', t)).toBe('—')
        })

        it('正常区间返回包含秒数 i18n key', () => {
            const result = formatRunDuration(
                '2026-08-26T10:00:00.000Z',
                '2026-08-26T10:00:12.345Z',
                t,
            )
            expect(result).toContain('alerts.runDurationSeconds(seconds:')
        })
    })
})
