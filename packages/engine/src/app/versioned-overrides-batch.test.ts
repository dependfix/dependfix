// versioned-overrides-batch.test.ts — 版本化 overrides 合批（一次安装）与失败回退。
//
// 覆盖 2026-10-16 生产复盘暴露的成本放大：逐包应用使单仓安装次数 = 可修包数（大仓实测 7–8 次）。
// 本文件锁定「合批只做加速、不改变可观测语义」：
// ① ≥2 包 → 单次批量安装 + 组级验证，逐包路径不再执行；
// ② 合批安装失败 / 组级验证失败 → 回滚到合批前快照并回退逐包，最终结果与逐包路径一致；
// ③ 单包 → 不启用合批（行为与改动前完全一致）。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@dependfix/core'
import { resetProcessControlState } from '../runners/process-control'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

beforeEach(() => {
    nock.disableNetConnect()
})

const { mockRunVerification, mockApplyVersionedOverrides, mockApplyVersionedOverridesBatch, mockTryLockfileRepair } = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
    mockApplyVersionedOverrides: vi.fn(),
    mockApplyVersionedOverridesBatch: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
}))

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return { ...actual, runVerification: mockRunVerification }
})

vi.mock('../fixers/dependency', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../fixers/dependency')>()
    return {
        ...actual,
        applyVersionedOverrides: mockApplyVersionedOverrides,
        applyVersionedOverridesBatch: mockApplyVersionedOverridesBatch,
    }
})

// 锁文件修复链依赖真实安装命令，与本测试无关——替身为成功，聚焦合批链路
vi.mock('./helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers')>()
    return { ...actual, tryLockfileRepair: mockTryLockfileRepair }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** 多版本共存 + 双包 lockfile（两个包各两条 major 线，均可修）。 */
function writeMultiPackageLockfile(workDir: string): void {
    writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
        'lockfileVersion: \'9.0\'',
        '',
        '  brace-expansion@1.1.11:',
        '    resolution: {integrity: sha512-a}',
        '',
        '  brace-expansion@2.0.1:',
        '    resolution: {integrity: sha512-b}',
        '',
        '  js-yaml@3.14.1:',
        '    resolution: {integrity: sha512-c}',
        '',
        '  js-yaml@4.1.0:',
        '    resolution: {integrity: sha512-d}',
        '',
    ].join('\n'))
}

function makeAlert(packageName: string, recommended: string, number: number): Record<string, unknown> {
    return {
        number,
        state: 'open',
        html_url: `https://github.com/foo/bar/security/dependabot/${number}`,
        security_advisory: { ghsa_id: `GHSA-${number}`, severity: 'high', summary: `${packageName} vuln` },
        security_vulnerability: {
            package: { ecosystem: 'npm', name: packageName },
            severity: 'high',
            vulnerable_version_range: `< ${recommended}`,
            first_patched_version: { identifier: recommended },
        },
        dependency: { package: { ecosystem: 'npm', name: packageName }, manifest_path: 'pnpm-lock.yaml' },
    }
}

/** 双包各两条 major 线的告警（与生产形态一致：每个 major 线一条告警）。 */
function nockTwoPackageAlerts(): void {
    nock('https://api.github.com')
        .get('/repos/foo/bar/dependabot/alerts')
        .query({ state: 'open', per_page: '100' })
        .reply(200, [
            makeAlert('brace-expansion', '1.1.21', 1),
            makeAlert('brace-expansion', '2.1.7', 2),
            makeAlert('js-yaml', '3.14.2', 3),
            makeAlert('js-yaml', '4.3.2', 4),
        ])
    nock('https://api.github.com')
        .get('/repos/foo/bar')
        .reply(200, { default_branch: 'main' })
}

function verificationResult(success: boolean) {
    const chain = ['pnpm install --frozen-lockfile', 'pnpm lint']
    return {
        success,
        commandResults: (success ? chain : chain.slice(0, 1)).map((command) => ({
            command,
            exitCode: success ? 0 : 1,
            durationMs: 0,
            stdout: '',
            stderr: success ? '' : 'mock verification failure',
        })),
    }
}

/** 批量替身：写「合批标记」后成功（用于验证回退时快照被恢复）。 */
function batchMockWritingSentinel(): void {
    mockApplyVersionedOverridesBatch.mockImplementation(async ({ workDir }: { workDir: string }) => {
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'overrides:\n  batch-sentinel: ^9.9.9\n')
        return { success: true }
    })
}

/** 逐包替身：写入以包名区分的标记，返回成功。 */
function perPackageMockSuccess(): void {
    mockApplyVersionedOverrides.mockImplementation(async ({ packageName, workDir }: { packageName: string, workDir: string }) => {
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), `overrides:\n  per-package-${packageName}: ^1.0.0\n`)
        return {
            packageName,
            fromVersion: '',
            toVersion: '^1.0.0',
            isMajor: false,
            success: true,
        }
    })
}

describe('DependfixApp 版本化 overrides 合批', () => {
    let workDir: string

    beforeEach(() => {
        resetProcessControlState()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-vo-batch-'))
        mockRunVerification.mockReset().mockResolvedValue(verificationResult(true))
        mockApplyVersionedOverrides.mockReset()
        mockApplyVersionedOverridesBatch.mockReset()
        mockTryLockfileRepair.mockReset().mockResolvedValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            durationMs: 0,
        })
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'exit 0' },
        }, null, 2))
        writeMultiPackageLockfile(workDir)
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'packages:\n  - \'.\'\n')
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function makeLogger(): Logger & { warn: ReturnType<typeof vi.fn> } {
        return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never
    }

    function runApp(logger?: Logger): Promise<Awaited<ReturnType<DependfixApp['run']>>> {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports'), logger })
        return app.run()
    }

    it('applies both packages with a single batch install (per-package path untouched)', async () => {
        batchMockWritingSentinel()
        nockTwoPackageAlerts()

        const logger = makeLogger()
        const { result } = await runApp(logger)

        // 合批一次，逐包零次
        expect(mockApplyVersionedOverridesBatch).toHaveBeenCalledTimes(1)
        expect(mockApplyVersionedOverrides).not.toHaveBeenCalled()
        const plans = (mockApplyVersionedOverridesBatch.mock.calls[0][0] as { plans: { packageName: string }[] }).plans
        expect(plans.map((p) => p.packageName).sort()).toEqual(['brace-expansion', 'js-yaml'])

        // 可观测语义与逐包路径一致：每包一条成功动作 + fixed 计数
        const versionedActions = result.actions.filter((a) => a.strategy === 'versioned-override')
        expect(versionedActions).toHaveLength(2)
        expect(versionedActions.every((a) => a.success)).toBe(true)
        // From 列取写入前锁定实例（多实例 `, ` 连接），不再恒空
        expect(versionedActions.find((a) => a.target === 'brace-expansion')?.fromVersion).toBe('1.1.11, 2.0.1')
        expect(versionedActions.find((a) => a.target === 'js-yaml')?.fromVersion).toBe('3.14.1, 4.1.0')
        expect(result.summary.alertsFixed).toBe(2)
        expect(result.summary.alertsFailed).toBe(0)
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('合批 2 个包'))
    })

    it('records peer-only skips instead of failed actions when the batch cannot be auto-fixed', async () => {
        mockApplyVersionedOverridesBatch.mockResolvedValue({
            success: false,
            manualReview: true,
            manualReviewPackages: ['brace-expansion', 'js-yaml'],
            error: 'manual review: peer-only instances do not follow pnpm overrides — vite: 8.3.1 remain below 8.3.3; changes rolled back',
            failurePhase: 'verify',
        })
        nockTwoPackageAlerts()

        const logger = makeLogger()
        const { result } = await runApp(logger)

        // 不可自动修复 → 不逐包重试（重复安装只会得到同一结论）
        expect(mockApplyVersionedOverridesBatch).toHaveBeenCalledTimes(1)
        expect(mockApplyVersionedOverrides).not.toHaveBeenCalled()
        // 记跳过（peer-only）而非失败动作
        expect(result.actions.filter((a) => a.strategy === 'versioned-override' && !a.success)).toHaveLength(0)
        expect(result.summary.alertsSkippedByReason['peer-only']).toBe(4)
        expect(result.summary.alertsFailed).toBe(0)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('不可自动修复形态'))
    })

    it('skips only peer-only packages and retries the remaining ones per-package', async () => {
        // 部分包不可自动修复：不能把可修包一并记成 peer-only 并回滚丢弃
        mockApplyVersionedOverridesBatch.mockResolvedValue({
            success: false,
            manualReviewPackages: ['brace-expansion'],
            error: 'versioned override did not take effect: js-yaml: 3.14.1 remain below 3.14.2; changes rolled back',
            failurePhase: 'verify',
        })
        perPackageMockSuccess()
        nockTwoPackageAlerts()

        const { result } = await runApp(makeLogger())

        // 合批一次 → 回滚 → 只对非 peer 包逐包重试一次
        expect(mockApplyVersionedOverrides).toHaveBeenCalledTimes(1)
        expect(result.summary.alertsSkippedByReason['peer-only']).toBe(2)
        expect(result.summary.alertsFixed).toBe(1)
    })

    it('falls back to per-package when the batch install fails (workspace restored from snapshot)', async () => {
        // 合批安装失败：替身只写标记后报错（不回滚自身），回滚由引擎的快照恢复承担
        mockApplyVersionedOverridesBatch.mockImplementation(async ({ workDir: dir }: { workDir: string }) => {
            writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'overrides:\n  batch-sentinel: ^9.9.9\n')
            return { success: false, error: 'pnpm install failed: exit code 1: install boom' }
        })
        perPackageMockSuccess()
        nockTwoPackageAlerts()

        const logger = makeLogger()
        const { result } = await runApp(logger)

        // 合批一次 → 回滚 → 逐包两次
        expect(mockApplyVersionedOverridesBatch).toHaveBeenCalledTimes(1)
        expect(mockApplyVersionedOverrides).toHaveBeenCalledTimes(2)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('合批安装失败'))
        // 合批残留已被快照恢复清除，最终状态来自逐包路径
        const workspace = readFileSync(join(workDir, 'pnpm-workspace.yaml'), 'utf-8')
        expect(workspace).not.toContain('batch-sentinel')
        expect(workspace).toContain('per-package-')
        expect(result.summary.alertsFixed).toBe(2)
    })

    it('falls back to per-package when the batch group verification fails', async () => {
        batchMockWritingSentinel()
        perPackageMockSuccess()
        nockTwoPackageAlerts()
        // runVerification 调用顺序：① 修复前基线采样（成功）② 合批后组级验证（失败）
        // ③④ 逐包路径各自验证（成功）
        mockRunVerification
            .mockResolvedValueOnce(verificationResult(true))
            .mockResolvedValueOnce(verificationResult(false))
            .mockResolvedValue(verificationResult(true))

        const logger = makeLogger()
        const { result } = await runApp(logger)

        expect(mockApplyVersionedOverridesBatch).toHaveBeenCalledTimes(1)
        expect(mockApplyVersionedOverrides).toHaveBeenCalledTimes(2)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('组级验证失败'))
        const workspace = readFileSync(join(workDir, 'pnpm-workspace.yaml'), 'utf-8')
        expect(workspace).not.toContain('batch-sentinel')
        expect(result.summary.alertsFixed).toBe(2)
    })

    it('short-circuits the per-package fallback when the run was cancelled mid-batch', async () => {
        perPackageMockSuccess()
        nockTwoPackageAlerts()
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 'token', DEPENDFIX_MODE: 'fix', DEPENDFIX_REPOSITORIES: 'foo/bar' },
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        // 合批期间发生运行级取消（平台执行超时）：回退逐包只会产出 K 条同一原因的失败动作，应短路
        mockApplyVersionedOverridesBatch.mockImplementation(async ({ workDir: dir }: { workDir: string }) => {
            writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'overrides:\n  batch-sentinel: ^9.9.9\n')
            app.abort('execution timeout')
            return { success: false, error: 'run aborted — install not started' }
        })

        const { result } = await app.run()

        expect(mockApplyVersionedOverridesBatch).toHaveBeenCalledTimes(1)
        // 取消态下不再逐包试装（无失败动作噪音）
        expect(mockApplyVersionedOverrides).not.toHaveBeenCalled()
        expect(result.actions.filter((a) => a.strategy === 'versioned-override')).toHaveLength(0)
        // 合批残留仍被快照恢复清除
        expect(readFileSync(join(workDir, 'pnpm-workspace.yaml'), 'utf-8')).not.toContain('batch-sentinel')
        expect(result.errors.some((e) => e.category === 'ABORTED')).toBe(true)
    })

    it('skips the dependency upgrade chain when the pristine install baseline fails', async () => {
        perPackageMockSuccess()
        nockTwoPackageAlerts()
        // 修复前基线在 pnpm install 处即失败：pristine 工作区都装不上，后续 override 安装必然同因失败
        mockRunVerification.mockResolvedValue(verificationResult(false))

        const logger = makeLogger()
        const { result } = await runApp(logger)

        expect(mockApplyVersionedOverridesBatch).not.toHaveBeenCalled()
        expect(mockApplyVersionedOverrides).not.toHaveBeenCalled()
        expect(result.summary.alertsFixed).toBe(0)
        expect(result.errors.some((e) => e.category === 'PRE_EXISTING_FAILURE')).toBe(true)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('skipping dependency install attempts'))
    })

    it('skips the per-package fallback when the batch install fails environmentally', async () => {
        perPackageMockSuccess()
        nockTwoPackageAlerts()
        // 环境性失败（OOM / 超时）：逐包重试只会重复同一失败并耗尽预算，应直接短路
        mockApplyVersionedOverridesBatch.mockImplementation(async ({ workDir: dir }: { workDir: string }) => {
            writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'overrides:\n  batch-sentinel: ^9.9.9\n')
            return {
                success: false,
                error: 'pnpm install failed: signal SIGKILL: Command failed: pnpm install --no-frozen-lockfile',
                failurePhase: 'install',
                environmental: true,
            }
        })

        const logger = makeLogger()
        const { result } = await runApp(logger)

        expect(mockApplyVersionedOverridesBatch).toHaveBeenCalledTimes(1)
        expect(mockApplyVersionedOverrides).not.toHaveBeenCalled()
        expect(result.actions.filter((a) => a.strategy === 'versioned-override')).toHaveLength(0)
        expect(result.errors.some((e) => e.category === 'ENVIRONMENT_ERROR')).toBe(true)
        // 合批残留仍被快照恢复清除
        expect(readFileSync(join(workDir, 'pnpm-workspace.yaml'), 'utf-8')).not.toContain('batch-sentinel')
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('跳过逐包重试'))
    })

    it('stops further install attempts when a per-package install fails environmentally', async () => {
        mockApplyVersionedOverridesBatch.mockImplementation(async ({ workDir: dir }: { workDir: string }) => {
            writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'overrides:\n  batch-sentinel: ^9.9.9\n')
            return { success: false, error: 'pnpm install failed: exit code 1: install boom', failurePhase: 'install' }
        })
        mockApplyVersionedOverrides.mockImplementation(async ({ packageName }: { packageName: string }) => ({
            packageName,
            fromVersion: '',
            toVersion: '^1.0.0',
            isMajor: false,
            success: false,
            error: 'pnpm install failed: signal SIGKILL: Command failed: pnpm install --no-frozen-lockfile',
            environmental: true,
        }))
        nockTwoPackageAlerts()

        const logger = makeLogger()
        const { result } = await runApp(logger)

        // 合批失败回退逐包；第一个包环境性失败后不再尝试第二个包，也不再进入成员 / 分组链
        expect(mockApplyVersionedOverridesBatch).toHaveBeenCalledTimes(1)
        expect(mockApplyVersionedOverrides).toHaveBeenCalledTimes(1)
        expect(result.actions.filter((a) => a.strategy === 'versioned-override')).toHaveLength(0)
        expect(result.summary.alertsFailed).toBe(0)
        expect(result.errors.some((e) => e.category === 'ENVIRONMENT_ERROR')).toBe(true)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('skipping member/group'))
    })

    it('does not enable batching for a single package (behavior unchanged)', async () => {
        perPackageMockSuccess()
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [
                makeAlert('brace-expansion', '1.1.21', 1),
                makeAlert('brace-expansion', '2.1.7', 2),
            ])
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'main' })

        const { result } = await runApp()

        expect(mockApplyVersionedOverridesBatch).not.toHaveBeenCalled()
        expect(mockApplyVersionedOverrides).toHaveBeenCalledTimes(1)
        expect(result.summary.alertsFixed).toBe(1)
    })
})
