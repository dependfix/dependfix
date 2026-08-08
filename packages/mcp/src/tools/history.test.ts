import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryRepoHistory } from 'dependfix'
import { getHistory } from './history'

vi.mock('dependfix', () => ({
    queryRepoHistory: vi.fn(),
}))

const queryMock = vi.mocked(queryRepoHistory)

beforeEach(() => {
    queryMock.mockReset()
    delete process.env.DEPENDFIX_MCP_REPORT_DIR
})

describe('getHistory（复用 queryRepoHistory）', () => {
    it('returns error for malformed repo', async () => {
        const result = await getHistory({ repo: 'invalid' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('owner/repo')
        expect(queryMock).not.toHaveBeenCalled()
    })

    it('maps history entries (newest first from queryRepoHistory)', async () => {
        queryMock.mockReturnValue([
            {
                runId: 'run-2',
                startedAt: '2026-08-09T00:00:00.000Z',
                durationMs: 1200,
                repositories: ['owner-a/repo-b'],
                summary: { alertsCount: 3, fixed: 2 } as never,
                repoStats: [{ repository: 'owner-a/repo-b', alertsCount: 3, fixed: 2 }] as never,
            },
            {
                runId: 'run-1',
                startedAt: '2026-08-08T00:00:00.000Z',
                durationMs: 800,
                repositories: ['owner-a/repo-b'],
                summary: { alertsCount: 1, fixed: 1 } as never,
                repoStats: [{ repository: 'owner-a/repo-b', alertsCount: 1, fixed: 1 }] as never,
            },
        ])

        const result = await getHistory({ repo: 'owner-a/repo-b' })

        expect(result.ok).toBe(true)
        const ok = result as { runs: Array<{ runId: string, durationMs: number }> }
        expect(ok.runs).toHaveLength(2)
        expect(ok.runs[0]).toMatchObject({ runId: 'run-2', durationMs: 1200 })
        expect(queryMock).toHaveBeenCalledWith('owner-a/repo-b', './dependfix-reports')
    })

    it('honours DEPENDFIX_MCP_REPORT_DIR', async () => {
        process.env.DEPENDFIX_MCP_REPORT_DIR = '/tmp/reports'
        queryMock.mockReturnValue([])

        await getHistory({ repo: 'owner-a/repo-b' })

        expect(queryMock).toHaveBeenCalledWith('owner-a/repo-b', '/tmp/reports')
    })

    it('wraps thrown errors into ok:false', async () => {
        queryMock.mockImplementation(() => {
            throw new Error('index corrupted')
        })

        const result = await getHistory({ repo: 'owner-a/repo-b' })

        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('index corrupted')
    })
})
