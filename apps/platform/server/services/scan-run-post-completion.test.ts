// scan-run-post-completion.test.ts — 「收尾异常不翻转成功结论」的终态字段口径。
import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from 'typeorm'
import type { RunResult } from '@dependfix/core'
import { persistPostCompletionOutcome } from './scan-run-post-completion'
import type { ScanRun } from '#server/entities/scan-run'

function makeRun(): ScanRun {
    return {
        id: 'run-1',
        repositoryId: 'repo-1',
        status: 'running',
        finishedAt: null,
        summaryJson: null,
        errorJson: JSON.stringify({ code: 'stale' }),
        runUrl: null,
        logsJson: JSON.stringify([{ timestamp: '2026-11-13T00:00:00.000Z', level: 'info', message: 'engine started' }]),
        failureCode: 'VERIFICATION_FAILED',
        failureStage: 'verify',
        failureKind: 'deterministic',
        prNumber: 42,
        memoryMaxBytes: null,
        peakRssBytes: null,
        oomKilled: null,
        resourceJson: null,
    } as unknown as ScanRun
}

const result = {
    summary: { alertsFound: 3, alertsFixed: 1 },
} as unknown as RunResult

const logger = { error: vi.fn() }

describe('persistPostCompletionOutcome', () => {
    it('keeps the degraded errorJson (path deviation evidence) and appends the post-completion error to logs', async () => {
        const run = makeRun()
        const notify = vi.fn()
        const onPersisted = vi.fn()
        const persist = vi.fn(async (_ds: DataSource, target: ScanRun) => ({ run: target, written: true }))

        const persisted = await persistPostCompletionOutcome({
            ds: {} as DataSource,
            run,
            status: 'degraded',
            result,
            runUrl: 'https://github.com/demo/app/tree/dependfix/x',
            errorJson: { code: 'sandbox_unavailable', message: 'no rootless daemon' },
            logsJson: run.logsJson ?? null,
            error: new Error('sqlite busy'),
            persist,
            notify,
            onPersisted,
            logger,
        })

        expect(persisted.status).toBe('degraded')
        expect(persisted.errorJson).toContain('sandbox_unavailable')
        expect(persisted.runUrl).toBe('https://github.com/demo/app/tree/dependfix/x')
        // 失败分类清空（degraded 不是失败终态）
        expect(persisted.failureCode).toBeNull()
        const logs = JSON.parse(persisted.logsJson ?? '[]') as { level: string, message: string }[]
        expect(logs[0]).toMatchObject({ message: 'engine started' })
        expect(logs[logs.length - 1]).toMatchObject({ level: 'error' })
        expect(logs[logs.length - 1]?.message).toContain('post-completion error after status=degraded')
        expect(notify).toHaveBeenCalledWith(persisted)
        expect(onPersisted).toHaveBeenCalledWith(persisted)
    })

    it('clears errorJson and failure classification for a completed run', async () => {
        const run = makeRun()
        const persist = vi.fn(async (_ds: DataSource, target: ScanRun) => ({ run: target, written: true }))

        const persisted = await persistPostCompletionOutcome({
            ds: {} as DataSource,
            run,
            status: 'completed',
            result,
            runUrl: null,
            errorJson: null,
            logsJson: null,
            error: 'reconcile failed',
            persist,
            notify: vi.fn(),
            logger,
        })

        expect(persisted.status).toBe('completed')
        expect(persisted.errorJson).toBeNull()
        expect(persisted.failureCode).toBeNull()
        // 无既有日志时也把收尾异常写进日志数组
        const logs = JSON.parse(persisted.logsJson ?? '[]') as { level: string }[]
        expect(logs).toHaveLength(1)
        expect(logs[0]).toMatchObject({ level: 'error' })
    })

    it('skips notification and side effects when the terminal write was skipped', async () => {
        const run = makeRun()
        const notify = vi.fn()
        const onPersisted = vi.fn()
        const persist = vi.fn(async (_ds: DataSource, target: ScanRun) => {
            target.status = 'failed'
            return { run: target, written: false }
        })

        const persisted = await persistPostCompletionOutcome({
            ds: {} as DataSource,
            run,
            status: 'completed',
            result,
            runUrl: null,
            errorJson: null,
            logsJson: null,
            error: new Error('sqlite busy'),
            persist,
            notify,
            onPersisted,
            logger,
        })

        expect(persisted.status).toBe('failed')
        expect(notify).not.toHaveBeenCalled()
        expect(onPersisted).not.toHaveBeenCalled()
    })
})
