import { describe, expect, it } from 'vitest'
import { alertsFound } from './run-view'

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
