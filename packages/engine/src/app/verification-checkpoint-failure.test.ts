// verification-checkpoint-failure.test.ts — checkpoint 建立失败的分类、证据快照与中止档。
//
// 口径（见 docs/design/governance/run-failure-taxonomy.md 单元回滚小节）：
// - 索引锁 / 权限 / 磁盘 → 工作区不可可靠回滚 → 记降级审计 + 中止运行（ABORTED 计入退出码）
// - 其余（含无诊断文本）→ 仅降级到整仓回滚，继续交付
// - 两条路径都必须留下 stderr 尾部 + `git status --porcelain` + `git rev-parse HEAD` 快照
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyRunSummary } from '@dependfix/core'
import { isAbortRequested, resetProcessControlState } from '../runners/process-control'
import type { RepoFixCtx } from './repo-fix'
import { classifyCheckpointFailure, recordVerificationCheckpoint } from './verification-checkpoint'

const { mockRunGit } = vi.hoisted(() => ({ mockRunGit: vi.fn() }))

vi.mock('../github/git-run', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../github/git-run')>()
    return { ...actual, runGit: mockRunGit }
})

const makeCtx = (workDir: string): RepoFixCtx => ({
    config: { dryRun: false, rollbackGranularity: 'unit' } as never,
    workDir,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    runId: 'run-1',
    allAlerts: [],
    allActions: [],
    allErrors: [],
    alertsDisabled: [],
    repoResults: [],
    summary: createEmptyRunSummary(),
    startedAt: new Date().toISOString(),
    finishedAt: '',
    aiUsageRef: { aggregate: undefined },
    verificationCheckpoints: [],
    checkpointFailures: new Set<string>(),
})

/** 只放行 `stash create` 失败，其余（status / rev-parse）返回给定快照。 */
const mockStashFailure = (stderr: string): void => {
    mockRunGit.mockImplementation(async (args: string[]) => {
        const command = args.join(' ')
        if (command.startsWith('stash create')) {
            return { stdout: '', stderr, code: 1, timedOut: false, aborted: false, started: true, truncated: false }
        }
        if (command === 'status --porcelain') {
            return { stdout: ' M package.json\n', stderr: '', code: 0, timedOut: false, aborted: false, started: true, truncated: false }
        }
        if (command === 'rev-parse HEAD') {
            return { stdout: 'deadbeefcafe\n', stderr: '', code: 0, timedOut: false, aborted: false, started: true, truncated: false }
        }
        return { stdout: '', stderr: '', code: 1, timedOut: false, aborted: false, started: true, truncated: false }
    })
}

describe('classifyCheckpointFailure', () => {
    it('索引锁 / 权限 / 磁盘 → 中止档', () => {
        expect(classifyCheckpointFailure({ stderr: 'fatal: Unable to create /tmp/x/.git/index.lock: File exists.' }))
            .toEqual({ cause: 'index-lock', tier: 'abort' })
        expect(classifyCheckpointFailure({ stderr: 'error: unable to write file: Permission denied' }))
            .toEqual({ cause: 'permission', tier: 'abort' })
        expect(classifyCheckpointFailure({ stderr: 'fatal: write error: No space left on device' }))
            .toEqual({ cause: 'disk', tier: 'abort' })
    })

    it('无诊断 / 未知原因 → 降级档（继续交付）', () => {
        expect(classifyCheckpointFailure({ stderr: '' })).toEqual({ cause: 'unknown', tier: 'degrade' })
        expect(classifyCheckpointFailure({ stderr: 'fatal: something unexpected' }))
            .toEqual({ cause: 'unknown', tier: 'degrade' })
        // 异常信息也参与分类（catch 分支）
        expect(classifyCheckpointFailure({ message: 'checkpoint acked: EACCES' }))
            .toEqual({ cause: 'permission', tier: 'abort' })
    })
})

describe('recordVerificationCheckpoint 失败处理', () => {
    let workDir: string
    let ctx: RepoFixCtx

    beforeEach(() => {
        resetProcessControlState()
        mockRunGit.mockReset()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-checkpoint-failure-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        execSync('git commit -q --allow-empty -m init', { cwd: workDir })
        ctx = makeCtx(workDir)
    })

    afterEach(() => {
        resetProcessControlState()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('未知失败 → 降级审计含 stderr / status / HEAD 快照，且不中止运行', async () => {
        mockStashFailure('fatal: something unexpected')

        const checkpoint = await recordVerificationCheckpoint(
            ctx, 'foo/bar',
            { alertsCount: 1, fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, verificationPassed: undefined, verificationBlocking: undefined, defaultBranch: 'main' },
            'unit-a',
        )

        expect(checkpoint).toBeUndefined()
        expect(isAbortRequested()).toBe(false)
        expect(ctx.allErrors).toHaveLength(1)
        const entry = ctx.allErrors[0]!
        expect(entry.category).toBe('ROLLBACK_GRANULARITY_DEGRADED')
        expect(entry.stage).toBe('verify')
        expect(entry.message).toContain('(unknown)')
        expect(entry.message).toContain('stderr=fatal: something unexpected')
        expect(entry.message).toContain('status= M package.json')
        expect(entry.message).toContain('head=deadbeefcafe')
        expect(ctx.allErrors.some((error) => error.category === 'ABORTED')).toBe(false)
    })

    it('跨仓库同因各自保留审计（去重键含仓库）', async () => {
        mockStashFailure('fatal: something unexpected')
        const progress = {
            alertsCount: 1, fixable: 1, fixed: 0, failed: 0,
            lockfileRepaired: false, verificationPassed: undefined, verificationBlocking: undefined, defaultBranch: 'main',
        }

        await recordVerificationCheckpoint(ctx, 'foo/a', progress, 'unit-a')
        await recordVerificationCheckpoint(ctx, 'foo/b', progress, 'unit-a')

        const entries = ctx.allErrors.filter((error) => error.category === 'ROLLBACK_GRANULARITY_DEGRADED')
        expect(entries.map((error) => error.repository)).toEqual(['foo/a', 'foo/b'])
    })

    it('索引锁 → 降级审计 + 中止运行（ABORTED 计入退出码），同仓同因不重复记审计', async () => {
        mockStashFailure('fatal: Unable to create /repo/.git/index.lock: File exists.')
        const progress = {
            alertsCount: 1, fixable: 1, fixed: 0, failed: 0,
            lockfileRepaired: false, verificationPassed: undefined, verificationBlocking: undefined, defaultBranch: 'main',
        }

        await recordVerificationCheckpoint(ctx, 'foo/bar', progress, 'unit-a')
        await recordVerificationCheckpoint(ctx, 'foo/bar', progress, 'unit-b')

        expect(isAbortRequested()).toBe(true)
        const categories = ctx.allErrors.map((error) => error.category)
        expect(categories.filter((category) => category === 'ROLLBACK_GRANULARITY_DEGRADED')).toHaveLength(1)
        expect(categories).toContain('ABORTED')
        expect(ctx.allErrors.find((error) => error.category === 'ABORTED')?.repository).toBe('*')
        expect(ctx.allErrors.find((error) => error.category === 'ROLLBACK_GRANULARITY_DEGRADED')?.message)
            .toContain('workspace not usable for rollback')
        // 逐单元重试仍逐次留日志（审计去重只作用于报告面）
        expect((ctx.logger.warn as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThanOrEqual(2)
    })
})
