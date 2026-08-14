import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const { mockRunVerification, mockUpgradeDependency, mockTryLockfileRepair } = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
    mockUpgradeDependency: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
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
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function runApp(overrides: { env?: Record<string, string>, cliOverrides?: NonNullable<Parameters<typeof resolveRuntimeConfig>[0]>['cliOverrides'] } = {}): Promise<Awaited<ReturnType<DependfixApp['run']>>> {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'main-token-value',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                ...overrides.env,
            },
            cliOverrides: overrides.cliOverrides,
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        return app.run()
    }

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
        mockRunVerification.mockResolvedValue(verificationResult(false))

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
})
