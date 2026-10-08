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

    // "跳过类"审计条目不影响 exit code
    it('returns 0 when only OVERRIDE_PROTECTED skipped audits exist', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fix',
                category: 'OVERRIDE_PROTECTED',
                message: 'package lodash@4.17.21 is protected from override',
            } as never],
            repoResults: [{ alertsCount: 1, fixed: 0, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 0 when only SCRIPT_NOT_FOUND skipped audits exist', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{
                repository: 'foo/bar',
                stage: 'verify',
                category: 'SCRIPT_NOT_FOUND',
                message: 'pnpm test script not found',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 0 when multiple skipped audit categories coexist', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [
                { repository: 'foo/bar', stage: 'fix', category: 'OVERRIDE_PROTECTED', message: 'protected' } as never,
                { repository: 'foo/baz', stage: 'verify', category: 'SCRIPT_NOT_FOUND', message: 'no test script' } as never,
            ],
            repoResults: [
                { alertsCount: 1, fixed: 0, verificationPassed: true } as never,
                { alertsCount: 0, fixed: 0, verificationPassed: true } as never,
            ],
        }))
        expect(exitCode).toBe(0)
    })

    // 跳过类 + 真实失败 → 非 0
    it('returns 1 when skipped audit + real failure coexist', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [
                { repository: 'foo/bar', stage: 'fix', category: 'OVERRIDE_PROTECTED', message: 'protected' } as never,
                { repository: 'foo/bad', stage: 'fix', category: 'PROCESS_FAILED', message: 'real failure' } as never,
            ],
            repoResults: [
                { alertsCount: 1, fixed: 0, verificationPassed: true } as never,
                { alertsCount: 0, fixed: 0 } as never,
            ],
        }))
        expect(exitCode).toBe(1)
    })

    it('returns 1 when skipped audit + failed action coexist', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{ success: false } as never],
            allErrors: [{ repository: 'foo/bar', stage: 'verify', category: 'SCRIPT_NOT_FOUND', message: 'no test' } as never],
            repoResults: [{ alertsCount: 0, fixed: 0, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(1)
    })

    it('returns 2 when skipped audit + all repos fail', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [
                { repository: 'foo/bar', stage: 'fix', category: 'OVERRIDE_PROTECTED', message: 'protected' } as never,
                { repository: 'foo/bad', stage: 'fetch', category: 'FETCH_FAILED', message: '403' } as never,
            ],
            repoResults: [
                { alertsCount: 0, fixed: 0 } as never,
                { alertsCount: 0, fixed: 0 } as never,
            ],
        }))
        expect(exitCode).toBe(2)
    })

    // 回归：既有基线失败（PRE_EXISTING_FAILURE）不归因本次运行，不得影响 exit code
    // （2026-10-08 定时扫描「全部失败」根因：仅既有失败的仓库被判 exit 2 → 平台 engine_exit_2 误标 failed）
    it('returns 0 when only PRE_EXISTING_FAILURE audits exist (既有失败不归因本次运行)', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{
                repository: 'CaoMeiYouRen/rss-impact-server',
                target: 'pnpm install --frozen-lockfile',
                stage: 'verify',
                category: 'PRE_EXISTING_FAILURE',
                message: 'Pre-existing failure (already failing before this run; not caused by this change): pnpm install --frozen-lockfile',
            } as never],
            repoResults: [{
                alertsCount: 0,
                fixed: 0,
                verificationPassed: false,
                verificationBlocking: false,
            } as never],
        }))
        expect(exitCode).toBe(0)
    })

    // 回归：既有失败仓库仍计为「成功仓库」→ 与真实失败仓库并存时返回 1（而非 2）
    // 判定用归因口径 verificationBlocking，而非原始口径 verificationPassed
    it('counts a pre-existing-only verification failure as repo success (exit 1, not 2)', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: 'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
            } as never],
            repoResults: [{
                alertsCount: 5,
                fixed: 0,
                verificationPassed: false,
                verificationBlocking: false,
            } as never],
        }))
        expect(exitCode).toBe(1)
    })

    // 反例防护：本次改动引入的验证失败（verificationBlocking=true）仍判该仓库失败（exit 2，不因修复而放宽）
    it('still returns 2 when the verification failure is attributed (verificationBlocking=true)', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            allErrors: [{
                repository: 'foo/bar',
                stage: 'verify',
                category: 'VERIFICATION_FAILED',
                message: 'Verification failed for foo/bar; commit skipped',
            } as never],
            allActions: [{
                type: 'verification',
                repository: 'foo/bar',
                target: 'pnpm test',
                success: false,
                error: 'exit code 1',
            } as never],
            repoResults: [{
                alertsCount: 5,
                fixed: 0,
                verificationPassed: false,
                verificationBlocking: true,
            } as never],
        }))
        expect(exitCode).toBe(2)
    })

    // 回归：仅有既有失败、且失败动作全部为既有失败验证 → 无真实失败 → 返回 0
    // （无告警/修复产出时，失败验证 action 也不得把运行判为失败）
    it('returns 0 when the only failed actions are pre-existing verification failures', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            allErrors: [{
                repository: 'CaoMeiYouRen/rss-impact-server',
                target: 'pnpm install --frozen-lockfile',
                stage: 'verify',
                category: 'PRE_EXISTING_FAILURE',
                message: 'Pre-existing failure (already failing before this run; not caused by this change): pnpm install --frozen-lockfile',
            } as never],
            allActions: [{
                type: 'verification',
                repository: 'CaoMeiYouRen/rss-impact-server',
                target: 'pnpm install --frozen-lockfile',
                success: false,
                preExisting: true,
                error: 'exit code 1',
            } as never],
            repoResults: [{
                alertsCount: 0,
                fixed: 0,
                verificationPassed: false,
                verificationBlocking: false,
            } as never],
        }))
        expect(exitCode).toBe(0)
    })
})
