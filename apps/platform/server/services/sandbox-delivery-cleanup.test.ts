import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 沙箱交付失败后的分支副作用处置。
 *
 * Mock 策略：GitHub 分支删除与数据库都替换为 spy——本用例只验证**决策与留痕口径**
 * （清理范围 / 跳过原因 / 事件落库），真实网络与表结构由集成环境覆盖。
 */
const mocks = vi.hoisted(() => ({
    deleteRemoteBranch: vi.fn(),
    createPlatformOctokit: vi.fn(() => ({ mocked: true })),
    create: vi.fn((value: unknown) => value),
    save: vi.fn(async (value: unknown) => value),
}))

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return { ...actual, deleteRemoteBranch: mocks.deleteRemoteBranch }
})

vi.mock('./executor/platform-delivery', () => ({
    createPlatformOctokit: mocks.createPlatformOctokit,
}))

vi.mock('#server/database', () => ({
    ensureDatabaseInitialized: async () => ({
        getRepository: () => ({ create: mocks.create, save: mocks.save }),
    }),
}))

const { cleanupFailedSandboxDelivery } = await import('./sandbox-delivery-cleanup')

const repository = { id: 'repo-1', owner: 'owner-a', name: 'repo-b', defaultBranch: 'main' }
const run = { id: 'run-1' }

const payloadOf = (call: number): Record<string, unknown> =>
    JSON.parse((mocks.save.mock.calls[call]?.[0] as { payloadJson: string }).payloadJson) as Record<string, unknown>

beforeEach(() => {
    mocks.deleteRemoteBranch.mockReset()
    mocks.createPlatformOctokit.mockClear()
    mocks.create.mockClear()
    mocks.save.mockClear()
})

describe('cleanupFailedSandboxDelivery', () => {
    it('does nothing when the result carries no pushed branch', async () => {
        await cleanupFailedSandboxDelivery(repository, run, { delivery: { deliveredBy: 'engine', status: 'pr-created' } } as never, 'token')
        await cleanupFailedSandboxDelivery(repository, run, undefined, 'token')
        expect(mocks.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(mocks.save).not.toHaveBeenCalled()
    })

    it('skips the default branch (fix direct push) and records the reason', async () => {
        await cleanupFailedSandboxDelivery(repository, run, {
            delivery: { deliveredBy: 'engine', status: 'pushed', branch: 'main' },
        } as never, 'token')
        expect(mocks.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(payloadOf(0)).toEqual({ branch: 'main', outcome: 'skipped', reason: 'branch_out_of_scope' })
    })

    it('skips a dependfix branch that is also the default branch', async () => {
        await cleanupFailedSandboxDelivery({ ...repository, defaultBranch: 'dependfix/auto-fix-abcd1234' }, run, {
            delivery: { deliveredBy: 'engine', status: 'pushed', branch: 'dependfix/auto-fix-abcd1234' },
        } as never, 'token')
        expect(mocks.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(payloadOf(0)).toMatchObject({ outcome: 'skipped', reason: 'branch_out_of_scope' })
    })

    it('skips cleanup without a credential and records the reason', async () => {
        await cleanupFailedSandboxDelivery(repository, run, {
            delivery: { deliveredBy: 'engine', status: 'pushed', branch: 'dependfix/auto-fix-abcd1234' },
        } as never, undefined)
        expect(mocks.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(payloadOf(0)).toMatchObject({ outcome: 'skipped', reason: 'no_credential' })
    })

    it('deletes the declared dependfix branch and records success', async () => {
        mocks.deleteRemoteBranch.mockResolvedValue(undefined)
        await cleanupFailedSandboxDelivery(repository, run, {
            delivery: { deliveredBy: 'engine', status: 'pushed', branch: 'dependfix/auto-fix-abcd1234' },
        } as never, 'token')
        expect(mocks.createPlatformOctokit).toHaveBeenCalledWith('token')
        expect(mocks.deleteRemoteBranch).toHaveBeenCalledWith({ mocked: true }, 'owner-a', 'repo-b', 'dependfix/auto-fix-abcd1234')
        expect(payloadOf(0)).toEqual({ branch: 'dependfix/auto-fix-abcd1234', outcome: 'deleted' })
    })

    it('records a failed cleanup instead of throwing', async () => {
        mocks.deleteRemoteBranch.mockRejectedValue(new Error('branch is protected'))
        const result = {
            delivery: { deliveredBy: 'engine', status: 'pushed', branch: 'dependfix/auto-fix-abcd1234' },
        }
        await expect(cleanupFailedSandboxDelivery(repository, run, result as never, 'token')).resolves.toBeUndefined()
        expect(payloadOf(0)).toMatchObject({ outcome: 'failed', reason: 'branch is protected' })
    })
})
