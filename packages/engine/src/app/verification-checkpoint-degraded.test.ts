// verification-checkpoint-degraded.test.ts — 真实 git 下的 checkpoint 失败形态与降级不误伤选择性回滚。
//
// 关键实证（git 2.43）：索引锁存在时 `git stash create` **静默退出 1**（stdout / stderr 均空），
// 因此分类不能只看文本，必须探测 git dir 的 `index.lock`。另锁定「审计类降级条目不得反向禁用
// 选择性回滚」——checkpoint 之后新增的 `ROLLBACK_GRANULARITY_DEGRADED` 不参与「后续失败」判定，
// 且整仓回滚截断审计时保留该条（解释降级原因）。
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyRunSummary } from '@dependfix/core'
import { isAbortRequested, resetProcessControlState } from '../runners/process-control'
import type { RepoFixCtx, RepoFixProgress } from './repo-fix'
import {
    attemptSelectiveUnitRollback,
    classifyProbeError,
    recordVerificationCheckpoint,
    resolveCheckpointFailure,
} from './verification-checkpoint'

const makeProgress = (): RepoFixProgress => ({
    alertsCount: 1,
    fixable: 1,
    fixed: 0,
    failed: 0,
    lockfileRepaired: false,
    verificationPassed: undefined,
    verificationBlocking: undefined,
    defaultBranch: 'main',
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

describe('checkpoint 失败分类的辅助判据', () => {
    it('探测 errno → 失败原因', () => {
        expect(classifyProbeError('EACCES')).toBe('permission')
        expect(classifyProbeError('EROFS')).toBe('permission')
        expect(classifyProbeError('ENOSPC')).toBe('disk')
        expect(classifyProbeError('EDQUOT')).toBe('disk')
        expect(classifyProbeError('EIO')).toBe('unknown')
        expect(classifyProbeError(undefined)).toBe('unknown')
    })

    it('文本分类与探测结果合并：文本命中优先，未知时采用探测', () => {
        expect(resolveCheckpointFailure({ cause: 'disk', tier: 'abort' }, 'index-lock'))
            .toEqual({ cause: 'disk', tier: 'abort' })
        expect(resolveCheckpointFailure({ cause: 'unknown', tier: 'degrade' }, 'index-lock'))
            .toEqual({ cause: 'index-lock', tier: 'abort' })
        expect(resolveCheckpointFailure({ cause: 'unknown', tier: 'degrade' }, undefined))
            .toEqual({ cause: 'unknown', tier: 'degrade' })
    })
})

describe('真实 git：索引锁与降级不误伤选择性回滚', () => {
    let workDir: string
    let ctx: RepoFixCtx
    let progress: RepoFixProgress

    beforeEach(() => {
        resetProcessControlState()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-checkpoint-degraded-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), 'v1\n')
        execSync('git add . && git commit -qm init', { cwd: workDir })
        ctx = makeCtx(workDir)
        progress = makeProgress()
    })

    afterEach(() => {
        resetProcessControlState()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('索引锁存在（stash create 静默失败）→ 探测命中 index.lock 并中止运行', async () => {
        writeFileSync(join(workDir, 'package.json'), 'v2\n')
        writeFileSync(join(workDir, '.git', 'index.lock'), '')

        const checkpoint = await recordVerificationCheckpoint(ctx, 'foo/bar', progress, 'unit-a')

        expect(checkpoint).toBeUndefined()
        expect(isAbortRequested()).toBe(true)
        const degraded = ctx.allErrors.find((error) => error.category === 'ROLLBACK_GRANULARITY_DEGRADED')
        expect(degraded?.message).toContain('(index-lock)')
        expect(degraded?.message).toContain('index.lock present')
        expect(degraded?.message).toContain('; run aborted')
        expect(ctx.allErrors.some((error) => error.category === 'ABORTED')).toBe(true)
    })

    it('checkpoint 之后的审计类降级条目不禁用选择性回滚，且截断时保留', async () => {
        // 单元 A：已保留的改动 + checkpoint
        ctx.allActions.push({ type: 'dependency-upgrade', repository: 'foo/bar', target: 'a', success: true })
        progress.fixed = 1
        writeFileSync(join(workDir, 'package.json'), 'v2\n')
        expect(await recordVerificationCheckpoint(ctx, 'foo/bar', progress, 'unit-b')).toBeDefined()

        // 单元 B 的 checkpoint 失败留下一条审计类降级条目（不改变退出码）
        ctx.allErrors.push({
            repository: 'foo/bar',
            stage: 'verify',
            category: 'ROLLBACK_GRANULARITY_DEGRADED',
            message: 'checkpoint creation failed (unknown) — test fixture',
        })
        ctx.allActions.push({ type: 'dependency-upgrade', repository: 'foo/bar', target: 'b', success: true })
        progress.fixed = 2
        writeFileSync(join(workDir, 'package.json'), 'v3\n')

        const outcome = await attemptSelectiveUnitRollback(ctx, 'foo/bar', progress, async () => [])

        expect(outcome.applied).toBe(true)
        expect(outcome.blocking).toBe(false)
        // 回退到单元 B 之前：B 的动作被截断，A 保留
        expect(ctx.allActions.map((action) => action.target)).toEqual(['a'])
        expect(progress.fixed).toBe(1)
        // 降级审计保留（解释为何曾降级），且没有多余的第二条
        expect(ctx.allErrors.filter((error) => error.category === 'ROLLBACK_GRANULARITY_DEGRADED')).toHaveLength(1)
        expect(ctx.allErrors[0]?.message).toContain('test fixture')
    })
})
