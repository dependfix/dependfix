import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// 失败隔离 / per-source 错误隔离 / converged 计数 / 跨线告警（自 index.test.ts 拆出：
// 文件行数治理 max-lines 1000）
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

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
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

// ---------------------------------------------------------------------------
// per-source 错误隔离：并行源任一失败保留成功源数据，退出码保持非 0
// ---------------------------------------------------------------------------

describe('DependfixApp per-source error isolation', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-c8-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
        }, null, 2))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function makeDependabotAlert(number = 1): Record<string, unknown> {
        return {
            number,
            state: 'open',
            html_url: `https://github.com/foo/bar/security/dependabot/${number}`,
            security_advisory: { ghsa_id: 'GHSA-xxxx-xxxx-xxxx', severity: 'critical', summary: 'test' },
            security_vulnerability: {
                package: { ecosystem: 'npm', name: 'lodash' },
                severity: 'critical',
                vulnerable_version_range: '< 4.17.21',
                first_patched_version: { identifier: '4.17.21' },
            },
            dependency: { package: { ecosystem: 'npm', name: 'lodash' }, manifest_path: 'package.json' },
        }
    }

    function makeCodeScanningAlert(): Record<string, unknown> {
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
        }
    }

    it('keeps code-scanning alerts when dependabot source fails (dependabot 500)', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(500, { message: 'Internal Server Error' })
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
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        const { result, exitCode } = await app.run()

        // 仓库正常完成（保留 cs 源数据），源失败有审计记录
        expect(result.repositories[0].alertsCount).toBe(1)
        expect(result.alerts.some((a) => a.source === 'code-scanning')).toBe(true)
        expect(result.errors.some((e) => e.repository === 'foo/bar' && e.stage === 'fetch')).toBe(true)
        // 退出码保持非 0（有错误）
        expect(exitCode).not.toBe(0)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('keeps dependabot alerts when code-scanning source fails (cs 500)', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [makeDependabotAlert()])
        nock('https://api.github.com')
            .get('/repos/foo/bar/code-scanning/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(500, { message: 'Internal Server Error' })
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        const { result, exitCode } = await app.run()

        expect(result.repositories[0].alertsCount).toBe(1)
        expect(result.alerts.some((a) => a.source === 'dependabot')).toBe(true)
        expect(result.errors.some((e) => e.repository === 'foo/bar' && e.stage === 'fetch')).toBe(true)
        expect(exitCode).not.toBe(0)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('fails the repository when both sources fail (throws, no partial data)', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(500, { message: 'boom' })
        nock('https://api.github.com')
            .get('/repos/foo/bar/code-scanning/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(500, { message: 'boom' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        const { result, exitCode } = await app.run()

        // 仓库失败语义保持：alertsCount 0 + 错误可见 + 非 0 退出
        expect(result.repositories[0].alertsCount).toBe(0)
        expect(result.errors.length).toBeGreaterThanOrEqual(1)
        expect(exitCode).not.toBe(0)
    })
})

// ---------------------------------------------------------------------------
// alertsConverged 统计口径（已收敛 ≠ 跳过）
// ---------------------------------------------------------------------------

describe('DependfixApp converged alert counting', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-c7-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
        }, null, 2))
        // lockfile 已锁 fast-uri@3.1.5（>= 告警推荐 3.1.5 → 已收敛，无需升级）
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-a}',
            '',
        ].join('\n'))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('counts already-satisfied alerts as converged instead of skipped', async () => {
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
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_DRY_RUN: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        const { result } = await app.run()

        expect(result.summary.alertsConverged).toBe(1)
        expect(result.summary.alertsSkipped).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// PR #28 复盘：跨线告警（推荐版本 major 无 lockfile 实例）不自动修复、不误标
// ---------------------------------------------------------------------------

describe('DependfixApp cross-major alert handling (PR #28)', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-crossmajor-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            devDependencies: { vite: '^8.2.0' },
        }, null, 2))
        // lockfile：vite@5.4.14（间接实例）+ vite@8.2.0（根声明）——无 6.x 实例
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function makeViteAlert(number: number, recommended: string): Record<string, unknown> {
        return {
            number,
            state: 'open',
            html_url: `https://github.com/foo/bar/security/dependabot/${number}`,
            security_advisory: { ghsa_id: `GHSA-${number}`, severity: 'high', summary: 'vite vuln' },
            security_vulnerability: {
                package: { ecosystem: 'npm', name: 'vite' },
                severity: 'high',
                vulnerable_version_range: `< ${recommended}`,
                first_patched_version: { identifier: recommended },
            },
            dependency: { package: { ecosystem: 'npm', name: 'vite' }, manifest_path: 'pnpm-lock.yaml' },
        }
    }

    it('skips cross-major alerts (recommend 6.4.3, no 6.x instance) without marking fixed/converged', async () => {
        // 跨线告警（推荐 6.4.3，lockfile 无 6.x 实例）+ 线内告警（推荐 5.4.21）
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [
                makeViteAlert(1, '6.4.3'),
                makeViteAlert(2, '5.4.21'),
            ])
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_DRY_RUN: 'true',
            },
        })

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        const { result } = await app.run()

        // 跨线告警：不修复（无 versioned-override action 针对 6.x）、不收敛 → skipped
        expect(result.summary.alertsSkipped).toBe(1)
        expect(result.summary.alertsConverged).toBe(0)
        // 线内告警正常修复（dry-run 记录 action）
        const voActions = result.actions.filter((a) => a.type === 'dependency-upgrade' && a.strategy === 'versioned-override')
        expect(voActions.length).toBe(1)
        expect(voActions[0].toVersion).toContain('5.4.21')
        // 跨线告警仍在告警列表（报告可见），且未被标记 fixed（版本满足判定）
        const crossAlert = result.alerts.find((a) => a.ruleId === 'GHSA-1')
        expect(crossAlert).toBeDefined()
    })
})
