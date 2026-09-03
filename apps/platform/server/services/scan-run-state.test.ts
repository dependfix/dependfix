import { describe, expect, it } from 'vitest'
import type { FixError, RunResult } from '@dependfix/core'
import { resolveScanRunState } from './scan-run-state'

const minimalResult = { runId: 'r1', errors: [] } as unknown as RunResult

function resultWithErrors(...errors: Pick<FixError, 'category' | 'message'>[]): RunResult {
    return {
        runId: 'r1',
        errors: errors.map((e) => ({
            repository: 'o/r',
            stage: 'report',
            ...e,
        })) as FixError[],
    } as unknown as RunResult
}

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

    describe('A 模式 sandbox 启动时降级（degraded 状态机扩展）', () => {
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

    describe('关键修复：引擎交付阶段失败 + exitCode 透传', () => {
        it('failed when result.errors 含 PR_CREATION_FAILED（根因：状态机误报 completed）', () => {
            // 关键反向测试：原状态机在 result 存在时直接 completed，导致"已修复 8 但无 PR"误报
            // 修复后扫描 result.errors 命中白名单 → failed + engine_delivery_failed 错误码
            const result = resultWithErrors({ category: 'PR_CREATION_FAILED', message: 'git push: Failed to connect to github.com:443' })
            const decision = resolveScanRunState('container', undefined, result)
            expect(decision.status).toBe('failed')
            expect(decision.errorJson?.code).toBe('engine_delivery_failed')
            expect(decision.errorJson?.message).toContain('PR_CREATION_FAILED')
            expect(decision.errorJson?.message).toContain('github.com:443')
        })

        it('failed for each engine delivery category in whitelist', () => {
            // 覆盖白名单全部 5 个 category（COMMIT_FAILED / PR_CREATION_FAILED / VERIFICATION_FAILED / ROLLBACK_FAILED / FATAL）
            for (const category of ['COMMIT_FAILED', 'PR_CREATION_FAILED', 'VERIFICATION_FAILED', 'ROLLBACK_FAILED', 'FATAL'] as const) {
                const result = resultWithErrors({ category, message: 'x' })
                expect(resolveScanRunState('container', undefined, result).status).toBe('failed')
            }
        })

        it('failed (engine_delivery_failed) 优先级高于 degraded（与 pr_creation_failed 顺序对齐）', () => {
            // 极端边界：沙箱启动降级 + 引擎交付也失败 → 真实失败优先（不是"路径偏离"）
            const result = resultWithErrors({ category: 'PR_CREATION_FAILED', message: 'x' })
            const degradedReason = { code: 'sandbox_unavailable', message: '降级' }
            const decision = resolveScanRunState('container', undefined, result, degradedReason)
            expect(decision.status).toBe('failed')
        })

        it('failed when exitCode=2 + result 存在（catastrophic：所有仓库失败/回滚）', () => {
            // 进程级兜底：computeExitCode 判定为 2（无成功 + 有 error）时即使有 result 也算失败
            // 实际场景：引擎 catch-all 跑完所有仓库后汇总；result 内 alerts 全是 failed
            const decision = resolveScanRunState('container', undefined, minimalResult, undefined, 2)
            expect(decision.status).toBe('failed')
            expect(decision.errorJson?.code).toBe('engine_exit_2')
        })

        it('exitCode=1 (部分成功) 仍走 completed（不提前 fail-closed）', () => {
            // 关键边界：exitCode=1 表示至少一个仓库成功（partially），不能 fail-closed
            // 例如：8 个升级成功、2 个失败 + 交付成功 → 应 completed
            const decision = resolveScanRunState('container', undefined, minimalResult, undefined, 1)
            expect(decision.status).toBe('completed')
        })

        it('exitCode=0 + result 无引擎交付类 error → completed（正常成功）', () => {
            // 0 错误 + result 存在 + 无 delivery failed → completed
            const decision = resolveScanRunState('container', undefined, minimalResult, undefined, 0)
            expect(decision.status).toBe('completed')
        })

        it('exitCode 兜底：error 存在 + result 存在时优先用 error 信息（不强制 failed by exitCode=0）', () => {
            // 边界：executor 报 push_failed，但引擎 result 仍带 PR_CREATION_FAILED error
            // → 走 engine_delivery_failed 分支（更具体），errorJson 用引擎错
            const result = resultWithErrors({ category: 'PR_CREATION_FAILED', message: 'git push failed' })
            const decision = resolveScanRunState(
                'container',
                { code: 'push_failed', message: 'platform push failed' },
                result,
                undefined,
                1,
            )
            expect(decision.status).toBe('failed')
            expect(decision.errorJson?.code).toBe('engine_delivery_failed')
        })

        it('B 模式（github-action）忽略 engine delivery category（继续走 B 模式决策）', () => {
            // B 模式：action run 由外部拉取，result 来自 action 输出，不能用引擎 category 判定失败
            // （action 自己的 run conclusion 是 success/failure 体现在 result）
            // 保留 B 模式原行为：result 存在 → completed
            const result = resultWithErrors({ category: 'PR_CREATION_FAILED', message: 'x' })
            const decision = resolveScanRunState('github-action', undefined, result, undefined, 1)
            expect(decision.status).toBe('completed')
        })
    })
})
