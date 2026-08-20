// exit-code.test.ts — computeExitCode（按运行结果聚合退出码）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { describe, expect, it } from 'vitest'
import { computeExitCode, type AppContext } from './helpers'

function makeCtx(overrides: Partial<AppContext> = {}): Pick<AppContext, 'config' | 'allErrors' | 'allActions' | 'repoResults'> {
    return {
        config: { mode: 'report-only' } as AppContext['config'],
        allErrors: [],
        allActions: [],
        repoResults: [],
        ...overrides,
    }
}

describe('computeExitCode', () => {
    it('returns 0 when everything succeeds (report-only)', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{ success: true } as never],
            repoResults: [{ alertsCount: 3, fixed: 2, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 0 when nothing to process and no errors', () => {
        expect(computeExitCode(makeCtx())).toBe(0)
    })

    it('returns 2 when a repo fails and nothing succeeds', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: 'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    // 回归：report-only 模式（默认模式）fetch 403 必须非零退出
    it('returns 2 for report-only mode when fetch fails with 403', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fetch',
                category: 'FETCH_FAILED',
                message: 'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    // 回归：fix 模式 fetch 403 必须非零退出
    it('returns 2 for fix mode when fetch fails with 403', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix' } as AppContext['config'],
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: 'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    it('returns 1 when some repos succeed and others fail', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{ repository: 'foo/bad', category: 'PROCESS_FAILED' } as never],
            repoResults: [
                { alertsCount: 0, fixed: 0 } as never,
                { alertsCount: 5, fixed: 5, verificationPassed: true } as never,
            ],
        }))
        expect(exitCode).toBe(1)
    })

    // 回归：code-scanning 修复的 noOp（陈旧告警/无模板）不计 failed，不得触发非零退出
    it('returns 0 when only noOp code-scanning-fix actions exist (no permanent failure semantics)', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{
                type: 'code-scanning-fix',
                repository: 'foo/bar',
                target: 'eol-last',
                success: true,
                noOp: true,
                error: 'no fix template for rule',
            } as never],
            repoResults: [{ alertsCount: 1, fixed: 0, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    // 回归：code-scanning 真实失败（写盘失败/验证回滚）仍计入 failed → 非零退出
    it('returns 1 when code-scanning fix fails but repo has success', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{
                type: 'code-scanning-fix',
                repository: 'foo/bar',
                target: 'eol-last',
                success: false,
                error: 'cannot write src/foo.ts',
            } as never],
            repoResults: [{ alertsCount: 2, fixed: 1, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(1)
    })

    // 回归：fix-and-pr 模式 fetch 403（PERMISSION_DENIED）时必须非零退出，杜绝静默空跑
    it('returns 2 for fix-and-pr mode when fetch fails with 403 and no repo succeeds', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            allErrors: [{
                repository: 'dependfix/dependfix',
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: 'fetch dependabot alerts for dependfix/dependfix: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    it('returns 1 for fix-and-pr mode when fetch fails for one repo but another succeeds', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            allErrors: [{ repository: 'foo/bad', category: 'PROCESS_FAILED' } as never],
            repoResults: [
                { alertsCount: 0, fixed: 0 } as never,
                { alertsCount: 2, fixed: 2, verificationPassed: true } as never,
            ],
        }))
        expect(exitCode).toBe(1)
    })

    it('returns 0 for fix-and-pr mode on a clean run (no errors, no failures)', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            repoResults: [{ alertsCount: 0, fixed: 0, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 0 for cleanup-branches mode with a successful branch-cleanup action', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'cleanup-branches' } as AppContext['config'],
            allActions: [{ type: 'branch-cleanup', success: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 2 for cleanup-branches mode with errors', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'cleanup-branches' } as AppContext['config'],
            allErrors: [{ repository: 'foo/bar', category: 'PROCESS_FAILED' } as never],
        }))
        expect(exitCode).toBe(2)
    })

    it('returns 1 when failed actions and errors coexist with repo success', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{ success: false } as never],
            allErrors: [{ repository: 'foo/bar', category: 'PROCESS_FAILED' } as never],
            repoResults: [{ alertsCount: 3, fixed: 2, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(1)
    })
})
