import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@dependfix/core'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// 禁止真实外联：未匹配请求（含启动安全检查的 GET /user 权限探测）抛错，
// 由 checkTokenPermissions 静默 catch（best-effort 设计），零真实网络调用。
// ---------------------------------------------------------------------------

beforeEach(() => {
    nock.disableNetConnect()
})

// ---------------------------------------------------------------------------
// 成员级升级集成测试（2.0.3 链路）：
// mock 掉真实依赖升级（fixers/dependency 的 upgradeDependency）与验证命令执行
// （verification-runner），验证 app/index.ts 2.0.3 成员链路语义：
// workspace 成员 manifest 直接依赖（manifest_path = packages/web/package.json）
// 在可安全处理时自动升级成员声明；升级后实例复核；lint-only 快速验证；
// 失败/残留回滚计 failed；降级风险 / 多版本共存维持人工；dry-run 不写盘。
// ---------------------------------------------------------------------------

const { mockRunVerification, mockUpgradeDependency, mockTryLockfileRepair, mockRunTrackedCommand, mockFamilyResolver } = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
    mockUpgradeDependency: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
    mockRunTrackedCommand: vi.fn(),
    mockFamilyResolver: { resolve: vi.fn(), describe: vi.fn() },
}))

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return {
        ...actual,
        runVerification: mockRunVerification,
    }
})

vi.mock('../fixers/dependency', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../fixers/dependency')>()
    return {
        ...actual,
        upgradeDependency: mockUpgradeDependency,
    }
})

// lockfile repair 依赖真实 pnpm 命令，与本测试无关——mock 为成功，聚焦成员链路
vi.mock('./helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers')>()
    return {
        ...actual,
        tryLockfileRepair: mockTryLockfileRepair,
    }
})

// 家族锁步写入会真实调用 pnpm install —— 在本文件中统一替身为「改写 lockfile 的成功安装」
vi.mock('../runners/process-control', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/process-control')>()
    return {
        ...actual,
        runTrackedCommand: mockRunTrackedCommand,
    }
})

// 家族成员版本解析走 registry（fetch）——注入替身，避免与 nock / Octokit 的全局 fetch 抢拦截
vi.mock('../fixers/dependency/family-versions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../fixers/dependency/family-versions')>()
    return {
        ...actual,
        getFamilyVersionResolver: () => mockFamilyResolver,
    }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 模拟真实 upgradeDependency 行为：修改成员 manifest 声明（同前缀策略）并返回结果。
 * 同时更新 lockfile 模拟 install 结果：
 * - `keepOldInstance: false`（默认）：单版本跟随——lockfile 中旧实例替换为目标版本
 * - `keepOldInstance: true`：模拟根全局 override / 其他位置 pin 残留——
 *   lockfile 中旧实例保留并追加目标版本（共存状态，触发实例复核回滚）
 */
function mockUpgradeMemberWritingManifest(
    packageName: string,
    targetVersion: string,
    options: { keepOldInstance?: boolean } = {},
) {
    const { keepOldInstance = false } = options
    mockUpgradeDependency.mockImplementation(async ({ workDir, manifestDir }: { workDir: string, manifestDir?: string }) => {
        const pkgPath = join(workDir, manifestDir ?? '.', 'package.json')
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, Record<string, string>>
        const groups = ['dependencies', 'devDependencies', 'optionalDependencies']
        for (const group of groups) {
            const deps = pkg[group]
            if (deps && packageName in deps) {
                const from = deps[packageName]
                deps[packageName] = `^${targetVersion}`
                writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
                // 更新 lockfile 实例：替换旧实例（跟随）或追加目标实例（残留共存）
                const lockPath = join(workDir, 'pnpm-lock.yaml')
                const lockContent = readFileSync(lockPath, 'utf-8')
                const instanceMatch = new RegExp(`^\\s+${packageName}@(\\d+\\.\\d+\\.\\d+):`, 'm').exec(lockContent)
                let updated = lockContent
                if (!keepOldInstance && instanceMatch) {
                    updated = lockContent.replace(
                        `  ${packageName}@${instanceMatch[1]}:`,
                        `  ${packageName}@${targetVersion}:`,
                    )
                }
                const lockContentAfter = keepOldInstance
                    ? `${updated}  ${packageName}@${targetVersion}:\n    resolution: {integrity: sha512-new}\n\n`
                    : updated
                writeFileSync(lockPath, lockContentAfter)
                return {
                    packageName,
                    fromVersion: from,
                    toVersion: `^${targetVersion}`,
                    isMajor: false,
                    success: true,
                }
            }
        }
        return {
            packageName,
            fromVersion: '',
            toVersion: targetVersion,
            isMajor: false,
            success: false,
            error: `${packageName} not found in member dependencies`,
        }
    })
}

function verificationResult(success: boolean) {
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

function makeViteMemberAlert(number: number, recommended: string): Record<string, unknown> {
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
        dependency: { package: { ecosystem: 'npm', name: 'vite' }, manifest_path: 'packages/web/package.json' },
    }
}

/** 单版本 lockfile（vite@5.4.14，同 major 线内） */
function writeSingleVersionLockfile(workDir: string): void {
    writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
        'lockfileVersion: \'9.0\'',
        '',
        '  vite@5.4.14:',
        '    resolution: {integrity: sha512-a}',
        '',
    ].join('\n'))
}

/** 多版本共存 lockfile（vite@5.4.14 + vite@8.2.0） */
function writeMultiVersionLockfile(workDir: string): void {
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
}

/**
 * 构造 workspace 结构：pnpm-workspace.yaml（packages/*）+ 根 package.json
 * （根不声明 vite，仅成员声明）+ packages/web/package.json。
 */
function setupMemberWorkspace(workDir: string, memberDeclaration = '^5.4.0'): string {
    writeFileSync(join(workDir, 'package.json'), JSON.stringify({
        name: 'fixture-root',
        version: '1.0.0',
        scripts: { lint: 'exit 0' },
    }, null, 2))
    writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    mkdirSync(join(workDir, 'packages', 'web'), { recursive: true })
    const memberPkgPath = join(workDir, 'packages', 'web', 'package.json')
    writeFileSync(memberPkgPath, JSON.stringify({
        name: 'web',
        version: '1.0.0',
        dependencies: { vite: memberDeclaration },
    }, null, 2))
    return memberPkgPath
}

function nockAlerts(alerts: Record<string, unknown>[]): void {
    nock('https://api.github.com')
        .get('/repos/foo/bar/dependabot/alerts')
        .query({ state: 'open', per_page: '100' })
        .reply(200, alerts)
    nock('https://api.github.com')
        .get('/repos/foo/bar')
        .reply(200, { default_branch: 'main' })
}

describe('DependfixApp member upgrade (2.0.3)', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-member-upgrade-'))
        mockRunVerification.mockReset()
        mockUpgradeDependency.mockReset()
        mockTryLockfileRepair.mockReset().mockReturnValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            durationMs: 0,
        })
        mockRunVerification.mockResolvedValue(verificationResult(true))
        mockFamilyResolver.resolve.mockReset()
        mockFamilyResolver.describe.mockReset()
        mockRunTrackedCommand.mockReset()
        mockRunTrackedCommand.mockResolvedValue({
            started: true,
            exitCode: 0,
            signal: null,
            timedOut: false,
            aborted: false,
            errno: null,
            stdout: '',
            stderr: '',
            durationMs: 0,
        })
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function runApp(overrides: { env?: Record<string, string>, cliOverrides?: NonNullable<Parameters<typeof resolveRuntimeConfig>[0]>['cliOverrides'], logger?: Logger } = {}): Promise<Awaited<ReturnType<DependfixApp['run']>>> {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                ...overrides.env,
            },
            cliOverrides: overrides.cliOverrides,
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports'), logger: overrides.logger })
        return app.run()
    }

    function makeLogger(): Logger & { warn: ReturnType<typeof vi.fn> } {
        return {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        } as never
    }

    it('logs the install failure reason when the member upgrade cannot be applied', async () => {
        setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '5.4.20')])
        mockUpgradeDependency.mockResolvedValue({
            packageName: 'vite',
            fromVersion: '^5.4.0',
            toVersion: '^5.4.20',
            isMajor: false,
            success: false,
            error: 'pnpm install failed: signal SIGKILL',
        })

        const logger = makeLogger()
        const { result } = await runApp({ logger })

        // 失败原因进执行日志，且带成员 manifest 路径（多成员场景可定位到具体文件）
        expect(logger.warn).toHaveBeenCalledWith(
            '[member-upgrade] vite (packages/web/package.json): upgrade failed — pnpm install failed: signal SIGKILL',
        )
        expect(result.summary.alertsFailed).toBe(1)
    })

    it('marks environmental install failures on the member path without attributing them', async () => {
        setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '5.4.20')])
        mockUpgradeDependency.mockResolvedValue({
            packageName: 'vite',
            fromVersion: '^5.4.0',
            toVersion: '^5.4.20',
            isMajor: false,
            success: false,
            error: 'pnpm install failed: timed out',
            environmental: true,
        })

        const { exitCode, result } = await runApp()

        expect(exitCode).toBe(0)
        expect(result.summary.environmentalFailures).toBe(1)
        expect(result.summary.alertsFailed).toBe(0)
        expect(result.repositories[0].failed).toBe(0)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(1)
        expect(memberActions[0]).toMatchObject({ success: false, environmentalFailure: true })
        expect(result.errors.some((error) => error.category === 'ENVIRONMENT_ERROR')).toBe(true)
    })

    it('stops remaining member and group installs when a member install fails environmentally', async () => {
        setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        // 成员告警 + 根 manifest 告警：环境性停机后分组链也不得再试装
        nockAlerts([
            makeViteMemberAlert(1, '5.4.20'),
            {
                number: 2,
                state: 'open',
                html_url: 'https://github.com/foo/bar/security/dependabot/2',
                security_advisory: { ghsa_id: 'GHSA-2', severity: 'high', summary: 'lodash vuln' },
                security_vulnerability: {
                    package: { ecosystem: 'npm', name: 'lodash' },
                    severity: 'high',
                    vulnerable_version_range: '< 4.17.21',
                    first_patched_version: { identifier: '4.17.21' },
                },
                dependency: { package: { ecosystem: 'npm', name: 'lodash' }, manifest_path: 'package.json' },
            },
            // 无修复版本的根告警：跳过分组链后仍须计入 not-fixable（报告 failedResidual 不虚高）
            {
                number: 3,
                state: 'open',
                html_url: 'https://github.com/foo/bar/security/dependabot/3',
                security_advisory: { ghsa_id: 'GHSA-3', severity: 'high', summary: 'no patch' },
                security_vulnerability: {
                    package: { ecosystem: 'npm', name: 'minimist' },
                    severity: 'high',
                    vulnerable_version_range: '< 1.2.6',
                },
                dependency: { package: { ecosystem: 'npm', name: 'minimist' }, manifest_path: 'package.json' },
            },
        ])
        mockUpgradeDependency.mockResolvedValue({
            packageName: 'vite',
            fromVersion: '^5.4.0',
            toVersion: '^5.4.20',
            isMajor: false,
            success: false,
            error: 'pnpm install failed: timed out',
            environmental: true,
        })

        const logger = makeLogger()
        const { exitCode, result } = await runApp({ logger })

        expect(exitCode).toBe(0)
        expect(result.summary.environmentalFailures).toBe(1)
        expect(result.summary.alertsFailed).toBe(0)
        // 只有成员链路的那一次安装尝试；分组链被跳过
        expect(mockUpgradeDependency).toHaveBeenCalledTimes(1)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('stopped (environmental) — skipping group upgrades'))
        expect(result.actions.filter((action) => action.strategy !== 'member-upgrade' && action.type === 'dependency-upgrade')).toHaveLength(0)
        // 整段跳过分组链时 not-fixable 仍记账（记账点在告警分区处，不依赖分组链执行）
        expect(result.summary.alertsSkippedByReason['not-fixable']).toBe(1)
        expect(result.summary.alertsSkipped).toBe(1)
    })

    it('upgrades a member manifest direct dependency with lint verification (fixed)', async () => {
        const memberPkgPath = setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '5.4.20')])
        mockUpgradeMemberWritingManifest('vite', '5.4.20')

        const { result } = await runApp()

        expect(result.summary.alertsSkipped).toBe(0)
        expect(result.summary.alertsFixed).toBe(1)
        expect(result.summary.alertsFailed).toBe(0)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(1)
        expect(memberActions[0]).toMatchObject({
            target: 'vite',
            toVersion: '^5.4.20',
            isMajor: false,
            success: true,
            filePath: 'packages/web/package.json',
        })
        // 验证链为 lint-only（与 2.0 常规升级一致，非完整验证）
        const verificationCalls = mockRunVerification.mock.calls
        const lintVerifyCall = verificationCalls.find(([params]) => params.commands.length === 1)
        expect(lintVerifyCall).toBeDefined()
        expect(lintVerifyCall![0].commands).toEqual(['pnpm lint'])
        // 成员声明已更新，根 manifest 未动
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { dependencies: Record<string, string> }
        expect(memberPkg.dependencies.vite).toBe('^5.4.20')
        const rootPkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as Record<string, unknown>
        expect(rootPkg.dependencies).toBeUndefined()
    })

    it('rolls back member manifest when verification fails (failed, not fixed)', async () => {
        const memberPkgPath = setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '5.4.20')])
        mockUpgradeMemberWritingManifest('vite', '5.4.20')
        // 基线（stopOnFailure=false）成功、修复后 quick 验证失败：失败来自本次改动，应回滚
        mockRunVerification.mockImplementation(async (params: { stopOnFailure?: boolean }) =>
            verificationResult(params.stopOnFailure === false))

        const { result } = await runApp()

        expect(result.summary.alertsFailed).toBe(1)
        expect(result.summary.alertsFixed).toBe(0)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(1)
        expect(memberActions[0].success).toBe(false)
        expect(memberActions[0].error).toContain('rolled back')
        // 成员声明已回滚
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { dependencies: Record<string, string> }
        expect(memberPkg.dependencies.vite).toBe('^5.4.0')
    })

    it('rolls back when a vulnerable instance remains after the member upgrade (root override / other pin)', async () => {
        const memberPkgPath = setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '5.4.20')])
        // keepOldInstance: 模拟根全局 override 冲突——成员声明已升但 lockfile 残留旧实例
        mockUpgradeMemberWritingManifest('vite', '5.4.20', { keepOldInstance: true })

        const { result } = await runApp()

        expect(result.summary.alertsFailed).toBe(1)
        expect(result.summary.alertsFixed).toBe(0)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(1)
        expect(memberActions[0].success).toBe(false)
        expect(memberActions[0].error).toContain('vulnerable instance')
        // 成员声明已回滚（残留实例不进入验证阶段，直接回滚）
        const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf-8')) as { dependencies: Record<string, string> }
        expect(memberPkg.dependencies.vite).toBe('^5.4.0')
        // 实例复核先于成员级 quickVerify：无 lint-only 快速验证调用
        // （主流程整体验证 install+lint 不受影响，此处仅断言 2.0.3 未走 quickVerify）
        const quickVerifyCalls = mockRunVerification.mock.calls.filter(([params]) => params.commands.length === 1)
        expect(quickVerifyCalls).toHaveLength(0)
    })

    it('records planned actions without writing files in dry-run', async () => {
        const memberPkgPath = setupMemberWorkspace(workDir)
        const originalMember = readFileSync(memberPkgPath, 'utf-8')
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '5.4.20')])

        const { result } = await runApp({ env: { DEPENDFIX_DRY_RUN: 'true' } })

        expect(result.summary.alertsFixed).toBe(1)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(1)
        expect(memberActions[0].success).toBe(true)
        expect(memberActions[0].filePath).toBe('packages/web/package.json')
        // 不写盘
        expect(readFileSync(memberPkgPath, 'utf-8')).toBe(originalMember)
        expect(mockUpgradeDependency).not.toHaveBeenCalled()
    })

    it('keeps member manifest alert manual when recommended < locked (downgrade risk)', async () => {
        setupMemberWorkspace(workDir, '^5.4.20')
        // lockfile 锁 5.4.20，推荐 5.4.14 < 锁定 → 降级风险 → sub 人工
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.20:',
            '    resolution: {integrity: sha512-c}',
            '',
        ].join('\n'))
        nockAlerts([makeViteMemberAlert(1, '5.4.14')])

        const { result } = await runApp()

        expect(result.summary.alertsSkipped).toBe(1)
        expect(result.summary.alertsFixed).toBe(0)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(0)
        expect(mockUpgradeDependency).not.toHaveBeenCalled()
    })

    it('keeps member manifest alert manual when multiple versions coexist', async () => {
        setupMemberWorkspace(workDir)
        writeMultiVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '8.2.1')])

        const { result } = await runApp()

        expect(result.summary.alertsSkipped).toBe(1)
        expect(result.summary.alertsFixed).toBe(0)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(0)
        expect(mockUpgradeDependency).not.toHaveBeenCalled()
    })

    it('keeps member manifest alert manual when cross-major (root only)', async () => {
        setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteMemberAlert(1, '6.4.3')])

        const { result } = await runApp()

        expect(result.summary.alertsSkipped).toBe(1)
        expect(result.summary.alertsFixed).toBe(0)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(0)
        expect(mockUpgradeDependency).not.toHaveBeenCalled()
    })

    it('merges multiple alerts for the same package+dir into one representative (highest target)', async () => {
        setupMemberWorkspace(workDir)
        writeSingleVersionLockfile(workDir)
        nockAlerts([
            makeViteMemberAlert(1, '5.4.18'),
            makeViteMemberAlert(2, '5.4.20'),
        ])
        mockUpgradeMemberWritingManifest('vite', '5.4.20')

        const { result } = await runApp()

        expect(result.summary.alertsFixed).toBe(1)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade' && a.success)
        expect(memberActions).toHaveLength(1)
        expect(memberActions[0].toVersion).toBe('^5.4.20')
    })

    it('fails both members without false fixed when the same package is exactly pinned by two members', async () => {
        // 两个成员均精确 pin vite 5.4.14；任一个升级后另一成员实例残留 → 各自回滚计 failed
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture-root',
            version: '1.0.0',
            scripts: { lint: 'exit 0' },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
        for (const member of ['web', 'api']) {
            mkdirSync(join(workDir, 'packages', member), { recursive: true })
            writeFileSync(join(workDir, 'packages', member, 'package.json'), JSON.stringify({
                name: member,
                version: '1.0.0',
                dependencies: { vite: '5.4.14' },
            }, null, 2))
        }
        writeSingleVersionLockfile(workDir)
        // packages/web 与 packages/api 各自一条告警（manifest_path 不同）
        nockAlerts([
            makeViteMemberAlert(1, '5.4.20'),
            {
                ...makeViteMemberAlert(2, '5.4.20'),
                dependency: { package: { ecosystem: 'npm', name: 'vite' }, manifest_path: 'packages/api/package.json' },
            },
        ])
        // 每次升级都保留旧实例（另一成员 pin 残留）
        mockUpgradeMemberWritingManifest('vite', '5.4.20', { keepOldInstance: true })

        const { result } = await runApp()

        // 两成员均 failed（不误标 fixed）
        expect(result.summary.alertsFixed).toBe(0)
        expect(result.summary.alertsFailed).toBe(2)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(2)
        expect(memberActions.every((a) => !a.success)).toBe(true)
        expect(memberActions.every((a) => a.error?.includes('vulnerable instance'))).toBe(true)
        // 两个成员 manifest 均已回滚到 5.4.14
        for (const member of ['web', 'api']) {
            const pkg = JSON.parse(
                readFileSync(join(workDir, 'packages', member, 'package.json'), 'utf-8'),
            ) as { dependencies: Record<string, string> }
            expect(pkg.dependencies.vite).toBe('5.4.14')
        }
    })

    it('locks family members in the same member manifest to one version line', async () => {
        // 成员 manifest 内 vitest 3.x + coverage-v8 2.x（半族状态）：vitest 同 major 升级时
        // 必须把 coverage-v8 一并拉回 3.x，否则 PR 里仍是混装
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture-root',
            version: '1.0.0',
            scripts: { lint: 'exit 0' },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
        mkdirSync(join(workDir, 'packages', 'web'), { recursive: true })
        writeFileSync(join(workDir, 'packages', 'web', 'package.json'), JSON.stringify({
            name: 'web',
            version: '1.0.0',
            devDependencies: { vitest: '^3.2.0', '@vitest/coverage-v8': '^2.0.0' },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  vitest@3.2.0:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  "@vitest/coverage-v8@2.0.0":',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
        nockAlerts([{
            number: 1,
            state: 'open',
            html_url: 'https://github.com/foo/bar/security/dependabot/1',
            security_advisory: { ghsa_id: 'GHSA-family', severity: 'high', summary: 'vitest vuln' },
            security_vulnerability: {
                package: { ecosystem: 'npm', name: 'vitest' },
                severity: 'high',
                vulnerable_version_range: '< 3.2.4',
                first_patched_version: { identifier: '3.2.4' },
            },
            dependency: { package: { ecosystem: 'npm', name: 'vitest' }, manifest_path: 'packages/web/package.json' },
        }])
        mockFamilyResolver.resolve.mockResolvedValue({
            ok: true,
            info: { version: '3.2.5', peerDependencies: {} },
        })
        mockRunTrackedCommand.mockImplementation(async () => {
            writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
                'lockfileVersion: \'9.0\'',
                '',
                '  vitest@3.2.4:',
                '    resolution: {integrity: sha512-a}',
                '',
                '  "@vitest/coverage-v8@3.2.5":',
                '    resolution: {integrity: sha512-b}',
                '',
            ].join('\n'))
            return {
                started: true,
                exitCode: 0,
                signal: null,
                timedOut: false,
                aborted: false,
                errno: null,
                stdout: '',
                stderr: '',
                durationMs: 0,
            }
        })

        const { result } = await runApp()

        expect(result.summary.alertsFixed).toBe(1)
        const memberActions = result.actions.filter((a) => a.strategy === 'member-upgrade')
        expect(memberActions).toHaveLength(1)
        expect(memberActions[0]?.success).toBe(true)
        expect(memberActions[0]?.family).toEqual({
            id: 'vitest',
            members: ['vitest', '@vitest/coverage-v8'],
            skipped: ['@vitest/ui', '@vitest/browser'],
        })
        const memberPkg = JSON.parse(
            readFileSync(join(workDir, 'packages', 'web', 'package.json'), 'utf-8'),
        ) as { devDependencies: Record<string, string> }
        expect(memberPkg.devDependencies.vitest).toBe('^3.2.4')
        expect(memberPkg.devDependencies['@vitest/coverage-v8']).toBe('^3.2.5')
        // 单包升级路径未被调用（家族写入一次完成）
        expect(mockUpgradeDependency).not.toHaveBeenCalled()
    })
})
