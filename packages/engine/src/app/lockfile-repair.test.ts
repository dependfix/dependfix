// lockfile-repair.test.ts — tryLockfileRepair（toolchain 传递 + 格式漂移标注）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixError } from '@dependfix/core'
import { tryLockfileRepair, type AppContext } from './helpers'

// ---------------------------------------------------------------------------
// Mock engine 内部模块（tryLockfileRepair 依赖 repairLockfile，避免真实 pnpm）
// ---------------------------------------------------------------------------

const pnpmFixerMock = vi.hoisted(() => ({
    repairLockfile: vi.fn(),
}))

vi.mock('../fixers/pnpm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../fixers/pnpm')>()
    return { ...actual, repairLockfile: pnpmFixerMock.repairLockfile }
})

describe('tryLockfileRepair', () => {
    const loggerMocks = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const logger = loggerMocks as never

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('passes toolchain pnpm version from config to repairLockfile', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: true,
            diff: { summary: 'lockfile updated: +10 lines' },
            attemptHistory: [],
        })

        const action = await tryLockfileRepair({
            config: { dryRun: false, toolchainPnpmVersion: '10.5.2' } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        }, 'foo/bar')

        expect(pnpmFixerMock.repairLockfile).toHaveBeenCalledWith({
            workDir: '/tmp/work',
            toolchain: { pnpmVersion: '10.5.2' },
        })
        expect(action.success).toBe(true)
        expect(action.diff).toBe('lockfile updated: +10 lines')
        expect(action.environmentalFailure).toBeUndefined()
        // changed 缺省（类型可选）时不夸大语义：既不说「已修复」也不说「已合规」
        expect(loggerMocks.info).toHaveBeenCalledWith('Lockfile repair completed for foo/bar (change status unknown)')
    })

    it('annotates diff when lockfileVersion changed (format drift guard)', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: true,
            diff: { summary: 'lockfile updated: +10 lines' },
            attemptHistory: [],
            lockfileVersion: '9.0',
            lockfileVersionChanged: true,
        })

        const action = await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        }, 'foo/bar')

        expect(action.diff).toBe('lockfile updated: +10 lines (lockfileVersion changed)')
    })

    it('marks noOp when the lockfile was already compliant (changed === false)', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: true,
            diff: { summary: 'lockfile unchanged', linesChanged: 0, packagesChanged: 0 },
            changed: false,
            attemptHistory: [],
        })

        const action = await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        }, 'foo/bar')

        expect(action.success).toBe(true)
        expect(action.noOp).toBe(true)
        // 中性文案：已合规 ≠ 修复生效（旧串 `Lockfile repaired` 会让用户误读为「修好未提交」）
        expect(loggerMocks.info).toHaveBeenCalledWith('Lockfile already compliant for foo/bar — no repair needed')
        expect(JSON.stringify(loggerMocks.info.mock.calls)).not.toContain('Lockfile repaired')
    })

    it('does not mark noOp when the repair changed the lockfile', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: true,
            diff: { summary: 'lockfile updated: +10 lines', linesChanged: 10, packagesChanged: 1 },
            changed: true,
            attemptHistory: [],
        })

        const action = await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        }, 'foo/bar')

        expect(action.success).toBe(true)
        expect(action.noOp).toBeUndefined()
        // 「有改动」路径语义不变，但文案与「已合规」区分（旧串不再出现在任何路径）
        expect(loggerMocks.info).toHaveBeenCalledWith('Lockfile repair applied for foo/bar (strategy: N/A)')
    })

    it('returns early success record in dry-run mode', async () => {
        const action = await tryLockfileRepair({
            config: { dryRun: true } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        }, 'foo/bar')

        expect(action.success).toBe(true)
        expect(pnpmFixerMock.repairLockfile).not.toHaveBeenCalled()
    })

    // 环境性安装失败（无 stderr 诊断）：标记 environmentalFailure + 记非归因审计条目
    it('marks environmentalFailure and records a non-attributed audit entry', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: false,
            failureCategory: 'ENVIRONMENT_ERROR',
            failureDetail: 'environmental install failure (exit code 1): no stderr diagnostics',
            attemptHistory: [],
            environmental: true,
        })
        const allErrors: FixError[] = []

        const action = await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors,
        }, 'foo/bar')

        expect(action.success).toBe(false)
        expect(action.environmentalFailure).toBe(true)
        expect(action.error).toContain('environmental install failure')
        expect(allErrors).toHaveLength(1)
        expect(allErrors[0]).toMatchObject({ repository: 'foo/bar', stage: 'repair', category: 'ENVIRONMENT_ERROR' })
    })

    // 非环境性失败（无 environmental 标记）：不记审计条目、不标记环境性
    it('records no audit entry for a plain (non-environmental) repair failure', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: false,
            failureCategory: 'MANIFEST_MISMATCH',
            failureDetail: 'lockfile out of sync',
            attemptHistory: [],
        })
        const allErrors: FixError[] = []

        const action = await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors,
        }, 'foo/bar')

        expect(action.success).toBe(false)
        expect(action.environmentalFailure).toBeUndefined()
        expect(allErrors).toHaveLength(0)
    })

    const baselineFailure = {
        command: 'pnpm install --frozen-lockfile',
        exitCode: 1,
        durationMs: 1200,
        stdout: '',
        stderr: 'ERR_PNPM_BROKEN_LOCKFILE: duplicated mapping key "packages"',
    }

    it('passes the baseline install failure to repairLockfile as known-broken evidence', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: true,
            strategy: 'REGENERATE_FROM_MANIFEST',
            diff: { summary: 'lockfile updated: -3 lines', linesChanged: -3, packagesChanged: 0 },
            changed: true,
            attemptHistory: [],
        })

        const action = await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        }, 'foo/bar', { installBaselineFailure: baselineFailure })

        expect(pnpmFixerMock.repairLockfile).toHaveBeenCalledWith({
            workDir: '/tmp/work',
            knownBrokenLockfile: {
                command: baselineFailure.command,
                detail: baselineFailure.stderr,
            },
        })
        expect(action.changed).toBe(true)
        expect(action.noOp).toBeUndefined()
        expect(loggerMocks.info).toHaveBeenCalledWith(
            'Lockfile repair applied for foo/bar (strategy: REGENERATE_FROM_MANIFEST)',
        )
    })

    // 基线已判安装失败时，「复检通过且内容未变」不得说成「已合规」（grep 负例）。
    it('never reports "already compliant" when the baseline install had failed', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: true,
            diff: { summary: 'lockfile unchanged', linesChanged: 0, packagesChanged: 0 },
            changed: false,
            attemptHistory: [],
        })

        await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        }, 'foo/bar', { installBaselineFailure: baselineFailure })

        expect(loggerMocks.info).toHaveBeenCalledWith(
            'Lockfile recheck passed for foo/bar after baseline install failure '
            + '(pnpm install --frozen-lockfile) — content unchanged',
        )
        expect(JSON.stringify(loggerMocks.info.mock.calls)).not.toContain('Lockfile already compliant')
    })

    it('logs the precondition failure with the baseline evidence', async () => {
        pnpmFixerMock.repairLockfile.mockResolvedValue({
            success: false,
            failureCategory: 'PRECONDITION_FAILED',
            failureDetail: 'baseline install already failed (pnpm install --frozen-lockfile) — refusing the shortcut',
            attemptHistory: [],
        })
        const allErrors: FixError[] = []

        const action = await tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
            allErrors,
        }, 'foo/bar', { installBaselineFailure: baselineFailure })

        expect(action.success).toBe(false)
        expect(loggerMocks.info).toHaveBeenCalledWith(
            'Lockfile repair precondition failed for foo/bar: '
            + 'baseline install already failed (pnpm install --frozen-lockfile) — refusing the shortcut',
        )
        // 前置失败不是「本次引入」，也不伪造环境性归因
        expect(action.environmentalFailure).toBeUndefined()
        expect(allErrors).toHaveLength(0)
    })
})
