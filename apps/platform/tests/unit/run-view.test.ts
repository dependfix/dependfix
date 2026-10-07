import { describe, expect, it } from 'vitest'
import {
    alertsFound,
    failureKindLabel,
    failureStageLabel,
    formatRunDuration,
    RUN_FAILURE_KIND_OPTIONS,
    RUN_FAILURE_STAGE_OPTIONS,
    runExecutorLabel,
    runModeLabel,
    runThresholdLabel,
    shortRunId,
} from '../../app/utils/run-view'
import { RUN_FAILURE_KINDS, RUN_FAILURE_STAGES } from '#server/services/run-failure-classify'

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

    describe('failureStageLabel / failureKindLabel', () => {
        it('阶段选项与服务端分类枚举同序（筛选控件取值来源）', () => {
            expect(RUN_FAILURE_STAGE_OPTIONS).toEqual([
                'source', 'clone', 'install', 'fix', 'verify', 'deliver', 'runtime', 'cleanup', 'unknown',
            ])
            expect(RUN_FAILURE_KIND_OPTIONS).toEqual(['transient', 'deterministic', 'unknown'])
        })

        it('前端枚举与服务端单一事实源严格一致（防双份枚举静默漂移）', () => {
            expect(RUN_FAILURE_STAGE_OPTIONS).toEqual(RUN_FAILURE_STAGES)
            expect(RUN_FAILURE_KIND_OPTIONS).toEqual(RUN_FAILURE_KINDS)
        })

        it('已知阶段 / 建议返回 i18n key', () => {
            expect(failureStageLabel('verify', t)).toBe('runs.failureStage.verify')
            expect(failureKindLabel('transient', t)).toBe('runs.failureKind.transient')
        })

        it('每个阶段 / 建议选项都有对应 i18n key（避免下拉出现裸枚举值）', () => {
            for (const stage of RUN_FAILURE_STAGE_OPTIONS) {
                expect(failureStageLabel(stage, t)).toBe(`runs.failureStage.${stage}`)
            }
            for (const kind of RUN_FAILURE_KIND_OPTIONS) {
                expect(failureKindLabel(kind, t)).toBe(`runs.failureKind.${kind}`)
            }
        })

        it('null / undefined / 空串返回 null', () => {
            expect(failureStageLabel(null, t)).toBeNull()
            expect(failureStageLabel(undefined, t)).toBeNull()
            expect(failureStageLabel('', t)).toBeNull()
            expect(failureKindLabel(null, t)).toBeNull()
        })

        it('未知值原样返回（兜底不隐藏原始信息）', () => {
            expect(failureStageLabel('future-stage', t)).toBe('future-stage')
            expect(failureKindLabel('future-kind', t)).toBe('future-kind')
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
