import { describe, expect, it } from 'vitest'
import {
    aggregateScanRuns,
    EMPTY_BATCH_SUMMARY,
    shouldWriteBackStatus,
    type BatchAggregation,
} from './batch-aggregate'
import type { ScanRun } from '#server/entities/scan-run'
import type { ScanResult } from '#server/entities/scan-result'

/** 构造最小 ScanRun（仅聚合读取的字段） */
const makeRun = (overrides: Partial<ScanRun> & { id: string, status: string }): ScanRun => Object.assign({
    repositoryId: 'repo-x',
    mode: 'report-only',
    severityThreshold: 'high',
    executorKind: 'container',
    batchRunId: 'batch-1',
    summaryJson: null,
}, overrides) as ScanRun

const makeResult = (overrides: Partial<ScanResult> & { scanRunId: string, severity: string }): ScanResult => Object.assign({
    source: 'github-dependabot',
    packageName: 'pkg',
}, overrides) as ScanResult

/** completed run（带 summary） */
const completedRun = (id: string, alertsFound: number, alertsFixed: number): ScanRun =>
    makeRun({ id, status: 'completed', summaryJson: JSON.stringify({ alertsFound, alertsFixed }) })

describe('aggregateScanRuns（BatchRun 聚合纯函数）', () => {
    it('空列表：整体 completed + 零值统计', () => {
        const agg = aggregateScanRuns([])
        expect(agg.status).toBe('completed')
        expect(agg).toMatchObject({
            finishedCount: 0,
            completedCount: 0,
            failedCount: 0,
            pendingCount: 0,
        })
        expect(agg.summary).toEqual(EMPTY_BATCH_SUMMARY)
    })

    it('全部 completed：计数 + alertsTotal/fixedCount 求和', () => {
        const runs = [
            completedRun('run-1', 10, 3),
            completedRun('run-2', 5, 2),
        ]
        const agg = aggregateScanRuns(runs)
        expect(agg).toMatchObject({
            finishedCount: 2,
            completedCount: 2,
            failedCount: 0,
            pendingCount: 0,
            status: 'completed',
        })
        expect(agg.summary).toEqual({
            alertsTotal: 15,
            severityCounts: {},
            fixedCount: 5,
        })
    })

    it('含 failed：整体 completed（部分失败算整体完成）', () => {
        const runs = [
            completedRun('run-1', 10, 3),
            makeRun({ id: 'run-2', status: 'failed' }),
        ]
        const agg = aggregateScanRuns(runs)
        expect(agg.status).toBe('completed')
        expect(agg).toMatchObject({
            finishedCount: 2,
            completedCount: 1,
            failedCount: 1,
            pendingCount: 0,
        })
    })

    it('含 dispatched：计终态但不计 failed（B 模式触发已受理）', () => {
        const runs = [
            makeRun({ id: 'run-1', status: 'dispatched' }),
            completedRun('run-2', 1, 0),
        ]
        const agg = aggregateScanRuns(runs)
        expect(agg.status).toBe('completed')
        expect(agg).toMatchObject({
            finishedCount: 2,
            completedCount: 1,
            failedCount: 0,
            pendingCount: 0,
        })
    })

    it('含 pending/running：整体 running', () => {
        const runs = [
            completedRun('run-1', 10, 3),
            makeRun({ id: 'run-2', status: 'pending' }),
            makeRun({ id: 'run-3', status: 'running' }),
        ]
        const agg = aggregateScanRuns(runs)
        expect(agg.status).toBe('running')
        expect(agg).toMatchObject({
            finishedCount: 1,
            completedCount: 1,
            failedCount: 0,
            pendingCount: 2,
        })
    })

    it('severityCounts：按 completed run 的结果明细分组（非 completed run 的结果不入统计）', () => {
        const runs = [
            completedRun('run-1', 2, 0),
            makeRun({ id: 'run-2', status: 'failed' }),
        ]
        const results = [
            makeResult({ scanRunId: 'run-1', severity: 'critical' }),
            makeResult({ scanRunId: 'run-1', severity: 'high' }),
            // failed run 的结果明细：不应计入
            makeResult({ scanRunId: 'run-2', severity: 'critical' }),
        ]
        const agg = aggregateScanRuns(runs, results)
        expect(agg.summary.severityCounts).toEqual({ critical: 1, high: 1 })
    })

    it('severityCounts 多结果累计同级别', () => {
        const runs = [completedRun('run-1', 3, 0)]
        const results = [
            makeResult({ scanRunId: 'run-1', severity: 'high' }),
            makeResult({ scanRunId: 'run-1', severity: 'high' }),
            makeResult({ scanRunId: 'run-1', severity: 'low' }),
        ]
        const agg = aggregateScanRuns(runs, results)
        expect(agg.summary.severityCounts).toEqual({ high: 2, low: 1 })
    })

    it('summaryJson 非法/缺失：按零值容错（不抛错）', () => {
        const runs = [
            makeRun({ id: 'run-1', status: 'completed', summaryJson: 'not-json' }),
            makeRun({ id: 'run-2', status: 'completed', summaryJson: null }),
        ]
        const agg = aggregateScanRuns(runs)
        expect(agg.summary).toEqual({ alertsTotal: 0, severityCounts: {}, fixedCount: 0 })
    })

    it('summaryJson 字段类型异常：防御性按零值（不抛错）', () => {
        const runs = [makeRun({ id: 'run-1', status: 'completed', summaryJson: JSON.stringify({ alertsFound: 'x', alertsFixed: null }) })]
        const agg = aggregateScanRuns(runs)
        expect(agg.summary.alertsTotal).toBe(0)
        expect(agg.summary.fixedCount).toBe(0)
    })

    it('unknown 状态：不落任何计数桶（防御性）', () => {
        const agg = aggregateScanRuns([makeRun({ id: 'run-1', status: 'weird' as ScanRun['status'] })])
        const expected: BatchAggregation = {
            finishedCount: 0,
            completedCount: 0,
            failedCount: 0,
            pendingCount: 0,
            status: 'completed',
            summary: EMPTY_BATCH_SUMMARY,
        }
        expect(agg).toEqual(expected)
    })
})

describe('shouldWriteBackStatus（轮询聚合写回决策）', () => {
    it('running → completed/running：允许流转', () => {
        expect(shouldWriteBackStatus('running', 'completed')).toBe(true)
        expect(shouldWriteBackStatus('running', 'running')).toBe(false)
    })

    it('failed 终态受保护：聚合值不可覆盖（executor 显式终态，如 async 全部入队失败）', () => {
        expect(shouldWriteBackStatus('failed', 'completed')).toBe(false)
        expect(shouldWriteBackStatus('failed', 'running')).toBe(false)
    })

    it('completed 终态不再写回（幂等收敛）', () => {
        expect(shouldWriteBackStatus('completed', 'completed')).toBe(false)
    })
})
