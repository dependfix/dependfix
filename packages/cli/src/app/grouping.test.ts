import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeConfig } from '@dependfix/engine'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// 组级升级集成测试：
// mock 掉真实依赖升级（fixers/dependency）与验证命令执行（verification-runner），
// 验证 app/index.ts 的组级循环语义：组级验证 / 整组回滚 / 拆组兜底 / 验证次数。
// ---------------------------------------------------------------------------

const { mockRunVerification, mockUpgradeDependency, mockOverrideTransitiveDependency, mockTryLockfileRepair } = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
    mockUpgradeDependency: vi.fn(),
    mockOverrideTransitiveDependency: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
}))

vi.mock('../runners/verification-runner', () => ({
    runVerification: mockRunVerification,
}))

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return {
        ...actual,
        upgradeDependency: mockUpgradeDependency,
        overrideTransitiveDependency: mockOverrideTransitiveDependency,
    }
})

// lockfile repair 依赖真实 pnpm 命令，与本测试无关——mock 为成功，聚焦组级语义
vi.mock('./helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers')>()
    return {
        ...actual,
        tryLockfileRepair: mockTryLockfileRepair,
    }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function alertJson(name: string, number: number): Record<string, unknown> {
    return {
        number,
        state: 'open',
        dependency: {
            package: { ecosystem: 'npm', name },
            manifest_path: 'package.json',
            scope: 'runtime',
            relationship: 'direct',
        },
        security_advisory: {
            ghsa_id: `GHSA-${number}`,
            cve_id: null,
            summary: 'test advisory',
            description: 'test',
            severity: 'high',
            vulnerabilities: [
                {
                    package: { ecosystem: 'npm', name },
                    severity: 'high',
                    vulnerable_version_range: '< 2.0.0',
                    first_patched_version: { identifier: '2.0.0' },
                },
            ],
            cvss: { score: 7.5, vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N' },
            cwes: [{ cwe_id: 'CWE-79', name: 'test' }],
            identifiers: [{ type: 'GHSA', value: `GHSA-${number}` }],
            references: [{ url: 'https://github.com/advisories/test' }],
            published_at: '2021-01-01T00:00:00Z',
            updated_at: '2021-01-01T00:00:00Z',
            withdrawn_at: null,
        },
        security_vulnerability: {
            package: { ecosystem: 'npm', name },
            severity: 'high',
            vulnerable_version_range: '< 2.0.0',
            first_patched_version: { identifier: '2.0.0' },
        },
        vulnerability_manifest_path: 'package.json',
        created_at: '2021-01-01T00:00:00Z',
        updated_at: '2021-01-01T00:00:00Z',
        html_url: `https://github.com/foo/bar/security/dependabot/${number}`,
    }
}

function verificationResult(success: boolean): ReturnType<typeof mockRunVerification> extends Promise<infer R> ? R : never {
    return {
        success,
        commandResults: [{
            command: 'pnpm lint',
            exitCode: success ? 0 : 1,
            durationMs: 0,
            stdout: '',
            stderr: success ? '' : 'mock lint failure',
        }],
    }
}

describe('DependfixApp group upgrade', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-group-app-'))
        // 无依赖的 package.json：quickVerifyProject 的脚本校验通过；
        // tryLockfileRepair 对无依赖仓库可快速成功/失败，不阻塞测试
        writeFileSync(
            join(workDir, 'package.json'),
            JSON.stringify({ name: 'fixture', scripts: { lint: 'exit 0' } }),
            'utf-8',
        )
        mockRunVerification.mockReset()
        mockUpgradeDependency.mockReset()
        mockOverrideTransitiveDependency.mockReset()
        mockTryLockfileRepair.mockReset()
        mockTryLockfileRepair.mockReturnValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            durationMs: 0,
        })
        mockUpgradeDependency.mockImplementation(({ packageName }) => ({
            packageName,
            fromVersion: '1.0.0',
            toVersion: '2.0.0',
            isMajor: true,
            success: true,
        }))
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function nockAlerts(alerts: Record<string, unknown>[]): void {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, alerts)
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })
    }

    function runFix(alerts: Record<string, unknown>[], upgradeGroups?: Record<string, string[]>): Promise<{ exitCode: number, result: Awaited<ReturnType<DependfixApp['run']>>['result'] }> {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
            cliOverrides: {
                commands: ['pnpm lint'],
                upgradeGroups,
            },
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports'), commands: ['pnpm lint'] })
        return app.run()
    }

    it('upgrades a group together with a single group verification (N verifications → G)', async () => {
        nockAlerts([alertJson('a-pkg', 1), alertJson('b-pkg', 2)])
        mockRunVerification
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 组级验证
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 最终 verifyProject

        const { exitCode, result } = await runFix([alertJson('a-pkg', 1), alertJson('b-pkg', 2)], { g: ['a-pkg', 'b-pkg'] })

        expect(exitCode).toBe(0)
        expect(result.repositories[0].fixed).toBe(2)
        // 一次组级验证 + 一次最终验证，而不是逐包 2 次 + 最终 1 次
        expect(mockRunVerification).toHaveBeenCalledTimes(2)
        const upgrades = result.actions.filter((a) => a.type === 'dependency-upgrade')
        expect(upgrades).toHaveLength(2)
        expect(upgrades.every((a) => a.success)).toBe(true)
    })

    it('rolls back the whole group and retries per-package when group verification fails', async () => {
        nockAlerts([alertJson('a-pkg', 1), alertJson('b-pkg', 2)])
        mockRunVerification
            .mockImplementationOnce(() => Promise.resolve(verificationResult(false))) // 组级验证失败
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 拆组 a-pkg 单独通过
            .mockImplementationOnce(() => Promise.resolve(verificationResult(false))) // 拆组 b-pkg 单独失败
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 最终 verifyProject（回滚后无坏改动）

        const { exitCode, result } = await runFix([alertJson('a-pkg', 1), alertJson('b-pkg', 2)], { g: ['a-pkg', 'b-pkg'] })

        expect(exitCode).toBe(1)
        expect(result.repositories[0].fixed).toBe(1)
        expect(result.repositories[0].failed).toBe(1)
        expect(mockRunVerification).toHaveBeenCalledTimes(4)

        const upgrades = result.actions.filter((a) => a.type === 'dependency-upgrade')
        expect(upgrades).toHaveLength(2)
        const aPkg = upgrades.find((a) => a.target === 'a-pkg')
        const bPkg = upgrades.find((a) => a.target === 'b-pkg')
        expect(aPkg?.success).toBe(true)
        expect(bPkg?.success).toBe(false)
        expect(bPkg?.error).toContain('per-package verification failed')
    })

    it('keeps per-package verification behavior without grouping config (backward compatible)', async () => {
        nockAlerts([alertJson('a-pkg', 1), alertJson('b-pkg', 2)])
        mockRunVerification
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 组 a-pkg
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 组 b-pkg
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 最终 verifyProject

        const { exitCode, result } = await runFix([alertJson('a-pkg', 1), alertJson('b-pkg', 2)])

        expect(exitCode).toBe(0)
        expect(result.repositories[0].fixed).toBe(2)
        // 无分组配置 → 单包组逐包验证（2 次）+ 最终 1 次
        expect(mockRunVerification).toHaveBeenCalledTimes(3)
    })

    it('isolates group rollback: failing group does not affect successful group', async () => {
        nockAlerts([alertJson('a-pkg', 1), alertJson('b-pkg', 2), alertJson('c-pkg', 3)])
        mockRunVerification
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 组1（a-pkg, b-pkg）通过
            .mockImplementationOnce(() => Promise.resolve(verificationResult(false))) // 组2（c-pkg）失败
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 拆组 c-pkg 单独通过
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 最终 verifyProject
        // 模拟真实升级：写入 package.json 的 pnpm.overrides（升级语义的落盘信号）
        mockUpgradeDependency.mockImplementation(({ packageName, targetVersion }) => {
            const pkgPath = join(workDir, 'package.json')
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
            pkg.pnpm = pkg.pnpm ?? {}
            pkg.pnpm.overrides = pkg.pnpm.overrides ?? {}
            pkg.pnpm.overrides[packageName] = targetVersion
            writeFileSync(pkgPath, JSON.stringify(pkg), 'utf-8')
            return { packageName, fromVersion: '1.0.0', toVersion: targetVersion, isMajor: true, success: true }
        })

        const { exitCode, result } = await runFix(
            [alertJson('a-pkg', 1), alertJson('b-pkg', 2), alertJson('c-pkg', 3)],
            { g1: ['a-pkg', 'b-pkg'], g2: ['c-pkg'] },
        )

        expect(exitCode).toBe(0)
        expect(result.repositories[0].fixed).toBe(3)
        expect(mockRunVerification).toHaveBeenCalledTimes(4)
        // 组2 拆组后 c-pkg 单独通过 → 所有包最终都成功
        const upgrades = result.actions.filter((a) => a.type === 'dependency-upgrade')
        expect(upgrades).toHaveLength(3)
        expect(upgrades.every((a) => a.success)).toBe(true)

        // 文件级断言：组2 回滚（组级失败时）不得丢失组1 已通过的 a-pkg/b-pkg 改动
        const finalPkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8'))
        expect(finalPkg.pnpm.overrides['a-pkg']).toBe('2.0.0')
        expect(finalPkg.pnpm.overrides['b-pkg']).toBe('2.0.0')
        expect(finalPkg.pnpm.overrides['c-pkg']).toBe('2.0.0')
    })

    it('skips verification entirely in dry-run with grouped upgrades', async () => {
        nockAlerts([alertJson('a-pkg', 1), alertJson('b-pkg', 2)])
        // dry-run：无组级验证、无最终验证 → runVerification 不应被调用
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_DRY_RUN: 'true',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
            cliOverrides: {
                commands: ['pnpm lint'],
                upgradeGroups: { g: ['a-pkg', 'b-pkg'] },
            },
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports'), commands: ['pnpm lint'] })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.repositories[0].fixed).toBe(2)
        expect(mockRunVerification).not.toHaveBeenCalled()
    })

    it('keeps failed upgrade action during per-package retry when upgrade itself fails', async () => {
        nockAlerts([alertJson('a-pkg', 1), alertJson('b-pkg', 2)])
        // 组级验证失败 → 拆组：a-pkg 升级成功（验证通过）、b-pkg 升级本身失败
        mockRunVerification
            .mockImplementationOnce(() => Promise.resolve(verificationResult(false))) // 组级验证失败
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 拆组 a-pkg 验证
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 最终 verifyProject
        mockUpgradeDependency.mockImplementation(({ packageName }) => {
            if (packageName === 'b-pkg') {
                return { packageName, fromVersion: '', toVersion: '', isMajor: false, success: false, error: 'mock upgrade failure' }
            }
            return { packageName, fromVersion: '1.0.0', toVersion: '2.0.0', isMajor: true, success: true }
        })

        const { exitCode, result } = await runFix([alertJson('a-pkg', 1), alertJson('b-pkg', 2)], { g: ['a-pkg', 'b-pkg'] })

        expect(exitCode).toBe(1)
        expect(result.repositories[0].fixed).toBe(1)
        expect(result.repositories[0].failed).toBe(1)
        expect(mockRunVerification).toHaveBeenCalledTimes(3)

        const upgrades = result.actions.filter((a) => a.type === 'dependency-upgrade')
        const bPkg = upgrades.find((a) => a.target === 'b-pkg')
        expect(bPkg?.success).toBe(false)
        expect(bPkg?.error).toBe('mock upgrade failure')
    })

    it('keeps lockfile-manifest alerts for indirect deps but skips root-direct-dep ones', async () => {
        // 真实场景（run 30933266831）：Dependabot 对间接依赖的 manifest_path 即 pnpm-lock.yaml。
        // vite 是根直接依赖（devDependencies ^8.2.0）→ 跳过（overrides 全局会降级根）；
        // fast-uri 非根直接依赖 → 走标准 overrides 修复。
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            scripts: { lint: 'exit 0' },
            devDependencies: { vite: '^8.2.0' },
        }))

        const viteAlert = alertJson('vite', 101)
        const viteDep = viteAlert.dependency as Record<string, unknown>
        const viteVuln = viteAlert.security_vulnerability as Record<string, unknown>
        const viteAdvisory = viteAlert.security_advisory as Record<string, unknown>
        viteDep.manifest_path = 'pnpm-lock.yaml'
        viteVuln.first_patched_version = { identifier: '6.4.3' }
        ;(viteAdvisory.vulnerabilities as Array<Record<string, unknown>>)[0].first_patched_version = { identifier: '6.4.3' }
        viteAlert.vulnerability_manifest_path = 'pnpm-lock.yaml'

        const fastUriAlert = alertJson('fast-uri', 102)
        const fastUriDep = fastUriAlert.dependency as Record<string, unknown>
        fastUriDep.manifest_path = 'pnpm-lock.yaml'
        fastUriAlert.vulnerability_manifest_path = 'pnpm-lock.yaml'

        nockAlerts([viteAlert, fastUriAlert])
        mockRunVerification
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // fast-uri 组级验证
            .mockImplementationOnce(() => Promise.resolve(verificationResult(true))) // 最终 verifyProject

        const { exitCode, result } = await runFix([viteAlert, fastUriAlert])

        expect(exitCode).toBe(0)
        // vite（根直接依赖 + lockfile manifest）被剔除：仅 fast-uri 进入升级
        expect(mockUpgradeDependency).toHaveBeenCalledTimes(1)
        expect(mockUpgradeDependency.mock.calls[0]?.[0].packageName).toBe('fast-uri')
        const upgrades = result.actions.filter((a) => a.type === 'dependency-upgrade')
        expect(upgrades.map((a) => a.target)).toEqual(['fast-uri'])
        // 报告保留 vite 告警 + 计入 skipped
        expect(result.alerts.some((a) => a.packageName === 'vite' && a.manifestPath === 'pnpm-lock.yaml')).toBe(true)
        expect(result.summary.alertsSkipped).toBe(1)
    })
})
