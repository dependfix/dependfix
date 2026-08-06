import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
// 版本化 overrides 集成测试（2026-08-06 run 31028234123 复盘）：
// 同 major 多版本（fast-uri@3.1.0 + 3.1.5）应进入版本化 overrides 分支，
// 生成大版本 key（fast-uri@3: ^3.1.5），而非被常规链路"不降级保护"跳过。
// ---------------------------------------------------------------------------

describe('DependfixApp versioned overrides (same-major coexistence)', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-app-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            dependencies: { '@dependfix/core': '^1.0.0' },
        }, null, 2))
        // 双版本 lockfile（同 major 3：3.1.0 脆弱 + 3.1.5 安全）
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.0:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('routes same-major multi-version alerts to versioned overrides (dry-run records action)', async () => {
        // Dependabot 告警：fast-uri（间接依赖，manifestPath=pnpm-lock.yaml）
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [{
                number: 1,
                state: 'open',
                security_advisory: { ghsa_id: 'GHSA-f8p3-7c7w-h6x4', severity: 'high' },
                security_vulnerability: {
                    package: { ecosystem: 'npm', name: 'fast-uri' },
                    severity: 'high',
                    vulnerable_version_range: '< 3.1.5',
                    first_patched_version: { identifier: '3.1.5' },
                },
                dependency: { package: { ecosystem: 'npm', name: 'fast-uri' }, manifest_path: 'pnpm-lock.yaml' },
            }])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_DRY_RUN: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        // dry-run：版本化 overrides 动作被记录，fast-uri 不再被跳过
        const voActions = result.actions.filter((a) => a.strategy === 'versioned-override' && a.target === 'fast-uri')
        expect(voActions).toHaveLength(1)
        expect(voActions[0].toVersion).toContain('3.1.5')
        expect(nock.pendingMocks()).toEqual([])
    })
})

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
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_ALERTS_TOKEN: 'alerts-token-value',
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
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
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
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
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
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_MODE: 'report-only',
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
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'owner/repo',
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
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'owner/repo',
                DEPENDFIX_DRY_RUN: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode } = await app.run()

        expect(exitCode).toBe(0)
        // dry-run 下 fast-uri 进入升级处理（无实际文件写入）
        expect(auditFetcherMock.fetchPnpmAuditAlerts).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// Code Scanning 并行源集成测试：--code-scanning 开启时 Dependabot + Code Scanning
// 并行拉取、互不覆盖；失败沿用硬失败语义 + hint。
// ---------------------------------------------------------------------------

describe('DependfixApp code-scanning parallel source', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-app-'))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function makeDependabotAlert(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            number: 1,
            state: 'open',
            html_url: 'https://github.com/foo/bar/security/dependabot/1',
            dependency: {
                package: { ecosystem: 'npm', name: 'lodash' },
                manifest_path: 'package.json',
                relationship: 'direct',
            },
            security_advisory: { severity: 'high', summary: 'Lodash vulnerability', ghsa_id: 'GHSA-aaaa' },
            security_vulnerability: { first_patched_version: null, package: { ecosystem: 'npm', name: 'lodash' } },
            ...overrides,
        }
    }

    function makeCodeScanningAlert(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            number: 2,
            state: 'open',
            html_url: 'https://github.com/foo/bar/security/code-scanning/2',
            rule: { id: 'js/sql-injection', severity: 'error', security_severity_level: 'high', name: 'SQL injection' },
            most_recent_instance: {
                ref: 'refs/heads/main',
                location: { path: 'src/db.ts', start_line: 42, end_line: 42 },
                message: { text: 'This query depends on a user-provided value.' },
            },
            ...overrides,
        }
    }

    it('fetches code scanning alerts in parallel with dependabot when enabled', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [makeDependabotAlert()])

        nock('https://api.github.com')
            .get('/repos/foo/bar/code-scanning/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [makeCodeScanningAlert()])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        // 两源并行展示、互不覆盖
        expect(result.alerts.some((a) => a.source === 'dependabot' && a.packageName === 'lodash')).toBe(true)
        expect(result.alerts.some((a) => a.source === 'code-scanning' && a.ruleId === 'js/sql-injection')).toBe(true)
        expect(result.alerts.some((a) => a.source === 'code-scanning' && a.fixable === false)).toBe(true)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('does not fetch code scanning alerts by default (backward compatible)', async () => {
        // 只 mock dependabot + repos.get；若误调 code-scanning 会因无 nock 匹配而失败
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [makeDependabotAlert()])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.alerts.every((a) => a.source === 'dependabot')).toBe(true)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('records truncated alert count in summary (max alerts per repository)', async () => {
        // 2 条告警 + max=1 → alertsTruncated=1（截断明细进报告，收尾审查遗留修复）
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [
                makeDependabotAlert({ number: 1 }),
                makeDependabotAlert({ number: 2 }),
            ])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_ALERTS_PER_REPOSITORY: '1',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.summary.alertsTruncated).toBe(1)
        expect(result.alerts).toHaveLength(1)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('counts code-scanning alerts toward truncation when enabled', async () => {
        // cs 开启 + max=1 + 2 条 cs 告警 → alertsTruncated=1（cs 源截断累计）
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [])

        nock('https://api.github.com')
            .get('/repos/foo/bar/code-scanning/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [
                makeCodeScanningAlert({ number: 1, rule: { id: 'js/sql-injection', severity: 'error', security_severity_level: 'high', name: 'SQL injection' } }),
                makeCodeScanningAlert({ number: 2, rule: { id: 'js/xss', severity: 'error', security_severity_level: 'high', name: 'XSS' } }),
            ])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
                DEPENDFIX_MAX_ALERTS_PER_REPOSITORY: '1',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.summary.alertsTruncated).toBe(1)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('hard-fails with security-events hint when code scanning fetch returns 403', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [makeDependabotAlert()])

        nock('https://api.github.com')
            .get('/repos/foo/bar/code-scanning/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(403, { message: 'Resource not accessible by integration' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'report-only',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(2) // 唯一仓库 fetch 失败 → 无成功仓库
        const fetchError = result.errors.find((e) => e.stage === 'fetch')
        expect(fetchError).toBeDefined()
        expect(fetchError?.message).toContain('security-events')
        expect(fetchError?.category).toBe('FETCH_FAILED')
    })

    it('fix mode runs template fix for A-class code scanning alerts (dry-run)', async () => {
        // 修复目标文件（A 类模板读取真实文件内容生成补丁；dry-run 不写盘）
        const srcDir = join(workDir, 'src')
        mkdirSync(srcDir, { recursive: true })
        writeFileSync(join(srcDir, 'foo.ts'), 'const a = 1')

        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [])

        nock('https://api.github.com')
            .get('/repos/foo/bar/code-scanning/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [
                // A 类白名单规则（有模板）
                makeCodeScanningAlert({
                    number: 1,
                    rule: { id: 'eol-last', severity: 'warning', security_severity_level: 'low', name: 'End of line' },
                    most_recent_instance: {
                        ref: 'refs/heads/main',
                        location: { path: 'src/foo.ts', start_line: 1, end_line: 1 },
                        message: { text: 'File does not end with a newline' },
                    },
                }),
                // B 类建议规则（无模板，不产生 fix action）
                makeCodeScanningAlert({
                    number: 2,
                    rule: { id: 'js/sql-injection', severity: 'error', security_severity_level: 'high', name: 'SQL injection' },
                    most_recent_instance: {
                        ref: 'refs/heads/main',
                        location: { path: 'src/db.ts', start_line: 42, end_line: 42 },
                        message: { text: 'This query depends on a user-provided value.' },
                    },
                }),
            ])

        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
                DEPENDFIX_DRY_RUN: 'true',
                DEPENDFIX_SEVERITY_THRESHOLD: 'all', // 格式类规则多为 low，需全量保留
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        // A 类告警产生成功的 code-scanning-fix action（dry-run 不写盘）
        const csFixes = result.actions.filter((a) => a.type === 'code-scanning-fix')
        expect(csFixes).toHaveLength(1)
        expect(csFixes[0].target).toBe('eol-last')
        expect(csFixes[0].success).toBe(true)
        // B 类告警不产生 fix action（建议模式，T304 展示）
        expect(result.actions.some((a) => a.type === 'code-scanning-fix' && a.target === 'js/sql-injection')).toBe(false)
        // 收尾修复：cs 告警（manifestPath 为源码路径）不再计入 partition skipped
        expect(result.summary.alertsSkipped).toBe(0)
        expect(nock.pendingMocks()).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// M4 owner discovery 接线测试（T401）：resolveRepositories 合并去重与失败回退
// ---------------------------------------------------------------------------

describe('DependfixApp owner discovery wiring', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-owner-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
        }, null, 2))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('merges explicit repositories with owner discovery (explicit first, deduped)', async () => {
        // owner 发现：foo 下两个仓库（乱序返回，验证排序确定性）
        nock('https://api.github.com')
            .get('/users/foo')
            .reply(200, { login: 'foo', type: 'User' })
        nock('https://api.github.com')
            .get('/users/foo/repos')
            .query({ per_page: '100', type: 'all' })
            .reply(200, [
                { full_name: 'foo/zeta', default_branch: 'main', archived: false, disabled: false, fork: false, topics: [] },
                { full_name: 'foo/alpha', default_branch: 'main', archived: false, disabled: false, fork: false, topics: [] },
            ])
        // 探测 dependabot.yml（alpha 存在、zeta 不存在）
        nock('https://api.github.com')
            .get(new RegExp('/repos/foo/alpha/contents/'))
            .reply(200, { type: 'file' })
        nock('https://api.github.com')
            .get(new RegExp('/repos/foo/zeta/contents/'))
            .reply(404, { message: 'Not Found' })

        // 显式 foo/bar + 发现 alpha/zeta → 处理 3 个仓库（report-only dry-run）
        for (const repo of ['foo/bar', 'foo/alpha', 'foo/zeta']) {
            nock('https://api.github.com')
                .get(`/repos/${repo}/dependabot/alerts`)
                .query({ state: 'open', per_page: '100' })
                .reply(200, [])
            nock('https://api.github.com')
                .get(`/repos/${repo}`)
                .reply(200, { default_branch: 'main' })
        }

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_OWNER: 'foo',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { result } = await app.run()

        // 报告 config 反映用户输入（显式列表原样，发现结果不污染配置）
        expect(result.config.repositories).toEqual(['foo/bar'])
        // 实际处理清单 = 显式优先（foo/bar 在前）+ 发现结果按名排序补充
        expect(result.repositories.map((r) => r.repository)).toEqual(['foo/bar', 'foo/alpha', 'foo/zeta'])
        expect(result.errors).toEqual([])
        expect(nock.pendingMocks()).toEqual([])
    })

    it('falls back to explicit repositories with DISCOVERY_FAILED error when discovery throws', async () => {
        // owner 信息获取失败（404 → REPO_NOT_FOUND）
        nock('https://api.github.com')
            .get('/users/nobody')
            .reply(404, { message: 'Not Found' })

        // 显式列表仍被处理（显式优先回退语义）
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [])
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_OWNER: 'nobody',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { result, exitCode } = await app.run()

        // 显式仓库未被丢弃，且发现失败有审计记录
        expect(result.repositories.map((r) => r.repository)).toEqual(['foo/bar'])
        expect(result.errors.some((e) => e.category === 'DISCOVERY_FAILED')).toBe(true)
        // 有错误 → 非 0 退出码
        expect(exitCode).not.toBe(0)
        expect(nock.pendingMocks()).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// M4 并发与失败隔离集成测试（T402）
// ---------------------------------------------------------------------------

describe('DependfixApp failure isolation (multi-repo)', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-isolation-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
        }, null, 2))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('continues processing remaining repos when one repo fails, with failed details in report', async () => {
        // repo-a：alerts API 500 → 拉取失败（注入故障）
        nock('https://api.github.com')
            .get('/repos/foo/a/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(500, { message: 'Internal Server Error' })
        // repo-b：1 条可修复告警（成功仓库判定：alertsCount > 0）
        nock('https://api.github.com')
            .get('/repos/foo/b/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [{
                number: 11,
                state: 'open',
                security_advisory: { ghsa_id: 'GHSA-f8p3-7c7w-h6x4', severity: 'high' },
                security_vulnerability: {
                    package: { ecosystem: 'npm', name: 'fast-uri' },
                    severity: 'high',
                    vulnerable_version_range: '< 3.1.5',
                    first_patched_version: { identifier: '3.1.5' },
                },
                dependency: { package: { ecosystem: 'npm', name: 'fast-uri' }, manifest_path: 'pnpm-lock.yaml' },
            }])
        nock('https://api.github.com')
            .get('/repos/foo/b')
            .reply(200, { default_branch: 'main' })
        // repo-c：正常空告警
        nock('https://api.github.com')
            .get('/repos/foo/c/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [])
        nock('https://api.github.com')
            .get('/repos/foo/c')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_REPOSITORIES: 'foo/a,foo/b,foo/c',
                DEPENDFIX_MAX_CONCURRENCY: '3',
            },
        })

        const app = new DependfixApp({ config, workDir })
        const { result, exitCode } = await app.run()

        // 失败隔离：3 个仓库都有结果（失败仓库不中断其余）
        expect(result.repositories.map((r) => r.repository)).toEqual(['foo/a', 'foo/b', 'foo/c'])
        // 失败仓库可见错误详情
        const failedRepo = result.repositories.find((r) => r.repository === 'foo/a')
        expect(failedRepo?.alertsCount).toBe(0)
        expect(result.errors.some((e) => e.repository === 'foo/a' && e.stage === 'fetch')).toBe(true)
        // 其余仓库正常完成（repo-b 拉到 1 条告警）
        expect(result.repositories.find((r) => r.repository === 'foo/b')?.alertsCount).toBe(1)
        expect(result.repositories.find((r) => r.repository === 'foo/c')?.alertsCount).toBe(0)
        // 部分失败 → exitCode 1（有成功仓库 + 有错误）
        expect(exitCode).toBe(1)
        expect(nock.pendingMocks()).toEqual([])
    })
})
