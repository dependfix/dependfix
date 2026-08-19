import { describe, expect, it } from 'vitest'
import { reconcileBatchRuns } from './reconcile-batch-runs'
import type { BatchRunView } from '~/types/platform'

const makeView = (id: string, updatedAt: string, overrides: Partial<BatchRunView> = {}): BatchRunView => ({
    id,
    source: 'manual',
    scheduleId: null,
    mode: 'report-only',
    severityThreshold: 'high',
    repositoryCount: 1,
    finishedCount: 0,
    completedCount: 0,
    failedCount: 0,
    pendingCount: 1,
    summary: null,
    status: 'running',
    finishedAt: null,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
})

describe('reconcileBatchRuns', () => {
    it('removes ids that disappeared from server', () => {
        const local: BatchRunView[] = [
            makeView('a', '2026-08-19T00:00:00.000Z'),
            makeView('b', '2026-08-19T00:01:00.000Z'),
            makeView('c', '2026-08-19T00:02:00.000Z'),
        ]
        const fresh: BatchRunView[] = [
            makeView('a', '2026-08-19T00:00:00.000Z'),
            makeView('c', '2026-08-19T00:02:00.000Z'),
        ]
        reconcileBatchRuns(local, fresh)
        expect(local.map((b) => b.id)).toEqual(['a', 'c'])
    })

    it('prepends new ids in fresh order (createdAt DESC)', () => {
        const local: BatchRunView[] = [
            makeView('a', '2026-08-19T00:00:00.000Z'),
        ]
        // fresh 顺序即为最终展示顺序
        const fresh: BatchRunView[] = [
            makeView('c', '2026-08-19T00:02:00.000Z'),
            makeView('b', '2026-08-19T00:01:00.000Z'),
            makeView('a', '2026-08-19T00:00:00.000Z'),
        ]
        reconcileBatchRuns(local, fresh)
        expect(local.map((b) => b.id)).toEqual(['c', 'b', 'a'])
    })

    it('replaces row reference when updatedAt changes', () => {
        const oldA = makeView('a', '2026-08-19T00:00:00.000Z', { pendingCount: 1 })
        const local: BatchRunView[] = [oldA]
        const newA = makeView('a', '2026-08-19T00:01:00.000Z', { pendingCount: 0, status: 'completed' })
        reconcileBatchRuns(local, [newA])
        expect(local).toHaveLength(1)
        // updatedAt 变化 → 替换为新对象引用（避免 DataTable 漏更新）
        expect(local[0]).not.toBe(oldA)
        expect(local[0]).toBe(newA)
        expect(local[0]!.pendingCount).toBe(0)
        expect(local[0]!.status).toBe('completed')
    })

    it('keeps existing reference when updatedAt is unchanged (minimal reactivity)', () => {
        const a = makeView('a', '2026-08-19T00:00:00.000Z') // 默认 pendingCount=1
        const local: BatchRunView[] = [a]
        const freshA = makeView('a', '2026-08-19T00:00:00.000Z', { pendingCount: 999 }) // updatedAt 相同但业务字段被改
        reconcileBatchRuns(local, [freshA])
        expect(local).toHaveLength(1)
        // updatedAt 相同 → 保留旧引用（不触发 DataTable 重新 reconcile 该行）
        expect(local[0]).toBe(a)
        // 但 pendingCount 仍是原值 1（这是 reconcile 的设计：updatedAt 相等意味着服务端也没变）
        expect(local[0]!.pendingCount).toBe(1)
    })

    it('handles empty fresh (clear all)', () => {
        const local: BatchRunView[] = [
            makeView('a', '2026-08-19T00:00:00.000Z'),
            makeView('b', '2026-08-19T00:01:00.000Z'),
        ]
        reconcileBatchRuns(local, [])
        expect(local).toEqual([])
    })

    it('handles empty local (initial load)', () => {
        const local: BatchRunView[] = []
        // fresh 已 createdAt DESC（b 比 a 新）
        const fresh: BatchRunView[] = [
            makeView('b', '2026-08-19T00:01:00.000Z'),
            makeView('a', '2026-08-19T00:00:00.000Z'),
        ]
        reconcileBatchRuns(local, fresh)
        expect(local.map((b) => b.id)).toEqual(['b', 'a'])
    })

    it('mixed scenario: remove + add + update in one pass', () => {
        const oldA = makeView('a', '2026-08-19T00:00:00.000Z', { pendingCount: 1 })
        const oldB = makeView('b', '2026-08-19T00:01:00.000Z')
        const local: BatchRunView[] = [oldA, oldB]
        const fresh: BatchRunView[] = [
            makeView('c', '2026-08-19T00:03:00.000Z'), // 新增
            makeView('a', '2026-08-19T00:00:30.000Z', { pendingCount: 0 }), // 更新
            // b 消失
        ]
        reconcileBatchRuns(local, fresh)
        expect(local.map((b) => b.id)).toEqual(['c', 'a'])
        // a 引用被替换为新对象
        expect(local[1]).not.toBe(oldA)
        expect(local[1]!.pendingCount).toBe(0)
        // oldB 已 splice 移除
        expect(local.includes(oldB)).toBe(false)
    })
})
