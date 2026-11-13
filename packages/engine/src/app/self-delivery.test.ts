import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixError, Logger } from '@dependfix/core'

/**
 * fix 模式自包含交付的判定分支（push / 无新提交 / 脱离 HEAD / 取消 / push 失败）。
 *
 * Mock 策略：git 读取与 push 全替换为 spy——本用例验证的是「交付记录与错误留痕口径」，
 * 真实 git 行为由 gated 容器用例覆盖。
 */
const mocks = vi.hoisted(() => ({
    pushBranch: vi.fn(),
    readCurrentBranch: vi.fn(),
    readHeadCommit: vi.fn(),
}))

vi.mock('../github', () => ({
    pushBranch: mocks.pushBranch,
    readCurrentBranch: mocks.readCurrentBranch,
    readHeadCommit: mocks.readHeadCommit,
}))

const { recordFixModeDelivery, deliveryBranchPushed, deliveryPrCreated, deliveryPrReused } = await import('./self-delivery')

const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}

const baseInput = () => ({
    commit: true,
    workDir: '/tmp/work',
    logger,
    allErrors: [] as FixError[],
    abortBlocked: () => false,
})

beforeEach(() => {
    mocks.pushBranch.mockReset()
    mocks.readCurrentBranch.mockReset().mockResolvedValue('main')
    mocks.readHeadCommit.mockReset().mockResolvedValue('aaa111')
})

describe('recordFixModeDelivery', () => {
    it('does nothing without commit', async () => {
        const input = { ...baseInput(), commit: false, push: true }
        await expect(recordFixModeDelivery(input)).resolves.toBeUndefined()
        expect(mocks.pushBranch).not.toHaveBeenCalled()
    })

    it('leaves delivery to the platform when push is off (container path)', async () => {
        const delivery = await recordFixModeDelivery(baseInput())
        expect(delivery).toEqual({
            deliveredBy: 'platform',
            status: 'none',
            branch: 'main',
            commitSha: 'aaa111',
        })
        expect(mocks.pushBranch).not.toHaveBeenCalled()
    })

    it('pushes the current branch and records a pushed delivery', async () => {
        const delivery = await recordFixModeDelivery({ ...baseInput(), push: true, headBeforeCommit: 'old' })
        expect(mocks.pushBranch).toHaveBeenCalledWith('main', '/tmp/work')
        expect(delivery).toEqual({
            deliveredBy: 'engine',
            status: 'pushed',
            branch: 'main',
            commitSha: 'aaa111',
        })
    })

    it('skips the push when HEAD did not move (no new commit)', async () => {
        const delivery = await recordFixModeDelivery({ ...baseInput(), push: true, headBeforeCommit: 'aaa111' })
        expect(mocks.pushBranch).not.toHaveBeenCalled()
        expect(delivery).toMatchObject({ deliveredBy: 'none', status: 'none', branch: 'main' })
    })

    it('skips the push on a detached HEAD', async () => {
        mocks.readCurrentBranch.mockResolvedValue('HEAD')
        const delivery = await recordFixModeDelivery({ ...baseInput(), push: true })
        expect(mocks.pushBranch).not.toHaveBeenCalled()
        expect(delivery).toMatchObject({ deliveredBy: 'none', status: 'none', commitSha: 'aaa111' })
    })

    it('does not push when the run was aborted', async () => {
        const delivery = await recordFixModeDelivery({ ...baseInput(), push: true, abortBlocked: () => true })
        expect(mocks.pushBranch).not.toHaveBeenCalled()
        expect(delivery).toBeUndefined()
    })

    it('records PUSH_FAILED and reports no delivery when the push throws', async () => {
        mocks.pushBranch.mockRejectedValue(new Error('protected branch'))
        const input = { ...baseInput(), push: true }
        const delivery = await recordFixModeDelivery(input)
        expect(delivery).toEqual({ deliveredBy: 'none', status: 'none' })
        expect(input.allErrors).toHaveLength(1)
        expect(input.allErrors[0]).toMatchObject({
            repository: '*',
            stage: 'report',
            category: 'PUSH_FAILED',
            message: 'protected branch',
        })
    })
})

describe('delivery record builders', () => {
    it('builds a pushed delivery with optional commit', () => {
        expect(deliveryBranchPushed('dependfix/auto-fix-abcd1234', 'sha')).toEqual({
            deliveredBy: 'engine',
            status: 'pushed',
            branch: 'dependfix/auto-fix-abcd1234',
            commitSha: 'sha',
        })
        expect(deliveryBranchPushed('main')).toEqual({ deliveredBy: 'engine', status: 'pushed', branch: 'main' })
    })

    it('builds a pr-created delivery', () => {
        expect(deliveryPrCreated('dependfix/auto-fix-abcd1234', 'sha', { number: 7, htmlUrl: 'https://github.com/o/r/pull/7' }))
            .toEqual({
                deliveredBy: 'engine',
                status: 'pr-created',
                branch: 'dependfix/auto-fix-abcd1234',
                commitSha: 'sha',
                prUrl: 'https://github.com/o/r/pull/7',
                prNumber: 7,
            })
    })

    it('builds a reused-PR delivery', () => {
        expect(deliveryPrReused({ number: 9, htmlUrl: 'https://github.com/o/r/pull/9', headRef: 'dependfix/auto-fix-abcd1234' }))
            .toEqual({
                deliveredBy: 'engine',
                status: 'pr-created',
                branch: 'dependfix/auto-fix-abcd1234',
                prUrl: 'https://github.com/o/r/pull/9',
                prNumber: 9,
            })
    })
})
