import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixError } from '@dependfix/core'
import { enforceVerificationGate, findVerificationFailedRepos, rollbackChanges } from './verification-gate'

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

    it('discards uncommitted fix changes (working tree + index)', () => {
        writeFileSync(join(workDir, 'package.json'), '{"version":"1.0.0"}')
        execSync('git add . && git commit -qm init', { cwd: workDir })

        // 模拟修复改动：修改已跟踪文件 + 暂存
        writeFileSync(join(workDir, 'package.json'), '{"version":"2.0.0"}')
        execSync('git add package.json', { cwd: workDir })

        rollbackChanges(workDir)

        expect(execSync('git status --porcelain', { cwd: workDir, encoding: 'utf-8' }).trim()).toBe('')
        expect(execSync('git show HEAD:package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version":"1.0.0"')
    }, 30_000) // git 操作在 Windows 并行测试负载下可能较慢：显式放宽超时（默认 5s 偶发超时）
})

// ---------------------------------------------------------------------------
// enforceVerificationGate（验证门禁主流程：审计 + 回滚决策）
// 补充覆盖以下未触达分支：
// - 行 47 if (failedRepos.length === 0) return false（所有 repo 通过 → 不阻断交付）
// - 行 52/61 options.action === 'pr' 三元两个分支（PR creation vs local commit 文案）
// - 行 64 if (options.preExistingDirty) 两个分支（已有未提交改动 → 不自动回滚）
// - 行 71-83 try/catch：rollbackChanges 成功 vs 失败（追加 ROLLBACK_FAILED 审计）
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

    it('所有 repo 通过验证 → 返回 false 不阻断交付（行 47 failedRepos.length === 0 分支）', () => {
        const ctx = baseCtx(workDir)
        ctx.repoResults = [{ repository: 'foo/a', verificationPassed: true } as never]
        const blocked = enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
        expect(blocked).toBe(false)
        expect(ctx.allErrors).toHaveLength(0)
        expect(ctx.logger.error).not.toHaveBeenCalled()
    })

    it('action=pr → 文案使用 "PR creation"（行 52 action 三元 PR 分支 + 行 61 同三元）', () => {
        const ctx = baseCtx(workDir)
        const blocked = enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
        expect(blocked).toBe(true)
        expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('skipping PR creation'))
        expect(ctx.allErrors[0]?.message).toContain('PR not created')
    })

    it('action=commit → 文案使用 "local commit"（行 52 action 三元 commit 分支 + 行 61 同三元）', () => {
        const ctx = baseCtx(workDir)
        const blocked = enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'commit' })
        expect(blocked).toBe(true)
        expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('skipping local commit'))
        expect(ctx.allErrors[0]?.message).toContain('commit skipped')
    })

    it('preExistingDirty=true → 不自动回滚，warn 提示手动处理（行 64 preExistingDirty 真分支）', () => {
        const ctx = baseCtx(workDir)
        const blocked = enforceVerificationGate(ctx as never, { preExistingDirty: true, action: 'pr' })
        expect(blocked).toBe(true)
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('pre-existing uncommitted changes'))
        // 不调用 rollbackChanges → 已修改的 package.json 应保留 '2.0.0'
        expect(execSync('git show :package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version":"2.0.0"')
    })

    it('rollbackChanges 成功 → 还原 package.json 到 1.0.0 + 记录 VERIFICATION_FAILED 审计（行 71 try 成功分支）', () => {
        const ctx = baseCtx(workDir)
        const blocked = enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
        expect(blocked).toBe(true)
        expect(ctx.logger.info).toHaveBeenCalledWith('Changes rolled back')
        // 已暂存的 '2.0.0' 应被回滚到 HEAD（'1.0.0'）
        expect(execSync('git show :package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version":"1.0.0"')
        expect(ctx.allErrors.map((e) => e.category)).toEqual(['VERIFICATION_FAILED'])
    })

    it('rollbackChanges 失败（非 git 仓库）→ 追加 ROLLBACK_FAILED 审计，不掩盖 VERIFICATION_FAILED（行 74 catch 分支）', () => {
        const nonGitDir = mkdtempSync(join(tmpdir(), 'dependfix-nongit-'))
        try {
            const ctx = baseCtx(nonGitDir)
            const blocked = enforceVerificationGate(ctx as never, { preExistingDirty: false, action: 'pr' })
            expect(blocked).toBe(true)
            expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('Rollback failed'))
            // VERIFICATION_FAILED + ROLLBACK_FAILED 两条审计并存
            const categories = ctx.allErrors.map((e) => e.category)
            expect(categories).toContain('VERIFICATION_FAILED')
            expect(categories).toContain('ROLLBACK_FAILED')
        } finally {
            rmSync(nonGitDir, { recursive: true, force: true })
        }
    })
})
