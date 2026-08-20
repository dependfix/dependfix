// lockfile-repair.test.ts — tryLockfileRepair（toolchain 传递 + 格式漂移标注）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('passes toolchain pnpm version from config to repairLockfile', () => {
        pnpmFixerMock.repairLockfile.mockReturnValue({
            success: true,
            diff: { summary: 'lockfile updated: +10 lines' },
            attemptHistory: [],
        })

        const action = tryLockfileRepair({
            config: { dryRun: false, toolchainPnpmVersion: '10.5.2' } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
        }, 'foo/bar')

        expect(pnpmFixerMock.repairLockfile).toHaveBeenCalledWith({
            workDir: '/tmp/work',
            toolchain: { pnpmVersion: '10.5.2' },
        })
        expect(action.success).toBe(true)
        expect(action.diff).toBe('lockfile updated: +10 lines')
    })

    it('annotates diff when lockfileVersion changed (format drift guard)', () => {
        pnpmFixerMock.repairLockfile.mockReturnValue({
            success: true,
            diff: { summary: 'lockfile updated: +10 lines' },
            attemptHistory: [],
            lockfileVersion: '9.0',
            lockfileVersionChanged: true,
        })

        const action = tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
        }, 'foo/bar')

        expect(action.diff).toBe('lockfile updated: +10 lines (lockfileVersion changed)')
    })

    it('returns early success record in dry-run mode', () => {
        const action = tryLockfileRepair({
            config: { dryRun: true } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
        }, 'foo/bar')

        expect(action.success).toBe(true)
        expect(pnpmFixerMock.repairLockfile).not.toHaveBeenCalled()
    })
})
