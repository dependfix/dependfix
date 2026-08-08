import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGitHubClient, discoverRepositories } from 'dependfix'
import { discoverRepos } from './discover-repos'

vi.mock('dependfix', () => ({
    createGitHubClient: vi.fn(),
    discoverRepositories: vi.fn(),
}))

const discoverMock = vi.mocked(discoverRepositories)
const clientMock = vi.mocked(createGitHubClient)

beforeEach(() => {
    discoverMock.mockReset()
    clientMock.mockReset()
    clientMock.mockReturnValue({} as never)
    delete process.env.GITHUB_TOKEN
})

const resolveOkDiscovery = (): void => {
    discoverMock.mockResolvedValue([
        { fullName: 'owner-a/repo-b', defaultBranch: 'main', topics: ['security'], hasDependabotConfig: true },
        { fullName: 'owner-a/repo-c', defaultBranch: 'main', topics: [], hasDependabotConfig: false },
    ])
}

describe('discoverRepos（复用 discoverRepositories）', () => {
    it('returns error when GITHUB_TOKEN is not set', async () => {
        const result = await discoverRepos({ owner: ['owner-a'] })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('GITHUB_TOKEN')
    })

    it('returns error when owner is empty', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        const result = await discoverRepos({ owner: [] })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('owner')
    })

    it('maps discovered repositories and passes params through', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        resolveOkDiscovery()

        const result = await discoverRepos({
            owner: ['owner-a', 'owner-b'],
            topics: ['security'],
            include: ['owner-a/*'],
            exclude: ['owner-a/legacy'],
        })

        expect(result.ok).toBe(true)
        const ok = result as { count: number, repositories: Array<{ fullName: string, hasDependabotConfig: boolean }> }
        expect(ok.count).toBe(2)
        expect(ok.repositories[0]).toMatchObject({ fullName: 'owner-a/repo-b', hasDependabotConfig: true })
        expect(discoverMock).toHaveBeenCalledWith({
            client: {},
            owners: ['owner-a', 'owner-b'],
            topics: ['security'],
            policy: { include: ['owner-a/*'], exclude: ['owner-a/legacy'] },
            probeDependabot: true,
        })
    })

    it('omits empty policy lists and honours probe_dependabot false', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        resolveOkDiscovery()

        await discoverRepos({ owner: ['owner-a'], probe_dependabot: false })

        expect(discoverMock).toHaveBeenCalledWith({
            client: {},
            owners: ['owner-a'],
            topics: undefined,
            policy: { include: undefined, exclude: undefined },
            probeDependabot: false,
        })
    })

    it('wraps thrown errors into ok:false', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        discoverMock.mockRejectedValue(new Error('rate limited'))

        const result = await discoverRepos({ owner: ['owner-a'] })

        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('rate limited')
    })
})
