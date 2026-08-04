import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// Mock pnpm-audit fetcher（pnpm-audit 集成测试注入固定告警，避免真实 spawn）
// ---------------------------------------------------------------------------

const auditFetcherMock = vi.hoisted(() => ({
    fetchPnpmAuditAlerts: vi.fn(),
}))

vi.mock('../alerts/pnpm-audit-fetcher', () => auditFetcherMock)

function makeAuditAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
    return {
        id: 12345,
        source: 'pnpm-audit',
        repository: 'local',
        defaultBranch: '',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName: 'fast-uri',
        manifestPath: '',
        ruleId: 'https://github.com/advisories/GHSA-f8p3-7c7w-h6x4',
        summary: 'Insufficient Precision in Number Parsing',
        htmlUrl: 'https://github.com/advisories/GHSA-f8p3-7c7w-h6x4',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion: '3.1.5',
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// 双 token 接线集成测试：fetch Dependabot alerts 走 alertsToken，
// 其余 GitHub API（repos.get 等）走主 token。
// ---------------------------------------------------------------------------

describe('DependfixApp dual token', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-app-'))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('uses alertsToken for Dependabot alerts and main token for other APIs', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .matchHeader('authorization', 'token alerts-token-value')
            .reply(200, [])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .matchHeader('authorization', 'token main-token-value')
            .reply(200, { default_branch: 'master' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'report-only',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'foo/bar',
                AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN: 'alerts-token-value',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode } = await app.run()

        expect(exitCode).toBe(0)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('falls back to main token for Dependabot alerts when alertsToken is absent', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .matchHeader('authorization', 'token main-token-value')
            .reply(200, [])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .matchHeader('authorization', 'token main-token-value')
            .reply(200, { default_branch: 'master' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'report-only',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'foo/bar',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode } = await app.run()

        expect(exitCode).toBe(0)
        expect(nock.pendingMocks()).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// 验证门禁集成测试：验证失败（lint 不过）→ 回滚 + 不创建 PR + exit 2
// ---------------------------------------------------------------------------

describe('DependfixApp verification gate', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-gate-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        // 带会失败的 lint 脚本的仓库（验证命令使用自定义命令链，快速失败）
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({ scripts: { lint: 'exit 1' } }))
        execSync('git add . && git commit -qm init', { cwd: workDir })
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('rolls back and skips PR creation when verification fails (regression: bad PR #23)', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [])
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })
        // 不 mock pulls：若错误地走到 PR 创建，nock 会因未拦截请求而失败 → 测试失败

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix-and-pr',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'foo/bar',
            },
            cliOverrides: {
                commands: ['pnpm lint'],
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(2)
        expect(result.errors.some((e) => e.category === 'VERIFICATION_FAILED')).toBe(true)
        // 已跟踪文件已回滚（untracked 的 pnpm-lock.yaml / node_modules 是运行产物，保留为预期行为）
        expect(execSync('git status --porcelain --untracked-files=no', { cwd: workDir, encoding: 'utf-8' }).trim()).toBe('')
    })
})

// ---------------------------------------------------------------------------
// pnpm-audit 数据源集成测试：无 token 本地回退走完整告警流水线
// ---------------------------------------------------------------------------

describe('DependfixApp pnpm-audit source', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-audit-'))
        auditFetcherMock.fetchPnpmAuditAlerts.mockReset()
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('report-only with pnpm-audit source runs without token and reports local alerts', async () => {
        auditFetcherMock.fetchPnpmAuditAlerts.mockResolvedValue([
            makeAuditAlert({ repository: 'local' }),
            makeAuditAlert({ repository: 'local', packageName: 'lodash', severity: 'medium', fixable: false, fixStrategy: null, recommendedVersion: '', ruleId: 'https://github.com/advisories/GHSA-jf85-cpcp-j695' }),
        ])

        const config = resolveRuntimeConfig({
            env: {
                AUTO_FIX_GITHUB_SECURITY_ALERTS_SOURCE: 'pnpm-audit',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'report-only',
            },
            // 指向无 git remote 的临时目录 → config 推断失败 → app 层 local 兜底
            workDir,
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.config.alertSource).toBe('pnpm-audit')
        // severity 过滤（默认 high 阈值）生效：medium 的 lodash 被过滤，仅保留 high 的 fast-uri
        expect(result.alerts).toHaveLength(1)
        expect(result.alerts.every((a) => a.source === 'pnpm-audit')).toBe(true)
        expect(result.alerts.every((a) => a.repository === 'local')).toBe(true)
        expect(result.alerts[0].packageName).toBe('fast-uri')
        expect(auditFetcherMock.fetchPnpmAuditAlerts).toHaveBeenCalledWith({
            workDir,
            repository: 'local',
        })
    })

    it('report-only with pnpm-audit source uses explicit --repo (no git remote needed)', async () => {
        auditFetcherMock.fetchPnpmAuditAlerts.mockResolvedValue([
            makeAuditAlert({ repository: 'owner/repo' }),
        ])

        const config = resolveRuntimeConfig({
            env: {
                AUTO_FIX_GITHUB_SECURITY_ALERTS_SOURCE: 'pnpm-audit',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'report-only',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.alerts[0].repository).toBe('owner/repo')
        expect(auditFetcherMock.fetchPnpmAuditAlerts).toHaveBeenCalledWith({
            workDir,
            repository: 'owner/repo',
        })
    })

    it('fix mode with pnpm-audit source reaches the upgrade pipeline', async () => {
        auditFetcherMock.fetchPnpmAuditAlerts.mockResolvedValue([
            makeAuditAlert({ repository: 'owner/repo' }),
        ])

        const config = resolveRuntimeConfig({
            env: {
                AUTO_FIX_GITHUB_SECURITY_ALERTS_SOURCE: 'pnpm-audit',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo',
                AUTO_FIX_GITHUB_SECURITY_DRY_RUN: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode } = await app.run()

        expect(exitCode).toBe(0)
        // dry-run 下 fast-uri 进入升级处理（无实际文件写入）
        expect(auditFetcherMock.fetchPnpmAuditAlerts).toHaveBeenCalled()
    })
})
