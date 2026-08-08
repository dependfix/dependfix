import { beforeEach, describe, expect, it, vi } from 'vitest'
import { overrideTransitiveDependency, repairLockfile, upgradeDependency } from 'dependfix'
import { fixDependency } from './fix-dependency'

vi.mock('dependfix', () => ({
    overrideTransitiveDependency: vi.fn(),
    repairLockfile: vi.fn(),
    upgradeDependency: vi.fn(),
}))

const overrideMock = vi.mocked(overrideTransitiveDependency)
const upgradeMock = vi.mocked(upgradeDependency)
const repairMock = vi.mocked(repairLockfile)

beforeEach(() => {
    overrideMock.mockReset()
    upgradeMock.mockReset()
    repairMock.mockReset()
})

describe('fixDependency（fix_type 分发）', () => {
    it('defaults to override and requires packageName/targetVersion', async () => {
        const result = await fixDependency({ workDir: '/tmp/repo' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('packageName')
    })

    it('override: returns success with mapped fields', async () => {
        overrideMock.mockResolvedValue({
            packageName: 'lodash',
            fromVersion: '4.17.20',
            toVersion: '4.17.21',
            isMajor: false,
            success: true,
            warning: 'pnpm v10 may ignore overrides',
        })

        const result = await fixDependency({
            workDir: '/tmp/repo',
            packageName: 'lodash',
            targetVersion: '4.17.21',
        })

        expect(result).toMatchObject({
            ok: true,
            fixType: 'override',
            packageName: 'lodash',
            toVersion: '4.17.21',
            warning: 'pnpm v10 may ignore overrides',
        })
        expect(overrideMock).toHaveBeenCalledWith({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: '/tmp/repo',
        })
    })

    it('direct: requires packageName/targetVersion and maps result', async () => {
        upgradeMock.mockResolvedValue({
            packageName: 'lodash',
            fromVersion: '^4.17.20',
            toVersion: '^4.17.21',
            isMajor: false,
            success: true,
        })

        const result = await fixDependency({
            workDir: '/tmp/repo',
            fix_type: 'direct',
            packageName: 'lodash',
            targetVersion: '4.17.21',
        })

        expect(result).toMatchObject({ ok: true, fixType: 'direct', packageName: 'lodash' })
        expect(upgradeMock).toHaveBeenCalledWith({
            packageName: 'lodash',
            targetVersion: '4.17.21',
            workDir: '/tmp/repo',
        })
    })

    it('direct: returns error when params missing', async () => {
        const result = await fixDependency({ workDir: '/tmp/repo', fix_type: 'direct' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('packageName')
    })

    it('lockfile: maps success result (strategy/diff/lockfileVersion)', async () => {
        repairMock.mockReturnValue({
            success: true,
            strategy: 'REGENERATE',
            diff: { linesChanged: 12, packagesChanged: 3, summary: 'lockfile updated' },
            lockfileVersion: '9.0',
            lockfileVersionChanged: true,
            attemptHistory: [],
        })

        const result = await fixDependency({ workDir: '/tmp/repo', fix_type: 'lockfile' })

        expect(result).toMatchObject({
            ok: true,
            fixType: 'lockfile',
            strategy: 'REGENERATE',
            lockfileVersion: '9.0',
            lockfileVersionChanged: true,
        })
        expect(repairMock).toHaveBeenCalledWith({ workDir: '/tmp/repo' })
    })

    it('lockfile: maps failure result (failureDetail as error)', async () => {
        repairMock.mockReturnValue({
            success: false,
            failureCategory: 'MANIFEST_MISMATCH',
            failureDetail: 'out of sync',
            attemptHistory: [],
        })

        const result = await fixDependency({ workDir: '/tmp/repo', fix_type: 'lockfile' })

        expect(result.ok).toBe(false)
        expect(result).toMatchObject({ fixType: 'lockfile' })
        expect((result as { error: string }).error).toContain('out of sync')
    })

    it('wraps thrown errors into ok:false', async () => {
        overrideMock.mockRejectedValue(new Error('boom'))

        const result = await fixDependency({
            workDir: '/tmp/repo',
            packageName: 'lodash',
            targetVersion: '4.17.21',
        })

        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('boom')
    })
})
