import { describe, expect, it, afterEach, vi } from 'vitest'
import nock from 'nock'
import { AppError } from '@dependfix/core'
import { fetchRepoAlerts, hasSourceScopedFetchFailure, type FetchAlertsDeps } from './repo-alerts'

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
        alertsDisabled: [],
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
        // 验证 source 字段（todo.md §M19.5 C8：用于 CLI 分组汇总）
        expect(deps.allErrors[0].source).toBe('code-quality')
        // 调用点接线守护：per-source 错误消息必须带 Code Quality token 指引
        // （三源合一 alertsFetchTokenHint 的 Code Quality 分支；旧两源链会丢失该指引）
        expect(deps.allErrors[0].message).toContain('Code quality')
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
        // 验证 source 字段（todo.md §M19.5 C8）
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

    it('records ALERTS_DISABLED as alertsDisabled (not allErrors), does not fail run', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(403, { message: 'Dependabot alerts are disabled for this repository.' })

        const deps = makeDep()
        const alerts = await fetchRepoAlerts(deps, REPO)

        // 未启用 ≠ 失败：返回空数组，不抛错（方案 A）
        expect(alerts).toHaveLength(0)
        // 不计入 allErrors
        expect(deps.allErrors).toHaveLength(0)
        // 计入 alertsDisabled
        expect(deps.alertsDisabled).toHaveLength(1)
        expect(deps.alertsDisabled[0].repository).toBe(REPO)
        expect(deps.alertsDisabled[0].source).toBe('dependabot')
    })

    it('throws when a disabled source coexists with failing sources (no successful source)', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(403, { message: 'Dependabot alerts are disabled for this repository.' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-quality/findings')
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })

        const deps = makeDep({ codeQualityEnabled: true })

        // 无任何成功源（dependabot 未启用 + code-quality 真实失败）→ 仓库失败（抛错）
        await expect(fetchRepoAlerts(deps, REPO)).rejects.toBeInstanceOf(AppError)
        // code-quality 真实失败计入 allErrors
        expect(deps.allErrors).toHaveLength(1)
        expect(deps.allErrors[0].source).toBe('code-quality')
        // dependabot 未启用单独记录（抛错前已写入 deps，不因失败丢失）
        expect(deps.alertsDisabled).toHaveLength(1)
        expect(deps.alertsDisabled[0].source).toBe('dependabot')
    })

    it('throws when one source is disabled and the remaining enabled sources all fail (N=3)', async () => {
        // 新语义：无任何成功源且存在失败源 → 仓库失败（不再以 0 告警冒充扫描成功，修复可审计性粒度退化）。
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(403, { message: 'Dependabot alerts are disabled for this repository.' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-scanning/alerts')
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-quality/findings')
            .query(true)
            .reply(500, { message: 'Internal Server Error' })

        const deps = makeDep({ codeScanningEnabled: true, codeQualityEnabled: true })

        await expect(fetchRepoAlerts(deps, REPO)).rejects.toBeInstanceOf(AppError)
        // 未启用源不计失败；其余两源各记一条真实失败（抛错前已写入 deps）
        expect(deps.alertsDisabled).toHaveLength(1)
        expect(deps.alertsDisabled[0].source).toBe('dependabot')
        expect(deps.allErrors).toHaveLength(2)
        expect(deps.allErrors.map((e) => e.source).sort()).toEqual(['code-quality', 'code-scanning'])
    })

    it('does not throw when every source is ALERTS_DISABLED (no success but no failure)', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(403, { message: 'Dependabot alerts are disabled for this repository.' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-scanning/alerts')
            .query(true)
            .reply(403, { message: 'Advanced Security must be enabled for this repository to use code scanning.' })
        nock(API_BASE)
            .get('/repos/foo/bar/code-quality/findings')
            .query(true)
            .reply(403, { message: 'GitHub Advanced Security is not enabled for this repository.' })

        const deps = makeDep({ codeScanningEnabled: true, codeQualityEnabled: true })
        const alerts = await fetchRepoAlerts(deps, REPO)

        // 三源全未启用：无成功源但也无失败源 → 不抛错、返回空（未启用是预期状态）
        expect(alerts).toHaveLength(0)
        expect(deps.allErrors).toHaveLength(0)
        expect(deps.alertsDisabled).toHaveLength(3)
        expect(deps.alertsDisabled.map((record) => record.source).sort()).toEqual(['code-quality', 'code-scanning', 'dependabot'])
    })

    it('records code-scanning ALERTS_DISABLED with source-specific hint（未启用 ≠ 失败）', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(200, [])
        nock(API_BASE)
            .get('/repos/foo/bar/code-scanning/alerts')
            .query(true)
            .reply(403, { message: 'Advanced Security must be enabled for this repository to use code scanning.' })

        const deps = makeDep({ codeScanningEnabled: true })
        const alerts = await fetchRepoAlerts(deps, REPO)

        // 未启用不算失败源：不抛错、不入 allErrors，单独计入 alertsDisabled（按源单列）
        expect(alerts).toHaveLength(0)
        expect(deps.allErrors).toHaveLength(0)
        expect(deps.alertsDisabled).toHaveLength(1)
        expect(deps.alertsDisabled[0].source).toBe('code-scanning')

        // 日志文案按告警源给出开启路径，不得误导为 Dependabot
        const warnMessages = (deps.logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn
            .mock.calls.map((call) => String(call[0]))
        expect(warnMessages.some((m) => m.includes('Code Scanning alerts disabled for foo/bar'))).toBe(true)
        // 断言 hint 自身：子串取自按源开启路径文案（不会由 403 error message 命中）
        expect(warnMessages.some((m) => m.includes('开启 GitHub Advanced Security 并配置 code scanning'))).toBe(true)
        expect(warnMessages.some((m) => m.includes('Dependabot alerts disabled'))).toBe(false)
    })
})

describe('hasSourceScopedFetchFailure（仓库级 catch 去重判据）', () => {
    const base = { repository: REPO, stage: 'fetch' as const, category: 'FETCH_FAILED', message: 'boom' }

    it('存在带 source 的 FETCH_FAILED → true', () => {
        expect(hasSourceScopedFetchFailure([{ ...base, source: 'dependabot' }], REPO)).toBe(true)
    })

    it('无 source（仓库级信号）→ false', () => {
        expect(hasSourceScopedFetchFailure([base], REPO)).toBe(false)
    })

    it('其他仓库 / 其他 category / 空列表 → false', () => {
        expect(hasSourceScopedFetchFailure([{ ...base, source: 'dependabot' }], 'other/repo')).toBe(false)
        expect(hasSourceScopedFetchFailure([{ ...base, source: 'dependabot', category: 'PROCESS_FAILED' }], REPO)).toBe(false)
        expect(hasSourceScopedFetchFailure([], REPO)).toBe(false)
    })
})
