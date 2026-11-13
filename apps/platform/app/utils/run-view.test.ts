import { ALERT_SEVERITIES, SKIP_REASONS, VERIFICATION_SKIP_REASONS } from '@dependfix/core'
import { describe, expect, it } from 'vitest'
import {
    alertsFound,
    deliverySkipDraftPrs,
    deliverySkipIssues,
    deliverySkipped,
    environmentalFailureCount,
    formatBuildLabel,
    runDelivery,
    formatBytes,
    isRunResultMissing,
    SEVERITY_DISPLAY_ORDER,
    SKIP_REASON_ORDER,
    VERIFICATION_SKIP_REASON_ORDER,
    skippedBreakdown,
    skippedTotal,
    summaryNumber,
    totalDiscoveredAlerts,
    truncatedBreakdown,
    truncatedTotal,
    unfixedAlerts,
    verificationSkipBreakdown,
    verificationSkipReasonLabel,
    verificationSkipSummary,
    verificationsSkipped,
} from './run-view'

/**
 * run-view 工具测试：`alertsFound` 读取契约。
 *
 * 背景：失败 run 现落 summaryJson 快照（告警数如实 / 已修复归零），运行列表「告警数」列经
 * `alertsFound(row.summary)` 读取 `summary.alertsFound`。本用例锁定该读取口径，防止键名漂移
 * 导致失败 run / 各类 run 的告警数恒显 0。
 */
describe('alertsFound', () => {
    it('读取 summary.alertsFound（失败 run 快照如实展示告警数）', () => {
        expect(alertsFound({ alertsFound: 5, alertsFixed: 0 })).toBe(5)
    })

    it('summary 为 null / undefined → 0', () => {
        expect(alertsFound(null)).toBe(0)
        expect(alertsFound(undefined as unknown as Record<string, unknown> | null)).toBe(0)
    })

    it('alertsFound 非有限数字 → 0（脏数据防御）', () => {
        expect(alertsFound({ alertsFound: 'x' })).toBe(0)
        expect(alertsFound({ alertsFound: Number.POSITIVE_INFINITY })).toBe(0)
        expect(alertsFound({})).toBe(0)
    })
})

describe('summaryNumber', () => {
    it('读取非负数值，负数 / 非数字 / 缺失降级为 0', () => {
        expect(summaryNumber({ alertsFixed: 3 }, 'alertsFixed')).toBe(3)
        expect(summaryNumber({ alertsFixed: -1 }, 'alertsFixed')).toBe(0)
        expect(summaryNumber({ alertsFixed: '3' }, 'alertsFixed')).toBe(0)
        expect(summaryNumber({ alertsFixed: Number.NaN }, 'alertsFixed')).toBe(0)
        expect(summaryNumber({ alertsFixed: Number.POSITIVE_INFINITY }, 'alertsFixed')).toBe(0)
        expect(summaryNumber(null, 'alertsFixed')).toBe(0)
    })
})

describe('unfixedAlerts', () => {
    it('found − fixed − converged，converged 不计入未修复', () => {
        expect(unfixedAlerts({ alertsFound: 5, alertsFixed: 2, alertsConverged: 1 })).toBe(2)
    })

    it('旧 summary 缺字段时按 0 降级，结果不为负', () => {
        expect(unfixedAlerts({ alertsFound: 3 })).toBe(3)
        expect(unfixedAlerts({ alertsFound: 1, alertsFixed: 3 })).toBe(0)
        expect(unfixedAlerts(null)).toBe(0)
    })

    it('优先读告警级 alertsUnfixed（同包多告警共用一个 action）', () => {
        expect(unfixedAlerts({ alertsFound: 2, alertsFixed: 1, alertsConverged: 0, alertsUnfixed: 0 })).toBe(0)
        expect(unfixedAlerts({ alertsFound: 2, alertsFixed: 1, alertsConverged: 0, alertsUnfixed: 1 })).toBe(1)
    })
})

describe('environmentalFailureCount', () => {
    it('优先读落库列，列缺失时回退 summary', () => {
        expect(environmentalFailureCount({ status: 'completed', summary: { environmentalFailures: 2 }, environmentalFailureCount: 3 })).toBe(3)
        expect(environmentalFailureCount({ status: 'completed', summary: { environmentalFailures: 2 }, environmentalFailureCount: null })).toBe(2)
    })

    it('两处都缺失 / 非法时返回 0', () => {
        expect(environmentalFailureCount({ status: 'completed', summary: null })).toBe(0)
        expect(environmentalFailureCount({ status: 'completed', summary: { environmentalFailures: '2' } })).toBe(0)
        expect(environmentalFailureCount({ status: 'completed', summary: null, environmentalFailureCount: -1 })).toBe(0)
    })
})

describe('isRunResultMissing', () => {
    it('失败且无 summary → 结果缺失', () => {
        expect(isRunResultMissing({ status: 'failed', summary: null })).toBe(true)
    })

    it('execution_timeout 即使有 summary 也按结果缺失展示', () => {
        expect(isRunResultMissing({
            status: 'failed',
            summary: { alertsFound: 1 },
            error: { code: 'execution_timeout' },
        })).toBe(true)
    })

    it('pending / running / dispatched 属于尚未就绪，不是缺失', () => {
        expect(isRunResultMissing({ status: 'pending', summary: null })).toBe(false)
        expect(isRunResultMissing({ status: 'running', summary: null })).toBe(false)
        expect(isRunResultMissing({ status: 'dispatched', summary: null })).toBe(false)
    })

    it('有结果的 completed / degraded 正常展示', () => {
        expect(isRunResultMissing({ status: 'completed', summary: { alertsFound: 0 } })).toBe(false)
        expect(isRunResultMissing({ status: 'degraded', summary: { alertsFound: 0 } })).toBe(false)
    })

    it('失败但有可信结果（非超时）不算结果缺失', () => {
        expect(isRunResultMissing({
            status: 'failed',
            summary: { alertsFound: 2 },
            error: { code: 'engine_exit_2' },
        })).toBe(false)
    })

    it('completed 但 summary 缺失按数据异常展示结果缺失', () => {
        expect(isRunResultMissing({ status: 'completed', summary: undefined })).toBe(true)
    })
})


describe('skippedBreakdown / truncatedBreakdown', () => {
    it('按原因 / 严重级别稳定顺序展开，只返回 >0 项', () => {
        const summary = {
            alertsSkipped: 6,
            alertsSkippedByReason: { 'not-fixable': 2, 'cross-major': 4 },
            alertsTruncated: 3,
            alertsTruncatedBySeverity: { medium: 1, critical: 2 },
        }
        expect(skippedBreakdown(summary)).toEqual([
            { key: 'cross-major', count: 4 },
            { key: 'not-fixable', count: 2 },
        ])
        expect(truncatedBreakdown(summary)).toEqual([
            { key: 'critical', count: 2 },
            { key: 'medium', count: 1 },
        ])
        expect(skippedTotal(summary)).toBe(6)
        expect(truncatedTotal(summary)).toBe(3)
    })

    it('旧 summaryJson 缺分组字段时回退 other，总数不丢', () => {
        expect(skippedBreakdown({ alertsSkipped: 5 })).toEqual([{ key: 'other', count: 5 }])
        expect(truncatedBreakdown({ alertsTruncated: 4 })).toEqual([{ key: 'other', count: 4 }])
        expect(skippedBreakdown({ alertsSkipped: 5, alertsSkippedByReason: { 'cross-major': 2 } }))
            .toEqual([{ key: 'cross-major', count: 2 }, { key: 'other', count: 3 }])
    })

    it('无跳过 / 截断时返回空数组', () => {
        expect(skippedBreakdown({})).toEqual([])
        expect(truncatedBreakdown(null)).toEqual([])
    })

    it('totalDiscoveredAlerts 把截断计入总数', () => {
        expect(totalDiscoveredAlerts({ alertsFound: 20, alertsTruncated: 6 })).toBe(26)
    })
})


describe('展示顺序与 core 枚举同步', () => {
    it('跳过原因 / 严重级别顺序与 core 单一事实源一致', () => {
        expect(SKIP_REASON_ORDER).toEqual(SKIP_REASONS)
        expect(SEVERITY_DISPLAY_ORDER).toEqual(ALERT_SEVERITIES)
        expect(VERIFICATION_SKIP_REASON_ORDER).toEqual(VERIFICATION_SKIP_REASONS)
    })

    it('同告警重复失败计入跳过分组（平台视图与 core 同键）', () => {
        const rows = skippedBreakdown({ alertsSkipped: 2, alertsSkippedByReason: { 'repeated-failure': 2 } })
        expect(rows).toEqual([{ key: 'repeated-failure', count: 2 }])
    })
})

describe('formatBytes', () => {
    it('formats byte counts and keeps null / invalid as em dash', () => {
        expect(formatBytes(0)).toBe('0 B')
        expect(formatBytes(1024)).toBe('1.0 KiB')
        expect(formatBytes(8 * 1024 ** 3)).toBe('8.0 GiB')
        expect(formatBytes(null)).toBe('—')
        expect(formatBytes(Number.NaN)).toBe('—')
        expect(formatBytes(-1)).toBe('—')
    })
})

describe('formatBuildLabel', () => {
    it('拼出版本与短 commit', () => {
        expect(formatBuildLabel('2026.10.23', 'deadbeefcafe', '未知'))
            .toEqual({ label: '2026.10.23 · deadbeef', unknown: false })
    })

    it('未注入 / 存量行统一显示「未知」（unknown 与 null 同口径）', () => {
        expect(formatBuildLabel('unknown', 'unknown', '未知')).toEqual({ label: '未知', unknown: true })
        expect(formatBuildLabel(null, null, '未知')).toEqual({ label: '未知', unknown: true })
        expect(formatBuildLabel(undefined, undefined, '未知')).toEqual({ label: '未知', unknown: true })
        expect(formatBuildLabel('', '', '未知')).toEqual({ label: '未知', unknown: true })
    })

    it('只有一侧可读时不拼 unknown', () => {
        expect(formatBuildLabel('unknown', 'deadbeefcafe', '未知'))
            .toEqual({ label: 'deadbeef', unknown: false })
        expect(formatBuildLabel('2026.10.23', 'unknown', '未知'))
            .toEqual({ label: '2026.10.23', unknown: false })
        expect(formatBuildLabel('2026.10.23', null, '未知'))
            .toEqual({ label: '2026.10.23', unknown: false })
    })
})

describe('verificationsSkipped', () => {
    it('读取验证跳过计数与原因分组（缺失 / 脏数据降级）', () => {
        expect(verificationsSkipped({ verificationsSkipped: 2 })).toBe(2)
        expect(verificationsSkipped({})).toBe(0)
        expect(verificationsSkipped(null)).toBe(0)
        expect(verificationSkipBreakdown({
            verificationsSkipped: 3,
            verificationSkippedByReason: { 'no-write': 2, budget: 1, other: 9 },
        })).toEqual([
            { key: 'budget', count: 1 },
            { key: 'no-write', count: 2 },
        ])
        expect(verificationSkipBreakdown({})).toEqual([])
    })

    it('原因文案使用静态 i18n 键', () => {
        const t = (key: string) => `t:${key}`
        expect(verificationSkipReasonLabel('budget', t)).toBe('t:runs.verificationSkipReason.budget')
        expect(verificationSkipReasonLabel('no-write', t)).toBe('t:runs.verificationSkipReason.noWrite')
        expect(verificationSkipReasonLabel('other', t)).toBe('other')
        expect(verificationSkipSummary({ verificationSkippedByReason: { 'no-write': 2, budget: 1 } }, t))
            .toBe('t:runs.verificationSkipReason.budget: 1 · t:runs.verificationSkipReason.noWrite: 2')
        expect(verificationSkipSummary({}, t)).toBe('')
    })
})

describe('deliverySkipped', () => {
    it('读取交付跳过计数（缺失 / 脏数据 → 0）', () => {
        expect(deliverySkipped({ deliverySkipped: 2 })).toBe(2)
        expect(deliverySkipped({})).toBe(0)
        expect(deliverySkipped(null)).toBe(0)
        expect(deliverySkipped({ deliverySkipped: 'x' })).toBe(0)
    })

    it('载体计数分别读取 issue / draft PR', () => {
        expect(deliverySkipIssues({ deliverySkipIssues: 1 })).toBe(1)
        expect(deliverySkipDraftPrs({ deliverySkipDraftPrs: 1 })).toBe(1)
        expect(deliverySkipIssues({})).toBe(0)
        expect(deliverySkipDraftPrs({})).toBe(0)
    })

    it('reads the self-contained delivery record and rejects malformed values', () => {
        expect(runDelivery({
            delivery: {
                status: 'pushed',
                deliveredBy: 'engine',
                branch: 'dependfix/auto-fix-abcd1234',
                commitSha: 'deadbeef',
            },
        })).toEqual({
            status: 'pushed',
            deliveredBy: 'engine',
            branch: 'dependfix/auto-fix-abcd1234',
            commitSha: 'deadbeef',
        })
        expect(runDelivery({ delivery: { status: 'pushed' } })).toBeUndefined()
        expect(runDelivery({ delivery: 'pushed' })).toBeUndefined()
        expect(runDelivery(null)).toBeUndefined()
    })
})
