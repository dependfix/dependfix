import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findVerificationFailedRepos, rollbackChanges } from './verification-gate'

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
    })
})
