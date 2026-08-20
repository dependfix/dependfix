import { describe, expect, it } from 'vitest'
import type { RunResult } from '@dependfix/core'
import { resolveScanRunState } from './scan-run-state'

const minimalResult = { runId: 'r1' } as unknown as RunResult

describe('resolveScanRunState（状态机纯函数）', () => {
    describe('B 模式（github-action）', () => {
        it('completed when result fetched', () => {
            expect(resolveScanRunState('github-action', undefined, minimalResult))
                .toEqual({ status: 'completed' })
        })

        it('dispatched when result_fetch_failed (action already running)', () => {
            const decision = resolveScanRunState('github-action', { code: 'result_fetch_failed', message: 'x' }, undefined)
            expect(decision.status).toBe('dispatched')
            expect(decision.errorJson?.code).toBe('result_fetch_failed')
        })

        it('dispatched when run_url_not_resolved even with minimal result', () => {
            // 关键：run_url_not_resolved 时 executor 仍返回最小 result，须优先于 completed
            const decision = resolveScanRunState('github-action', { code: 'run_url_not_resolved', message: 'x' }, minimalResult)
            expect(decision.status).toBe('dispatched')
        })

        it('failed only on trigger-level failures (action never ran)', () => {
            for (const code of ['workflow_not_configured', 'workflow_not_found', 'trigger_forbidden', 'trigger_failed']) {
                expect(resolveScanRunState('github-action', { code, message: 'x' }, undefined).status).toBe('failed')
            }
        })

        it('dispatched fallback when no error and no result', () => {
            expect(resolveScanRunState('github-action', undefined, undefined).status).toBe('dispatched')
        })
    })

    describe('A 模式（container）', () => {
        it('completed with result', () => {
            expect(resolveScanRunState('container', undefined, minimalResult).status).toBe('completed')
        })

        it('failed on execution error without result (no half-written results)', () => {
            expect(resolveScanRunState('container', { code: 'execution_failed', message: 'x' }, undefined).status).toBe('failed')
        })

        it('failed on push_failed (no branch pushed, no PR)', () => {
            expect(resolveScanRunState('container', { code: 'push_failed', message: 'x' }, undefined).status).toBe('failed')
        })

        it('failed on execution_timeout (no push attempted)', () => {
            expect(resolveScanRunState('container', { code: 'execution_timeout', message: 'x' }, undefined).status).toBe('failed')
        })

        it('dispatched when pr_creation_failed (branch pushed, PR failed)', () => {
            const decision = resolveScanRunState('container', { code: 'pr_creation_failed', message: 'x' }, undefined)
            expect(decision.status).toBe('dispatched')
            expect(decision.errorJson?.code).toBe('pr_creation_failed')
        })

        it('dispatched prioritized pr_creation_failed even with result (caller returns early on error)', () => {
            // 关键：与 B 模式 run_url_not_resolved 语义对齐——error 优先于 result
            const decision = resolveScanRunState('container', { code: 'pr_creation_failed', message: 'x' }, minimalResult)
            expect(decision.status).toBe('dispatched')
        })
    })
})
