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

    describe('A 模式 sandbox 启动时降级（degraded 状态机扩展，M11 T1005-C）', () => {
        it('degraded when result present and degradedReason set (启动时不可用降级 ContainerExecutor 跑成功)', () => {
            const degradedReason = { code: 'sandbox_unavailable', message: '沙箱启动时不可用，已自动降级到平台容器' }
            const decision = resolveScanRunState('sandbox', undefined, minimalResult, degradedReason)
            expect(decision).toEqual({ status: 'degraded', errorJson: degradedReason })
        })

        it('degraded 适用于 container / sandbox executorKind 路由等价（sandbox 复用 A 模式 push 链路）', () => {
            const degradedReason = { code: 'sandbox_unavailable', message: 'docker daemon 未运行' }
            const decisionContainer = resolveScanRunState('container', undefined, minimalResult, degradedReason)
            const decisionSandbox = resolveScanRunState('sandbox', undefined, minimalResult, degradedReason)
            expect(decisionContainer.status).toBe('degraded')
            expect(decisionSandbox.status).toBe('degraded')
            expect(decisionContainer.errorJson?.code).toBe('sandbox_unavailable')
            expect(decisionSandbox.errorJson?.code).toBe('sandbox_unavailable')
        })

        it('degraded 优先级：pr_creation_failed 仍优先（error 优先于 degraded）', () => {
            const degradedReason = { code: 'sandbox_unavailable', message: '降级' }
            const decision = resolveScanRunState('container', { code: 'pr_creation_failed', message: 'x' }, minimalResult, degradedReason)
            expect(decision.status).toBe('dispatched')
        })

        it('degraded 要求 result 必须存在（result=undefined + degradedReason 有值 → 不命中 degraded）', () => {
            // 启动时降级但 ContainerExecutor 执行失败 → 走 error && !result → failed
            // 边界防御：避免 result 缺失时被错误标记 degraded
            const degradedReason = { code: 'sandbox_unavailable', message: '降级' }
            const decision = resolveScanRunState('sandbox', { code: 'execution_failed', message: 'container exec' }, undefined, degradedReason)
            expect(decision.status).toBe('failed')
        })
    })

    describe('A 模式 sandbox_unavailable 运行时失败（B 场景，区别于 A 场景降级）', () => {
        it('failed when sandbox execute returns sandbox_unavailable and no result', () => {
            // 运行时偶发故障：isAvailable() 通过 → execute() 抛 errno → sandbox_unavailable 错误码
            // 不静默降级，避免掩盖环境中途变化
            const decision = resolveScanRunState('sandbox', { code: 'sandbox_unavailable', message: 'docker daemon stopped during scan' }, undefined)
            expect(decision.status).toBe('failed')
        })

        it('B 场景 sandbox_unavailable 不被 degradedReason 误标为 degraded（degradedReason 必须 undefined）', () => {
            // 运行时失败时 degradedReason 必须是 undefined（orchestrator 降级信号契约）
            const decision = resolveScanRunState('sandbox', { code: 'sandbox_unavailable', message: 'x' }, undefined, undefined)
            expect(decision.status).toBe('failed')
        })
    })
})
