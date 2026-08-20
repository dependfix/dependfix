// resolve-repositories.test.ts — resolveAlertRepositories（解析告警来源仓库列表）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAlertRepositories } from './helpers'

// ---------------------------------------------------------------------------
// Mock engine 内部模块（resolveAlertRepositories 依赖 inferRepoFromGitRemote）
// ---------------------------------------------------------------------------

const configMock = vi.hoisted(() => ({
    inferRepoFromGitRemote: vi.fn(),
}))

vi.mock('../config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../config')>()
    return { ...actual, inferRepoFromGitRemote: configMock.inferRepoFromGitRemote }
})

describe('resolveAlertRepositories', () => {
    const logger = { info: vi.fn() } as never

    beforeEach(() => {
        configMock.inferRepoFromGitRemote.mockReset()
    })

    it('returns config repositories for github-dependabot source', () => {
        const repos = resolveAlertRepositories({
            config: { alertSource: 'github-dependabot', repositories: ['a/b', 'c/d'] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['a/b', 'c/d'])
    })

    it('returns explicit repo for pnpm-audit source', () => {
        const repos = resolveAlertRepositories({
            config: { alertSource: 'pnpm-audit', repositories: ['owner/repo'] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['owner/repo'])
        expect(configMock.inferRepoFromGitRemote).not.toHaveBeenCalled()
    })

    it('infers repository from git remote for pnpm-audit when no explicit repo (no token does not mean no remote)', () => {
        configMock.inferRepoFromGitRemote.mockReturnValue('owner/repo-from-remote')
        const repos = resolveAlertRepositories({
            config: { alertSource: 'pnpm-audit', repositories: [] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['owner/repo-from-remote'])
    })

    it('falls back to local when pnpm-audit has no explicit repo and no git remote', () => {
        configMock.inferRepoFromGitRemote.mockReturnValue(null)
        const repos = resolveAlertRepositories({
            config: { alertSource: 'pnpm-audit', repositories: [] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['local'])
    })
})
