import { describe, expect, it, afterEach, vi } from 'vitest'
import nock from 'nock'
import { AppError } from '@dependfix/core'
import { fetchRepoAlerts, type FetchAlertsDeps } from './repo-alerts'

const API_BASE = 'https://api.github.com'
const REPO = 'foo/bar'

function makeDep(overrides: Partial<{
    alertSource: 'github-dependabot' | 'pnpm-audit'
    codeScanningEnabled: boolean
    codeQualityEnabled: boolean
    githubToken: string
}> = {}): FetchAlertsDeps {
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
    return {
        config: {
            mode: 'report-only',
            severityThreshold: 'high',
            repositories: [REPO],
            dryRun: false,
            createPullRequest: false,
            commit: false,
            cleanupBranches: false,
            cleanupBranchesAuto: false,
            githubToken: overrides.githubToken ?? 'test-token',
            alertSource: overrides.alertSource ?? 'github-dependabot',
            codeScanningEnabled: overrides.codeScanningEnabled ?? false,
            codeQualityEnabled: overrides.codeQualityEnabled ?? false,
            allowMajorUpgrade: false,
            maxAlertsPerRepository: 20,
            maxConcurrency: 1,
            maxRetries: 3,
            maxBackoffMs: 30_000,
            maxRepos: 100,
        },
        workDir: '/tmp',
        logger: logger as never,
        allErrors: [],
    }
}

afterEach(() => {
    nock.cleanAll()
})

function depAlert(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        number: 1,
        state: 'open',
        html_url: 'https://github.com/foo/bar/security/dependabot/1',
        security_advisory: { severity: 'high', summary: 'x' },
        security_vulnerability: { first_patched_version: null },
        dependency: { package: { ecosystem: 'npm', name: 'x' }, manifest_path: 'package.json' },
        ...overrides,
    }
}

function cqFinding(): Record<string, unknown> {
    return {
        number: 1,
        state: 'open',
        url: `https://api.github.com/repos/${REPO}/code-quality/findings/1`,
        rule: { id: 'java/x', title: 'X', severity: 'warning', category: 'maintainability' },
        location: { path: 'src/x.java', start_line: 9, end_line: 18 },
        message: { text: 'm' },
    }
}

describe('fetchRepoAlerts (three-source parallel + per-source error isolation)', () => {
    it('fetches dependabot only when codeQualityEnabled and codeScanningEnabled are false', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: 100 })
            .reply(200, [depAlert()])

        const deps = makeDep()
        const alerts = await fetchRepoAlerts(deps, REPO)

        expect(alerts).toHaveLength(1)
        expect(alerts[0].source).toBe('dependabot')
    })

    it('fetches dependabot + code-quality in parallel when codeQualityEnabled=true (per-source isolation)', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: 100 })
            .reply(200, [depAlert()])
        nock(API_BASE)
            .get('/repos/foo/bar/code-quality/findings')
            .query({ state: 'open', per_page: 100 })
            .reply(200, [cqFinding()])

        const deps = makeDep({ codeQualityEnabled: true })
        const alerts = await fetchRepoAlerts(deps, REPO)

        expect(alerts).toHaveLength(2)
        expect(alerts.some((a) => a.source === 'dependabot')).toBe(true)
        expect(alerts.some((a) => a.source === 'code-quality')).toBe(true)
    })

    it('isolates code-quality failure: dependabot still returned, error recorded', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(200, [depAlert()])
        nock(API_BASE)
            .get('/repos/foo/bar/code-quality/findings')
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })

        const deps = makeDep({ codeQualityEnabled: true })
        const alerts = await fetchRepoAlerts(deps, REPO)

        // dependabot 成功 + code-quality 失败 → 保留 dependabot 数据，记录 FETCH_FAILED
        expect(alerts).toHaveLength(1)
        expect(alerts[0].source).toBe('dependabot')
        expect(deps.allErrors).toHaveLength(1)
        expect(deps.allErrors[0].category).toBe('FETCH_FAILED')
        expect(deps.allErrors[0].repository).toBe(REPO)
        // M19.5 C8：source 字段记录失败源，便于 CLI 汇总警告
        expect(deps.allErrors[0].source).toBe('code-quality')
    })

    it('isolates code-scanning failure: dependabot still returned, error recorded', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(200, [depAlert()])
        nock(API_BASE)
            .get('/repos/foo/bar/code-scanning/alerts')
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })

        const deps = makeDep({ codeScanningEnabled: true })
        const alerts = await fetchRepoAlerts(deps, REPO)

        expect(alerts).toHaveLength(1)
        expect(alerts[0].source).toBe('dependabot')
        expect(deps.allErrors).toHaveLength(1)
        // M19.5 C8：source 字段记录失败源
        expect(deps.allErrors[0].source).toBe('code-scanning')
    })

    it('throws when all enabled sources fail (dependabot + code-quality both 403)', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-quality/findings')
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })

        const deps = makeDep({ codeQualityEnabled: true })

        // 全部源失败 → 抛第一个失败（throw 路径：codeQualityResult.reason）
        await expect(fetchRepoAlerts(deps, REPO)).rejects.toBeInstanceOf(AppError)
    })

    it('throws when all three sources fail (dependabot + code-scanning + code-quality)', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(403, { message: 'd' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-scanning/alerts')
            .query(true)
            .reply(403, { message: 'cs' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-quality/findings')
            .query(true)
            .reply(403, { message: 'cq' })

        const deps = makeDep({ codeScanningEnabled: true, codeQualityEnabled: true })

        await expect(fetchRepoAlerts(deps, REPO)).rejects.toBeInstanceOf(AppError)
    })
})
