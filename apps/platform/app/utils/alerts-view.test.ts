import { describe, expect, it, vi } from 'vitest'
import {
    alertsFixStatusLabel,
    alertsRuleIdTagSeverity,
    alertsRunStatusSeverity,
    alertsSeverityTagSeverity,
} from './alerts-view'

/**
 * alerts 视图 Tag 颜色 + 文案工具测试（todo.md §M16.2 抽出）。
 *
 * 设计：4 个 switch 函数 + 1 个对象映射函数，覆盖每个分支（含 default）。
 * 同目录其它 utility（cron-preview / dashboard-charts / sort-helpers 等）均采用
 * 纯函数 + describe 嵌套 + it 颗粒度的测试结构，保持一致风格。
 */

describe('alerts-view 纯函数', () => {
    describe('alertsSeverityTagSeverity', () => {
        it('critical → danger（PrimeVue Tag severity）', () => {
            expect(alertsSeverityTagSeverity('critical')).toBe('danger')
        })

        it('high → warn', () => {
            expect(alertsSeverityTagSeverity('high')).toBe('warn')
        })

        it('medium → info', () => {
            expect(alertsSeverityTagSeverity('medium')).toBe('info')
        })

        it('low / unknown 等非枚举值 → secondary（default 分支）', () => {
            expect(alertsSeverityTagSeverity('low')).toBe('secondary')
            expect(alertsSeverityTagSeverity('unknown')).toBe('secondary')
            expect(alertsSeverityTagSeverity('')).toBe('secondary')
        })
    })

    describe('alertsRuleIdTagSeverity（按 source 区分 GHSA/CVE/CodeQL 等 ruleId Tag 颜色）', () => {
        it('dependabot → success', () => {
            expect(alertsRuleIdTagSeverity('dependabot')).toBe('success')
        })

        it('pnpm-audit → warn', () => {
            expect(alertsRuleIdTagSeverity('pnpm-audit')).toBe('warn')
        })

        it('code-scanning → info', () => {
            expect(alertsRuleIdTagSeverity('code-scanning')).toBe('info')
        })

        it('code-quality → contrast', () => {
            expect(alertsRuleIdTagSeverity('code-quality')).toBe('contrast')
        })

        it('未知 source → secondary（default 分支，防御未来新增 source 类型）', () => {
            expect(alertsRuleIdTagSeverity('unknown-source')).toBe('secondary')
            expect(alertsRuleIdTagSeverity('')).toBe('secondary')
        })
    })

    describe('alertsRunStatusSeverity（dedupe 详情侧栏 RunDetailView 状态映射）', () => {
        it('completed → success', () => {
            expect(alertsRunStatusSeverity('completed')).toBe('success')
        })

        it('failed → danger', () => {
            expect(alertsRunStatusSeverity('failed')).toBe('danger')
        })

        it('dispatched → info', () => {
            expect(alertsRunStatusSeverity('dispatched')).toBe('info')
        })

        it('pending / running / degraded 等非枚举值 → warn（default 分支）', () => {
            expect(alertsRunStatusSeverity('pending')).toBe('warn')
            expect(alertsRunStatusSeverity('running')).toBe('warn')
            expect(alertsRunStatusSeverity('degraded')).toBe('warn')
            expect(alertsRunStatusSeverity('')).toBe('warn')
        })
    })

    describe('alertsFixStatusLabel（fixStatus → i18n 文案）', () => {
        // 简化的 translator mock：直接返回 key，便于断言 i18n key 调用正确性
        // 真实 i18n 文案在 apps/platform/i18n/locales/*.json 维护，本测试只验证映射
        const t = vi.fn((key: string) => `t(${key})`) as unknown as (key: string) => string

        it('success → common.fixStatus.success', () => {
            expect(alertsFixStatusLabel('success', t)).toBe('t(common.fixStatus.success)')
        })

        it('failed → common.fixStatus.failed', () => {
            expect(alertsFixStatusLabel('failed', t)).toBe('t(common.fixStatus.failed)')
        })

        it('skipped → common.fixStatus.skipped', () => {
            expect(alertsFixStatusLabel('skipped', t)).toBe('t(common.fixStatus.skipped)')
        })

        it('converged → common.fixStatus.converged', () => {
            expect(alertsFixStatusLabel('converged', t)).toBe('t(common.fixStatus.converged)')
        })

        it('未知 status → common.fixStatus.pending（?? fallback 分支）', () => {
            expect(alertsFixStatusLabel('unknown-status', t)).toBe('t(common.fixStatus.pending)')
            expect(alertsFixStatusLabel('', t)).toBe('t(common.fixStatus.pending)')
        })
    })
})
