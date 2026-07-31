import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'

// Mock execSync to avoid needing pnpm in test environment.
const { mockExecSync } = vi.hoisted(() => ({
    mockExecSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
    execSync: mockExecSync,
}))

import {
    classifyLockfileFailure,
    computeLockfileDiff,
    resolvePnpmVersion,
    repairLockfile,
} from './index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TempProject {
    dir: string
    pkgPath: string
    lockfilePath: string
}

function createTempProject(
    options?: {
        packageManager?: string
        withLockfile?: boolean
    },
): TempProject {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-pnpm-'))
    const pkg: Record<string, unknown> = { name: 'test-project', version: '1.0.0' }
    if (options?.packageManager) {
        pkg.packageManager = options.packageManager
    }
    const pkgPath = join(dir, 'package.json')
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    const lockfilePath = join(dir, 'pnpm-lock.yaml')
    if (options?.withLockfile !== false) {
        writeFileSync(lockfilePath, generateLockfileContent(5, 10))
    }
    return { dir, pkgPath, lockfilePath }
}

function generateLockfileContent(lineCount: number, packageCount: number): string {
    const lines = ['lockfileVersion: \'9.0\'', '', 'importers:', '  .: {}', '', 'packages:']
    for (let i = 0; i < packageCount; i++) {
        lines.push(`  /pkg-${i}@${i % 2 === 0 ? '1.0.0' : '2.0.0'}:`)
        lines.push(`    resolution: {integrity: sha512-${i}}`)
    }
    while (lines.length < lineCount) {
        lines.push('')
    }
    return `${lines.join('\n')}\n`
}

function makeExecError(stderr: string): Error & { stderr: Buffer } {
    const err = new Error(`Command failed: ${stderr.slice(0, 40)}`) as Error & { stderr: Buffer }
    err.stderr = Buffer.from(stderr, 'utf-8')
    return err
}

function cleanupTemp(dir: string): void {
    try {
        rmSync(dir, { recursive: true, force: true })
    } catch {
        /* ignore */
    }
}

beforeEach(() => {
    mockExecSync.mockReset()
})

// ---------------------------------------------------------------------------
// classifyLockfileFailure
// ---------------------------------------------------------------------------

describe('classifyLockfileFailure', () => {
    it('ok when frozen-lockfile passes', () => {
        mockExecSync.mockReturnValue(undefined)
        const result = classifyLockfileFailure('/tmp/test')
        expect(result).toEqual({ ok: true })
    })

    it('LOCKFILE_NOT_FOUND', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('Cannot find pnpm-lock.yaml')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result).toEqual({ ok: false, category: 'LOCKFILE_NOT_FOUND', stderr: expect.stringContaining('Cannot find') as unknown })
    })

    it('MANIFEST_MISMATCH via ERR_PNPM_OUTDATED_LOCKFILE', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('ERR_PNPM_OUTDATED_LOCKFILE')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.ok).toBe(false)
        expect(result.category).toBe('MANIFEST_MISMATCH')
    })

    it('MANIFEST_MISMATCH via "out of sync"', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('lockfile is out of sync')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('MANIFEST_MISMATCH')
    })

    it('LOCKFILE_VERSION_MISMATCH', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('lockfileVersion incompatible: lockfile had been generated with pnpm v10')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('LOCKFILE_VERSION_MISMATCH')
    })

    it('CORRUPTED_LOCKFILE', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('ERR_PNPM_BROKEN_LOCKFILE: broken lockfile')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('CORRUPTED_LOCKFILE')
    })

    it('CREDENTIAL_ERROR via E401', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('E401 Unable to authenticate')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('CREDENTIAL_ERROR')
    })

    it('CREDENTIAL_ERROR via authentication failed', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('authentication failed')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('CREDENTIAL_ERROR')
    })

    it('RESOLVE_ERROR via ERR_PNPM_NO_MATCHING_VERSION', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('ERR_PNPM_NO_MATCHING_VERSION')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('RESOLVE_ERROR')
    })

    it('UNKNOWN for unrecognized error', () => {
        mockExecSync.mockImplementation(() => {
            throw makeExecError('something unexpected happened')
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('UNKNOWN')
    })

    it('UNKNOWN for empty stderr', () => {
        mockExecSync.mockImplementation(() => {
            const err = new Error('failed') as Error & { stderr?: Buffer }
            err.stderr = undefined
            throw err
        })
        const result = classifyLockfileFailure('/tmp/test')
        expect(result.category).toBe('UNKNOWN')
    })
})

// ---------------------------------------------------------------------------
// computeLockfileDiff
// ---------------------------------------------------------------------------

describe('computeLockfileDiff', () => {
    it('returns zero diff when lockfiles are identical', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-diff-test-'))
        const beforePath = join(dir, 'before.yaml')
        const afterPath = join(dir, 'after.yaml')
        const content = generateLockfileContent(20, 5)
        writeFileSync(beforePath, content)
        writeFileSync(afterPath, content)
        const diff = computeLockfileDiff(beforePath, afterPath)
        expect(diff).toEqual({
            linesChanged: 0,
            packagesChanged: 0,
            summary: 'lockfile unchanged',
        })
        cleanupTemp(dir)
    })

    it('detects line count changes', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-diff-test-'))
        const beforePath = join(dir, 'before.yaml')
        const afterPath = join(dir, 'after.yaml')
        writeFileSync(beforePath, generateLockfileContent(20, 5))
        writeFileSync(afterPath, generateLockfileContent(25, 5))
        const diff = computeLockfileDiff(beforePath, afterPath)
        expect(diff.linesChanged).toBe(5)
        expect(diff.summary).toContain('+5 lines')
        cleanupTemp(dir)
    })

    it('detects package count changes', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-diff-test-'))
        const beforePath = join(dir, 'before.yaml')
        const afterPath = join(dir, 'after.yaml')
        writeFileSync(beforePath, generateLockfileContent(20, 3))
        writeFileSync(afterPath, generateLockfileContent(20, 8))
        const diff = computeLockfileDiff(beforePath, afterPath)
        expect(diff.packagesChanged).toBe(5)
        expect(diff.summary).toContain('+5 packages')
        cleanupTemp(dir)
    })

    it('handles missing before file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-diff-test-'))
        const beforePath = join(dir, 'nonexistent.yaml')
        const afterPath = join(dir, 'after.yaml')
        writeFileSync(afterPath, generateLockfileContent(10, 2))
        const diff = computeLockfileDiff(beforePath, afterPath)
        // linesChanged = afterLineCount - 0 = afterLineCount
        expect(diff.linesChanged).toBeGreaterThan(0)
        expect(diff.packagesChanged).toBe(2)
        cleanupTemp(dir)
    })
})

// ---------------------------------------------------------------------------
// resolvePnpmVersion
// ---------------------------------------------------------------------------

describe('resolvePnpmVersion', () => {
    it('returns toolchain.pnpmVersion when provided', () => {
        const proj = createTempProject({ packageManager: 'pnpm@10.5.2' })
        const version = resolvePnpmVersion(proj.dir, { pnpmVersion: '9.0.0' })
        expect(version).toBe('9.0.0')
        cleanupTemp(proj.dir)
    })

    it('falls back to packageManager field', () => {
        const proj = createTempProject({ packageManager: 'pnpm@10.5.2' })
        const version = resolvePnpmVersion(proj.dir)
        expect(version).toBe('10.5.2')
        cleanupTemp(proj.dir)
    })

    it('returns null when neither source available', () => {
        const proj = createTempProject()
        const version = resolvePnpmVersion(proj.dir)
        expect(version).toBeNull()
        cleanupTemp(proj.dir)
    })

    it('returns null for invalid packageManager format', () => {
        const proj = createTempProject({ packageManager: 'yarn@1.22.19' })
        const version = resolvePnpmVersion(proj.dir)
        expect(version).toBeNull()
        cleanupTemp(proj.dir)
    })
})

// ---------------------------------------------------------------------------
// repairLockfile
// ---------------------------------------------------------------------------

describe('repairLockfile', () => {
    let proj: TempProject
    let commandSequence: ('success' | { stderr: string } | Error)[]

    /**
     * 设置 execSync 按调用次数返回不同结果。
     * 每次调用取 commandSequence.shift()。
     */
    function setupExecSequence(): void {
        mockExecSync.mockImplementation(() => {
            const action = commandSequence.shift()
            if (!action) {
                return
            }
            if (action === 'success') {
                return
            }
            if (action instanceof Error) {
                throw action
            }
            throw makeExecError(action.stderr)
        })
    }

    /** 典型修复流程需要的 commandSequence（按调用顺序）:
     *  1. frozen-lockfile 诊断（应失败）
     *  2. 策略命令（应成功）
     *  3. frozen-lockfile 验证（应成功）
     */
    function setupFixableScenario(diagnosisStderr: string): void {
        commandSequence = [
            { stderr: diagnosisStderr }, // diagnosis fails
            'success', // strategy command succeeds
            'success', // verify succeeds
        ]
        setupExecSequence()
    }

    beforeEach(() => {
        proj = createTempProject({ withLockfile: true, packageManager: 'pnpm@10.5.2' })
    })

    afterEach(() => {
        cleanupTemp(proj.dir)
    })

    it('returns success when frozen-lockfile already passes', () => {
        commandSequence = ['success']
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBeUndefined()
        expect(result.diff).toBeNull()
        expect(result.attemptHistory).toHaveLength(0)
    })

    it('LOCKFILE_NOT_FOUND → REGENERATE succeeds', () => {
        setupFixableScenario('Cannot find pnpm-lock.yaml')
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REGENERATE')
        expect(result.diff?.summary).toBeDefined()
        expect(result.attemptHistory).toHaveLength(1)
        expect(result.attemptHistory[0].strategy).toBe('REGENERATE')
        expect(result.attemptHistory[0].success).toBe(true)
    })

    it('MANIFEST_MISMATCH → REGENERATE succeeds', () => {
        setupFixableScenario('ERR_PNPM_OUTDATED_LOCKFILE')
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REGENERATE')
    })

    it('CORRUPTED_LOCKFILE → FIX_ENTRIES succeeds', () => {
        setupFixableScenario('ERR_PNPM_BROKEN_LOCKFILE: broken lockfile')
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('FIX_ENTRIES')
    })

    it('CREDENTIAL_ERROR → SKIP, no repair attempted', () => {
        commandSequence = [{ stderr: 'E401 authentication failed' }]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(false)
        expect(result.strategy).toBe('SKIP')
        expect(result.failureCategory).toBe('CREDENTIAL_ERROR')
        expect(result.attemptHistory).toHaveLength(0)
    })

    it('REGENERATE fails → escalates to REINSTALL', () => {
        commandSequence = [
            { stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' }, // diagnosis fails
            makeExecError('REGENERATE failed'), // REGENERATE fails
            'success', // REINSTALL succeeds
            'success', // verify succeeds
        ]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REINSTALL')
        expect(result.attemptHistory).toHaveLength(2)
        expect(result.attemptHistory[0].strategy).toBe('REGENERATE')
        expect(result.attemptHistory[0].success).toBe(false)
        expect(result.attemptHistory[1].strategy).toBe('REINSTALL')
        expect(result.attemptHistory[1].success).toBe(true)
    })

    it('all strategies fail → rollback, returns failure', () => {
        commandSequence = [
            { stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' },
            makeExecError('REGENERATE fail'),
            makeExecError('REINSTALL fail'),
        ]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(false)
        expect(result.failureCategory).toBe('MANIFEST_MISMATCH')
        // attemptHistory should include the failed strategies + rollback SKIP
        expect(result.attemptHistory.length).toBeGreaterThanOrEqual(2)
    })

    it('strategy command succeeds but verify fails → escalate', () => {
        commandSequence = [
            { stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' },
            'success', // REGENERATE succeeds
            makeExecError('ERR_PNPM_OUTDATED_LOCKFILE'), // verify fails (same error)
            'success', // REINSTALL succeeds
            'success', // verify succeeds
        ]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REINSTALL')
    })

    it('records attemptHistory with duration and errors', () => {
        commandSequence = [
            { stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' },
            makeExecError('REGENERATE error details'),
            'success',
            'success',
        ]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.attemptHistory[0]).toMatchObject({
            strategy: 'REGENERATE',
            success: false,
            command: 'pnpm install --lockfile-only',
            error: expect.stringContaining('REGENERATE') as unknown,
        })
        expect(result.attemptHistory[0].durationMs).toBeGreaterThanOrEqual(0)
    })

    it('LOCKFILE_VERSION_MISMATCH includes PIN_TOOLCHAIN in chain', () => {
        // PIN_TOOLCHAIN first (fails) → REGENERATE succeeds
        commandSequence = [
            { stderr: 'lockfile had been generated with pnpm v7' },
            makeExecError('corepack not found'), // PIN_TOOLCHAIN fails
            'success', // REGENERATE succeeds
            'success', // verify succeeds
        ]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REGENERATE')
        expect(result.attemptHistory[0].strategy).toBe('PIN_TOOLCHAIN')
    })

    it('RESOLVE_ERROR → REGENERATE then FIX_ENTRIES then REINSTALL', () => {
        // Chain: REGENERATE → FIX_ENTRIES → REINSTALL
        commandSequence = [
            { stderr: 'ERR_PNPM_NO_MATCHING_VERSION No matching version found' },
            makeExecError('REGENERATE fail'),
            'success', // FIX_ENTRIES succeeds
            'success', // verify succeeds
        ]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('FIX_ENTRIES')
    })

    it('UNKNOWN → REGENERATE then REINSTALL', () => {
        commandSequence = [
            { stderr: 'completely unexpected error XYZ' },
            'success', // REGENERATE succeeds
            'success', // verify succeeds
        ]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.success).toBe(true)
        expect(result.strategy).toBe('REGENERATE')
    })

    it('accepts toolchain param (currently not consumed by implementation)', () => {
        commandSequence = ['success']
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir, toolchain: { pnpmVersion: '9.0.0' } })
        expect(result.success).toBe(true)
    })

    it('diff is null when no repair needed', () => {
        commandSequence = ['success']
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.diff).toBeNull()
    })

    it('failureDetail is truncated when very long (CREDENTIAL_ERROR)', () => {
        const longStderr = `E401 ${'X'.repeat(600)}`
        commandSequence = [{ stderr: longStderr }]
        setupExecSequence()
        const result = repairLockfile({ workDir: proj.dir })
        expect(result.failureCategory).toBe('CREDENTIAL_ERROR')
        // failureDetail should be ≤ prefix + truncate(500) + "…"
        expect(result.failureDetail.length).toBeLessThanOrEqual(550)
        expect(result.failureDetail).toContain('\u2026')
    })
})

