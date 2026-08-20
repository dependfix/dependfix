import { describe, expect, it } from 'vitest'
import {
    buildFixRateChartData,
    buildFixRateChartOptions,
    buildSeverityChartData,
    buildSeverityChartOptions,
    buildTopPackagesChartData,
    buildTopPackagesChartOptions,
    buildTopPackagesLabels,
    computeFixRatePercent,
    SEVERITY_COLORS,
    TOP_PACKAGES_LIMIT,
    type DashboardStats,
    type TopPackage,
} from './dashboard-charts'

const baseStats: DashboardStats = {
    repositoryCount: 3,
    alertsTotal: 100,
    severityCounts: { critical: 10, high: 20, medium: 30, low: 30, unknown: 10 },
    fixedCount: 25,
    topPackages: [
        { packageName: 'lodash', count: 30 },
        { packageName: 'express', count: 20 },
        { packageName: 'axios', count: 10 },
    ],
    latestRun: null,
}

describe('dashboard-charts 纯函数', () => {
    describe('buildSeverityChartData', () => {
        it('null stats 返回 5 桶全 0', () => {
            const data = buildSeverityChartData(null)
            expect(data.labels).toEqual(['critical', 'high', 'medium', 'low', 'unknown'])
            expect(data.datasets[0]?.data).toEqual([0, 0, 0, 0, 0])
        })

        it('stats 有值时按桶顺序填充', () => {
            const data = buildSeverityChartData(baseStats)
            expect(data.datasets[0]?.data).toEqual([10, 20, 30, 30, 10])
        })

        it('backgroundColor 与 SEVERITY_COLORS 一致（5 色）', () => {
            const data = buildSeverityChartData(baseStats)
            expect(data.datasets[0]?.backgroundColor).toEqual([
                SEVERITY_COLORS.critical,
                SEVERITY_COLORS.high,
                SEVERITY_COLORS.medium,
                SEVERITY_COLORS.low,
                SEVERITY_COLORS.unknown,
            ])
        })

        it('缺漏桶（如未识别 severity）补 0', () => {
            const data = buildSeverityChartData({
                ...baseStats,
                severityCounts: { critical: 5 }, // 只给 critical，其他缺
            })
            expect(data.datasets[0]?.data).toEqual([5, 0, 0, 0, 0])
        })
    })

    describe('buildSeverityChartOptions', () => {
        it('返回 responsive + legend bottom', () => {
            const opts = buildSeverityChartOptions()
            expect(opts.responsive).toBe(true)
            expect(opts.maintainAspectRatio).toBe(false)
            expect(opts.plugins.legend.position).toBe('bottom')
        })
    })

    describe('computeFixRatePercent', () => {
        it('total=0 返回 0', () => {
            expect(computeFixRatePercent({ ...baseStats, alertsTotal: 0 })).toBe(0)
        })

        it('total>0 且 fixed<=total 时返回真实百分比（round）', () => {
            // 25/100 = 25
            expect(computeFixRatePercent(baseStats)).toBe(25)
        })

        it('fixed 异常 > total 时 clamp 到 100%', () => {
            expect(computeFixRatePercent({ ...baseStats, alertsTotal: 10, fixedCount: 50 })).toBe(100)
        })

        it('null stats 返回 0', () => {
            expect(computeFixRatePercent(null)).toBe(0)
        })

        it('非整数结果四舍五入', () => {
            // 33/100 = 33%
            expect(computeFixRatePercent({ ...baseStats, fixedCount: 33 })).toBe(33)
            // 67/100 = 67%
            expect(computeFixRatePercent({ ...baseStats, fixedCount: 67 })).toBe(67)
        })
    })

    describe('buildFixRateChartData', () => {
        it('total=0 时 data=[0,1]（纯灰环语义）', () => {
            const data = buildFixRateChartData(
                { ...baseStats, alertsTotal: 0 },
                ['已修复', '未修复'],
            )
            expect(data.labels).toEqual(['已修复', '未修复'])
            expect(data.datasets[0]?.data).toEqual([0, 1])
        })

        it('total>0 且 fixed<=total 时 data=[fixed, remaining]', () => {
            const data = buildFixRateChartData(baseStats, ['Fixed', 'Remaining'])
            expect(data.datasets[0]?.data).toEqual([25, 75])
        })

        it('fixed > total clamp（remaining=0）', () => {
            const data = buildFixRateChartData(
                { ...baseStats, alertsTotal: 10, fixedCount: 50 },
                ['Fixed', 'Remaining'],
            )
            expect(data.datasets[0]?.data).toEqual([10, 0])
        })

        it('labels 由调用方注入（i18n）', () => {
            const data = buildFixRateChartData(baseStats, ['已修复', '未修复'])
            expect(data.labels).toEqual(['已修复', '未修复'])
        })
    })

    describe('buildFixRateChartOptions', () => {
        it('cutout=70% + legend hidden', () => {
            const opts = buildFixRateChartOptions(true)
            expect(opts.cutout).toBe('70%')
            expect(opts.plugins.legend.display).toBe(false)
        })

        it('tooltip enabled 由调用方决定', () => {
            expect(buildFixRateChartOptions(true).plugins.tooltip.enabled).toBe(true)
            expect(buildFixRateChartOptions(false).plugins.tooltip.enabled).toBe(false)
        })
    })

    describe('buildTopPackagesLabels + TOP_PACKAGES_LIMIT', () => {
        const manyPackages: TopPackage[] = Array.from({ length: 15 }, (_, i) => ({
            packageName: `pkg-${String(i).padStart(2, '0')}`,
            count: 100 - i,
        }))

        it('超过 TOP_PACKAGES_LIMIT 时 slice 到 10', () => {
            expect(TOP_PACKAGES_LIMIT).toBe(10)
            const data = buildTopPackagesChartData(manyPackages, 'Top-10')
            expect(data.labels).toHaveLength(10)
            expect(data.datasets[0]?.data).toHaveLength(10)
        })

        it('不超过 TOP_PACKAGES_LIMIT 时全部保留', () => {
            const data = buildTopPackagesChartData(baseStats.topPackages, 'Top')
            expect(data.labels).toEqual(['lodash', 'express', 'axios'])
        })

        it('空数组返回空 labels/datasets', () => {
            const data = buildTopPackagesChartData([], 'Top')
            expect(data.labels).toEqual([])
            expect(data.datasets[0]?.data).toEqual([])
        })

        it('包名超过 20 字符截断（最后 2 字符替换为 …）', () => {
            const longName = 'a'.repeat(30)
            const labels = buildTopPackagesLabels([{ packageName: longName, count: 5 }])
            expect(labels[0]).toBe(`${'a'.repeat(18)}…`)
            expect(labels[0]?.length).toBe(19) // 18 + 1
        })

        it('包名正好 20 字符不截断', () => {
            const name = 'a'.repeat(20)
            const labels = buildTopPackagesLabels([{ packageName: name, count: 5 }])
            expect(labels[0]).toBe(name)
        })

        it('包名 < 20 字符不截断', () => {
            const labels = buildTopPackagesLabels([{ packageName: 'short', count: 5 }])
            expect(labels[0]).toBe('short')
        })
    })

    describe('buildTopPackagesChartData', () => {
        it('dataset label 由调用方注入（i18n）', () => {
            const data = buildTopPackagesChartData(baseStats.topPackages, 'Top-10 包')
            expect(data.datasets[0]?.label).toBe('Top-10 包')
        })

        it('data 与 packages.count 一一对应', () => {
            const data = buildTopPackagesChartData(baseStats.topPackages, 'Top')
            expect(data.datasets[0]?.data).toEqual([30, 20, 10])
        })
    })

    describe('buildTopPackagesChartOptions', () => {
        it('horizontal bar + x beginAtZero', () => {
            const opts = buildTopPackagesChartOptions(() => '')
            expect(opts.indexAxis).toBe('y')
            expect(opts.scales.x.beginAtZero).toBe(true)
            expect(opts.scales.x.ticks.precision).toBe(0)
        })

        it('tooltip title 通过 getFullPackageName(idx) 拿完整包名', () => {
            const opts = buildTopPackagesChartOptions((idx) => `full-${idx}`)
            // callbacks.title 在 chart.js 渲染时调用；直接断言函数行为
            const cb = opts.plugins.tooltip.callbacks.title as (items: { dataIndex: number }[]) => string
            expect(cb([{ dataIndex: 3 }])).toBe('full-3')
        })

        it('tooltip title 在 dataIndex 缺省时 fallback 到 idx=0', () => {
            const opts = buildTopPackagesChartOptions((idx) => `name-${idx}`)
            const cb = opts.plugins.tooltip.callbacks.title as (items: { dataIndex: number }[]) => string
            expect(cb([])).toBe('name-0') // items[0] undefined → ?? 0
        })
    })
})
