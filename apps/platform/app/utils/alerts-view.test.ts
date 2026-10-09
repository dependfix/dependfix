import { describe, expect, it, vi } from 'vitest'
import {
    alertsFixStatusLabel,
    alertsRuleIdTone,
    alertsRunStatusTone,
    alertsSeverityTone,
    alertsStatusLabel,
    buildAlertsQuery,
    summarizePackageGroups,
    type AlertsFilters,
} from './alerts-view'

/**
 * alerts 视图 Tag 颜色 + 文案工具测试。
 *
 * 设计：4 个 switch 函数 + 1 个对象映射函数，覆盖每个分支（含 default）。
 * 同目录其它 utility（cron-preview / dashboard-charts / sort-helpers 等）均采用
 * 纯函数 + describe 嵌套 + it 颗粒度的测试结构，保持一致风格。
 */

describe('alerts-view 纯函数', () => {
    describe('alertsSeverityTone', () => {
        it('critical → danger（caomei Tag tone）', () => {
            expect(alertsSeverityTone('critical')).toBe('danger')
        })

        it('high → warning', () => {
            expect(alertsSeverityTone('high')).toBe('warning')
        })

        it('medium → primary', () => {
            expect(alertsSeverityTone('medium')).toBe('primary')
        })

        it('low / unknown 等非枚举值 → neutral（default 分支）', () => {
            expect(alertsSeverityTone('low')).toBe('neutral')
            expect(alertsSeverityTone('unknown')).toBe('neutral')
            expect(alertsSeverityTone('')).toBe('neutral')
        })
    })

    describe('alertsRuleIdTone（按 source 区分 GHSA/CVE/CodeQL 等 ruleId Tag 颜色）', () => {
        it('dependabot → success', () => {
            expect(alertsRuleIdTone('dependabot')).toBe('success')
        })

        it('pnpm-audit → warning', () => {
            expect(alertsRuleIdTone('pnpm-audit')).toBe('warning')
        })

        it('code-scanning → primary', () => {
            expect(alertsRuleIdTone('code-scanning')).toBe('primary')
        })

        it('code-quality → neutral', () => {
            expect(alertsRuleIdTone('code-quality')).toBe('neutral')
        })

        it('未知 source → neutral（default 分支，防御未来新增 source 类型）', () => {
            expect(alertsRuleIdTone('unknown-source')).toBe('neutral')
            expect(alertsRuleIdTone('')).toBe('neutral')
        })
    })

    describe('alertsRunStatusTone（dedupe 详情侧栏 RunDetailView 状态映射）', () => {
        it('completed → success', () => {
            expect(alertsRunStatusTone('completed')).toBe('success')
        })

        it('failed → danger', () => {
            expect(alertsRunStatusTone('failed')).toBe('danger')
        })

        it('dispatched → primary', () => {
            expect(alertsRunStatusTone('dispatched')).toBe('primary')
        })

        it('pending / running / degraded 等非枚举值 → warning（default 分支）', () => {
            expect(alertsRunStatusTone('pending')).toBe('warning')
            expect(alertsRunStatusTone('running')).toBe('warning')
            expect(alertsRunStatusTone('degraded')).toBe('warning')
            expect(alertsRunStatusTone('')).toBe('warning')
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

    describe('buildAlertsQuery（useAsyncData handler 共用）', () => {
        // 默认筛选：所有字段为 'all' / includeSuperseded=false，用于验证各 viewMode 行为
        const defaultFilters: AlertsFilters = {
            repositoryId: 'all',
            severity: 'all',
            source: 'all',
            includeSuperseded: false,
        }

        it('viewMode="none" 不携带 groupBy（后端等价于原始顺序）', () => {
            const query = buildAlertsQuery('none', defaultFilters)
            expect(query).not.toHaveProperty('groupBy')
        })

        it('viewMode="package" 携带 groupBy=package（rowGroup subheader 预排序）', () => {
            const query = buildAlertsQuery('package', defaultFilters)
            expect(query.groupBy).toBe('package')
        })

        it('viewMode="repository" 携带 groupBy=repository', () => {
            const query = buildAlertsQuery('repository', defaultFilters)
            expect(query.groupBy).toBe('repository')
        })

        it('filters 字段为 "all" 时不携带（与既有 fetchAlerts 行为一致）', () => {
            const query = buildAlertsQuery('package', defaultFilters)
            expect(query).not.toHaveProperty('repositoryId')
            expect(query).not.toHaveProperty('severity')
            expect(query).not.toHaveProperty('source')
        })

        it('filters 各字段非 "all" 时携带（repositoryId / severity / source）', () => {
            const query = buildAlertsQuery('package', {
                repositoryId: 'repo-1',
                severity: 'high',
                source: 'dependabot',
                includeSuperseded: false,
            })
            expect(query).toEqual({
                groupBy: 'package',
                repositoryId: 'repo-1',
                severity: 'high',
                source: 'dependabot',
            })
        })

        it('includeSuperseded=false 不携带参数（后端默认 result.supersededAt IS NULL 过滤）', () => {
            const query = buildAlertsQuery('package', { ...defaultFilters, includeSuperseded: false })
            expect(query).not.toHaveProperty('includeSuperseded')
        })

        it('includeSuperseded=true 携带 includeSuperseded=true（前端"显示已解决"开关）', () => {
            const query = buildAlertsQuery('package', { ...defaultFilters, includeSuperseded: true })
            expect(query.includeSuperseded).toBe('true')
        })

        it('全部组合：viewMode="none" + 所有 filters 都过滤 + includeSuperseded=true', () => {
            // 综合场景：用户切到原始列表 + 选定具体仓库 + 高危 + dependabot + 显示已解决
            const query = buildAlertsQuery('none', {
                repositoryId: 'repo-xyz',
                severity: 'high',
                source: 'dependabot',
                includeSuperseded: true,
            })
            expect(query).toEqual({
                repositoryId: 'repo-xyz',
                severity: 'high',
                source: 'dependabot',
                includeSuperseded: 'true',
            })
        })

        it('viewMode 与 includeSuperseded 正交：组合独立生效', () => {
            // 验证 viewMode='none' + includeSuperseded=true 也可同时生效（显示已解决不需要按组预排序）
            const query = buildAlertsQuery('none', { ...defaultFilters, includeSuperseded: true })
            expect(query).toEqual({ includeSuperseded: 'true' })
        })
    })

    describe('alertsStatusLabel（状态列：fixStatus + supersededAt → 文案）', () => {
        // 简化的 translator mock：直接返回 key，便于断言 i18n key 调用正确性
        // 真实 i18n 文案在 apps/platform/i18n/locales/*.json 维护，本测试只验证映射
        const t = vi.fn((key: string) => `t(${key})`) as unknown as (key: string) => string

        it('fixStatus=success 始终显示"已修复"（不受 supersededAt 影响，决策 1）', () => {
            expect(alertsStatusLabel({ fixStatus: 'success' }, t)).toBe('t(common.fixStatus.success)')
            expect(alertsStatusLabel({ fixStatus: 'success', supersededAt: '2026-08-26T00:00:00Z' }, t))
                .toBe('t(common.fixStatus.success)')
        })

        it('fixStatus≠success + supersededAt 非空 → "已关闭"（上游已消失，本地未修复）', () => {
            expect(alertsStatusLabel({ fixStatus: 'pending', supersededAt: '2026-08-26T00:00:00Z' }, t))
                .toBe('t(common.superseded)')
            expect(alertsStatusLabel({ fixStatus: 'failed', supersededAt: '2026-08-26T00:00:00Z' }, t))
                .toBe('t(common.superseded)')
        })

        it('fixStatus≠success + supersededAt=null → 原 fixStatus 文案（活跃告警）', () => {
            expect(alertsStatusLabel({ fixStatus: 'pending', supersededAt: null }, t))
                .toBe('t(common.fixStatus.pending)')
            expect(alertsStatusLabel({ fixStatus: 'failed' }, t))
                .toBe('t(common.fixStatus.failed)')
        })

        it('fixStatus≠success + supersededAt 缺失字段 → 视为 null，按活跃告警走原 fixStatus 文案', () => {
            // 防御：API 老数据可能不带 supersededAt 字段（undefined）
            expect(alertsStatusLabel({ fixStatus: 'skipped' }, t))
                .toBe('t(common.fixStatus.skipped)')
        })
    })

    describe('summarizePackageGroups（按包分组：组内最高 severity + 组排序键）', () => {
        it('跨档 severity 取组内最高（lodash high + medium → high / rank 4）', () => {
            const summary = summarizePackageGroups([
                { packageName: 'lodash', severity: 'medium' },
                { packageName: 'lodash', severity: 'high' },
                { packageName: 'lodash', severity: 'medium' },
            ])
            expect(summary.get('lodash')?.severity).toBe('high')
            expect(summary.get('lodash')?.rank).toBe(4)
        })

        it('组排序键按 desc 排序 = 最高级别降序 → 包名升序（默认契约）', () => {
            const summary = summarizePackageGroups([
                { packageName: 'lodash', severity: 'high' },
                { packageName: 'axios', severity: 'critical' },
                { packageName: 'node-fetch', severity: 'medium' },
                { packageName: 'nodemailer', severity: 'high' },
                { packageName: 'minimist', severity: 'low' },
            ])
            // 模拟「严重级别」列 desc 排序：按 sortKey 降序
            const order = [...summary.entries()]
                .sort((a, b) => b[1].sortKey - a[1].sortKey)
                .map(([name]) => name)
            // axios(critical) → lodash/nodemailer(high, 包名升序) → node-fetch(medium) → minimist(low)
            expect(order).toEqual(['axios', 'lodash', 'nodemailer', 'node-fetch', 'minimist'])
        })

        it('组排序键组间唯一（同 rank 不同包 key 不同 → 次排序键只在组内生效）', () => {
            const summary = summarizePackageGroups([
                { packageName: 'lodash', severity: 'high' },
                { packageName: 'nodemailer', severity: 'high' },
            ])
            expect(summary.get('lodash')?.rank).toBe(summary.get('nodemailer')?.rank)
            expect(summary.get('lodash')?.sortKey).not.toBe(summary.get('nodemailer')?.sortKey)
            // 序号差值 = 1（同 rank 内相邻包）
            expect(Math.abs((summary.get('lodash')?.sortKey ?? 0) - (summary.get('nodemailer')?.sortKey ?? 0)))
                .toBe(1)
        })

        it('包名序号使 rank 主导：低 rank 的高序号包仍排在更低 rank 之前', () => {
            const summary = summarizePackageGroups([
                { packageName: 'high-pkg', severity: 'high' },
                { packageName: 'critical-pkg', severity: 'critical' },
            ])
            // critical(rank 5) 即使包名序号大，sortKey 仍高于 high(rank 4)
            expect(summary.get('critical-pkg')?.sortKey).toBeGreaterThan(summary.get('high-pkg')?.sortKey ?? 0)
        })

        it('未知 severity → rank 0；空输入 → 空 Map', () => {
            expect(summarizePackageGroups([{ packageName: 'x', severity: 'n/a' }]).get('x')?.rank).toBe(0)
            expect(summarizePackageGroups([]).size).toBe(0)
        })
    })
})
