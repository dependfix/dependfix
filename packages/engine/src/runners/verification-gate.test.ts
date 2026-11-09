import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixError } from '@dependfix/core'
import { requestAbort, resetProcessControlState } from './process-control'
import { enforceVerificationGate, findVerificationFailedRepos, isRepoVerificationBlocked, rollbackChanges } from './verification-gate'

// ---------------------------------------------------------------------------
// findVerificationFailedRepos（验证门禁：失败仓库清单）
// ---------------------------------------------------------------------------

describe('findVerificationFailedRepos', () => {
    it('returns empty array when all repos passed verification', () => {
        expect(findVerificationFailedRepos([
            { repository: 'foo/a', verificationPassed: true } as never,
            { repository: 'foo/b', verificationPassed: undefined } as never,
        ])).toEqual([])
    })

    it('returns repos whose verification failed', () => {
        expect(findVerificationFailedRepos([
            { repository: 'foo/a', verificationPassed: true } as never,
            { repository: 'foo/b', verificationPassed: false } as never,
            { repository: 'foo/c', verificationPassed: false } as never,
        ])).toEqual(['foo/b', 'foo/c'])
    })

    it('verificationBlocking=false（链路未全绿但仅既有失败）→ 不阻断交付', () => {
        expect(findVerificationFailedRepos([
            { repository: 'foo/a', verificationPassed: false, verificationBlocking: false } as never,
        ])).toEqual([])
    })

    it('verificationBlocking=true（存在本次引入的失败）→ 阻断交付，与 verificationPassed 无关', () => {
        expect(findVerificationFailedRepos([
            { repository: 'foo/a', verificationPassed: true, verificationBlocking: true } as never,
        ])).toEqual(['foo/a'])
    })

    it('未提供 verificationBlocking（旧数据）→ 回退 verificationPassed === false', () => {
        expect(findVerificationFailedRepos([
            { repository: 'foo/a', verificationPassed: false, verificationBlocking: undefined } as never,
            { repository: 'foo/b', verificationPassed: undefined, verificationBlocking: undefined } as never,
        ])).toEqual(['foo/a'])
    })
})

// ---------------------------------------------------------------------------
// isRepoVerificationBlocked（归因口径单一事实源，退出码与门禁共用）
// ---------------------------------------------------------------------------

describe('isRepoVerificationBlocked', () => {
    it('verificationBlocking 优先于 verificationPassed（既有失败不阻断）', () => {
        expect(isRepoVerificationBlocked({
            verificationPassed: false,
            verificationBlocking: false,
        })).toBe(false)
        expect(isRepoVerificationBlocked({
            verificationPassed: true,
            verificationBlocking: true,
        })).toBe(true)
    })

    it('verificationBlocking 未提供时回退原始口径（verificationPassed === false）', () => {
        expect(isRepoVerificationBlocked({ verificationPassed: false, verificationBlocking: undefined })).toBe(true)
        expect(isRepoVerificationBlocked({ verificationPassed: true, verificationBlocking: undefined })).toBe(false)
        expect(isRepoVerificationBlocked({ verificationPassed: undefined, verificationBlocking: undefined })).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// rollbackChanges（验证失败回滚）
// ---------------------------------------------------------------------------

describe('rollbackChanges', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-rollback-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('discards uncommitted fix changes (working tree + index)', async () => {
        writeFileSync(join(workDir, 'package.json'), '{"version":"1.0.0"}')
        execSync('git add . && git commit -qm init', { cwd: workDir })

        // 模拟修复改动：修改已跟踪文件 + 暂存
        writeFileSync(join(workDir, 'package.json'), '{"version":"2.0.0"}')
        execSync('git add package.json', { cwd: workDir })

        await rollbackChanges(workDir)

        expect(execSync('git status --porcelain', { cwd: workDir, encoding: 'utf-8' }).trim()).toBe('')
        expect(execSync('git show HEAD:package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version":"1.0.0"')
    }, 30_000) // git 操作在 Windows 并行测试负载下可能较慢：显式放宽超时（默认 5s 偶发超时）
})

// ---------------------------------------------------------------------------
// enforceVerificationGate（验证门禁主流程：审计 + 回滚决策）
// 覆盖以下分支（分支名以符号描述，避免行号漂移）：
// - `failedRepos.length === 0` 早返回 false（所有 repo 通过 → 不阻断交付）
// - `options.action === 'pr'` 三元两个分支（PR creation vs local commit 文案）
// - `options.preExistingDirty` 两个分支（已有未提交改动 → 不自动回滚）
// - 非 git 仓库守卫（无工作树可回滚 → 跳过回滚且不产生 ROLLBACK_FAILED）
// - `try/catch` 的 rollbackChanges 成功 vs 失败（追加 ROLLBACK_FAILED 审计）
// ---------------------------------------------------------------------------

describe('enforceVerificationGate', () => {
    // logger 用 unknown-as 走类型擦除，访问 .error/.warn/.info 时仍保有 Mock 类型
    const baseCtx = (workDir: string) => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as { info: ReturnType<typeof vi.fn>, warn: ReturnType<typeof vi.fn>, error: ReturnType<typeof vi.fn>, debug: ReturnType<typeof vi.fn> },
        workDir,
        allErrors: [] as FixError[],
        repoResults: [
            { repository: 'foo/a', verificationPassed: false } as never,
        ],
    })

    let workDir: string
    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-enforce-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), '{"version":"1.0.0"}')
        execSync('git add . && git commit -qm init', { cwd: workDir })
        // 模拟修复改动：修改已跟踪文件 + 暂存（待 rollback 还原）
        writeFileSync(join(workDir, 'package.json'), '{"version":"2.0.0"}')
        execSync('git add package.json', { cwd: workDir })
    })
    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('所有 repo 通过验证 → 返回 false 不阻断交付（行 47 failedRepos.length === 0 分支）', async () => {
        const ctx = baseCtx(workDir)
        ctx.repoResults = [{ repository: 'foo/a', verificationPassed: true } as never]
        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
        expect(blocked).toBe(false)
        expect(ctx.allErrors).toHaveLength(0)
        expect(ctx.logger.error).not.toHaveBeenCalled()
    })

    it('action=pr → 文案使用 "PR creation"（行 52 action 三元 PR 分支 + 行 61 同三元）', async () => {
        const ctx = baseCtx(workDir)
        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
        expect(blocked).toBe(true)
        expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('skipping PR creation'))
        expect(ctx.allErrors[0]?.message).toContain('PR not created')
    })

    it('action=commit → 文案使用 "local commit"（行 52 action 三元 commit 分支 + 行 61 同三元）', async () => {
        const ctx = baseCtx(workDir)
        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'commit' })
        expect(blocked).toBe(true)
        expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('skipping local commit'))
        expect(ctx.allErrors[0]?.message).toContain('commit skipped')
    })

    it('preExistingDirty=true → 不自动回滚，warn 提示手动处理（行 64 preExistingDirty 真分支）', async () => {
        const ctx = baseCtx(workDir)
        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: true, action: 'pr' })
        expect(blocked).toBe(true)
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('pre-existing uncommitted changes'))
        // 不调用 rollbackChanges → 已修改的 package.json 应保留 '2.0.0'
        expect(execSync('git show :package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version":"2.0.0"')
    })

    it('rollbackChanges 成功 → 还原 package.json 到 1.0.0 + 记录 VERIFICATION_FAILED 审计（行 71 try 成功分支）', async () => {
        const ctx = baseCtx(workDir)
        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
        expect(blocked).toBe(true)
        expect(ctx.logger.info).toHaveBeenCalledWith('Changes rolled back')
        // 已暂存的 '2.0.0' 应被回滚到 HEAD（'1.0.0'）
        expect(execSync('git show :package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version":"1.0.0"')
        expect(ctx.allErrors.map((e) => e.category)).toEqual(['VERIFICATION_FAILED'])
    })

    it('非 git 仓库 → 跳过回滚（warn，不追加 ROLLBACK_FAILED；结论仍为中止交付）', async () => {
        const nonGitDir = mkdtempSync(join(tmpdir(), 'dependfix-nongit-'))
        try {
            const ctx = baseCtx(nonGitDir)
            const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
            expect(blocked).toBe(true)
            expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('不是 git 仓库'))
            // 审计优先：VERIFICATION_FAILED 仍记录；无工作树可回滚 → 不产生 ROLLBACK_FAILED
            expect(ctx.allErrors.map((e) => e.category)).toEqual(['VERIFICATION_FAILED'])
        } finally {
            rmSync(nonGitDir, { recursive: true, force: true })
        }
    })

    it('rollbackChanges 失败（git 仓库但 HEAD 不可解析，如尚无提交）→ 追加 ROLLBACK_FAILED 审计，不掩盖 VERIFICATION_FAILED', async () => {
        const emptyRepo = mkdtempSync(join(tmpdir(), 'dependfix-emptyrepo-'))
        try {
            // 空仓库（无任何提交）：isGitRepository 为 true（rev-parse --git-dir 成功），
            // 但 `git reset --hard HEAD` 无法解析 HEAD → 回滚抛错 → ROLLBACK_FAILED 分支
            execSync('git init -q', { cwd: emptyRepo })
            const ctx = baseCtx(emptyRepo)
            const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
            expect(blocked).toBe(true)
            expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('Rollback failed'))
            // VERIFICATION_FAILED + ROLLBACK_FAILED 两条审计并存
            const categories = ctx.allErrors.map((e) => e.category)
            expect(categories).toContain('VERIFICATION_FAILED')
            expect(categories).toContain('ROLLBACK_FAILED')
        } finally {
            rmSync(emptyRepo, { recursive: true, force: true })
        }
    })
})

// ---------------------------------------------------------------------------
// 预算跳过终验：不交付但也不回滚（保留已通过单元）
// ---------------------------------------------------------------------------

describe('enforceVerificationGate — 预算跳过', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-budget-gate-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), '{"version":"1.0.0"}\n')
        execSync('git add . && git commit -qm init', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), '{"version":"2.0.0"}\n')
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('只含预算跳过的仓库 → 中止交付、不回滚、不记 VERIFICATION_FAILED', async () => {
        const ctx = {
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
            workDir,
            allErrors: [] as FixError[],
            repoResults: [{
                repository: 'foo/a',
                verificationPassed: undefined,
                verificationBlocking: true,
                verificationSkipped: 'budget' as const,
            }],
        }

        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })

        expect(blocked).toBe(true)
        expect(ctx.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('foo/a (run budget exhausted) — delivery skipped'),
        )
        // 未验证不等于验证失败：不写 VERIFICATION_FAILED
        expect(ctx.allErrors).toEqual([])
        // 工作区保留（未回滚）：修复改动仍在
        expect(execSync('git status --porcelain package.json', { cwd: workDir, encoding: 'utf-8' }).trim()).not.toBe('')
    })

    it('0 写入跳过不阻断交付（无改动即无可归因失败），也不记 VERIFICATION_FAILED', async () => {
        const ctx = {
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
            workDir,
            allErrors: [] as FixError[],
            repoResults: [{
                repository: 'foo/a',
                verificationPassed: undefined,
                verificationBlocking: false,
                verificationSkipped: 'no-write' as const,
            }],
        }

        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })

        // 未验证 ≠ 失败：不阻断（其他仓库已通过验证的修复照常交付），也不回滚
        expect(blocked).toBe(false)
        expect(ctx.allErrors).toEqual([])
        expect(execSync('git status --porcelain package.json', { cwd: workDir, encoding: 'utf-8' }).trim()).not.toBe('')
    })

    it('预算跳过与真实失败并存 → 仅真实失败仓库记 VERIFICATION_FAILED 并回滚', async () => {
        const ctx = {
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
            workDir,
            allErrors: [] as FixError[],
            repoResults: [
                {
                    repository: 'foo/skip',
                    verificationPassed: undefined,
                    verificationBlocking: true,
                    verificationSkipped: 'budget' as const,
                },
                {
                    repository: 'foo/bad',
                    verificationPassed: false,
                    verificationBlocking: true,
                },
            ],
        }

        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })

        expect(blocked).toBe(true)
        // 跳过仓库不进入失败归因
        expect(ctx.allErrors.map((e) => e.category)).toEqual(['VERIFICATION_FAILED'])
        expect(ctx.allErrors[0]!.repository).toContain('foo/bad')
        expect(ctx.allErrors[0]!.repository).not.toContain('foo/skip')
        // 真实失败触发整仓回滚
        expect(execSync('git status --porcelain package.json', { cwd: workDir, encoding: 'utf-8' }).trim()).toBe('')
    })
})

// ---------------------------------------------------------------------------
// 取消态下的回滚（回滚期取消语义）
// ---------------------------------------------------------------------------

describe('rollback during abort', () => {
    let workDir: string

    afterEach(() => {
        resetProcessControlState()
        try {
            rmSync(workDir, { recursive: true, force: true })
        } catch {
            // ignore
        }
    })

    it('取消态下不启动回滚子进程：门禁 warn 且不记 ROLLBACK_FAILED', async () => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-abort-rollback-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), '{"version":"1.0.0"}\n')
        execSync('git add . && git commit -qm init', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), '{"version":"2.0.0"}\n')

        requestAbort('unit test abort')

        await expect(rollbackChanges(workDir)).rejects.toMatchObject({ aborted: true })

        const ctx = {
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
            workDir,
            allErrors: [] as FixError[],
            repoResults: [{ repository: 'foo/a', verificationPassed: false } as never],
        }
        const blocked = await enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
        expect(blocked).toBe(true)
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('aborted before rollback started'))
        // 只有 VERIFICATION_FAILED；主动取消不产生 ROLLBACK_FAILED
        expect(ctx.allErrors.map((e) => e.category)).toEqual(['VERIFICATION_FAILED'])
    })
})
