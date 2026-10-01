import { describe, expect, it } from 'vitest'
import { applyBatchAggregation } from './batch-writeback'
import type { BatchAggregation } from './batch-aggregate'
import type { BatchRun } from '#server/entities/batch-run'
import type { ScanRun } from '#server/entities/scan-run'

/** 构造最小 BatchRun（仅写回读取的字段） */
const makeBatch = (overrides: Partial<BatchRun> = {}): BatchRun => ({
    id: 'batch-1',
    source: 'manual',
    scheduleId: null,
    mode: 'report-only',
    severityThreshold: 'high',
    repositoryCount: 1,
    finishedCount: 0,
    completedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    summaryJson: null,
    status: 'running',
    finishedAt: null,
    organizationId: 'org-1',
    ...overrides,
} as BatchRun)

const makeRun = (overrides: Partial<ScanRun> & { id: string }): ScanRun => ({
    status: 'completed',
    finishedAt: null,
    ...overrides,
} as ScanRun)

const makeAggregation = (overrides: Partial<BatchAggregation> = {}): BatchAggregation => ({
    finishedCount: 0,
    completedCount: 0,
    failedCount: 0,
    degradedCount: 0,
    pendingCount: 0,
    status: 'running',
    summary: { alertsTotal: 0, severityCounts: {}, fixedCount: 0 },
    ...overrides,
})

describe('applyBatchAggregation（共享写回）', () => {
    it('running + 子项全部终态：流转 completed，finishedAt = max(子项 finishedAt)', () => {
        const earlier = new Date('2026-09-04T03:00:00Z')
        const later = new Date('2026-09-04T04:00:00Z')
        const batch = makeBatch({
            finishedCount: 1, // 触发 countsChanged
        })
        const runs = [
            makeRun({ id: 'r1', status: 'completed', finishedAt: earlier }),
            makeRun({ id: 'r2', status: 'failed', finishedAt: later }),
        ]
        const changed = applyBatchAggregation(batch, makeAggregation({
            status: 'completed', finishedCount: 2, completedCount: 1, failedCount: 1,
        }), runs)
        expect(changed).toBe(true)
        expect(batch.status).toBe('completed')
        expect(batch.finishedAt?.toISOString()).toBe(later.toISOString())
    })

    it('零子项 + running：终态未定，no-op（不写回 completed）', () => {
        const batch = makeBatch()
        const changed = applyBatchAggregation(batch, makeAggregation({ status: 'completed' }), [])
        expect(changed).toBe(false)
        expect(batch.status).toBe('running')
        expect(batch.finishedAt).toBeNull()
    })

    it('已 completed 且 finishedAt 存在：不被改写（首次写入护栏）', () => {
        const existing = new Date('2026-10-01T16:39:42Z')
        const batch = makeBatch({ status: 'completed', finishedAt: existing })
        // counts 变化触发写回块，但 finishedAt 不应被子项时间覆盖
        const changed = applyBatchAggregation(batch, makeAggregation({
            status: 'completed', finishedCount: 1, completedCount: 1,
        }), [makeRun({ id: 'r1', finishedAt: new Date('2026-09-04T04:00:00Z') })])
        expect(changed).toBe(true)
        expect(batch.finishedAt?.toISOString()).toBe(existing.toISOString())
    })

    it('failed 终态保护：聚合 completed 也不覆盖状态，但计数对齐', () => {
        const batch = makeBatch({ status: 'failed' })
        const changed = applyBatchAggregation(batch, makeAggregation({
            status: 'completed', finishedCount: 1, completedCount: 1,
        }), [makeRun({ id: 'r1' })])
        expect(changed).toBe(true)
        expect(batch.status).toBe('failed')
        expect(batch.completedCount).toBe(1)
    })

    it('计数与状态均无变化：返回 false（幂等无写）', () => {
        const batch = makeBatch({
            status: 'running', finishedCount: 1, completedCount: 1, pendingCount: 1,
        })
        const changed = applyBatchAggregation(batch, makeAggregation({
            status: 'running', finishedCount: 1, completedCount: 1, pendingCount: 1,
        }), [makeRun({ id: 'r1' }), makeRun({ id: 'r2', status: 'running' })])
        expect(changed).toBe(false)
    })
})
