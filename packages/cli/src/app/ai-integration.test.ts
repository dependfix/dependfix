import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixAction } from '@dependfix/core'
import { resolveRuntimeConfig } from '@dependfix/engine'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// AI 研判 app 集成（2.0.2 跨线链路 × AI）：
// mock runAiIntegration（AI 模块已单独覆盖），验证 app 层触发时机与结果判定：
// - 验证失败 + AI code-change 修复成功 → 升级保留（fixed）
// - 验证失败 + AI 降级/建议 → 回滚（failed）+ 建议 action
// - 验证成功 + AI 预防性修复 → fixed + ai-patch
// - dry-run / trigger 不匹配 → 不触发 AI
// ---------------------------------------------------------------------------

const { mockRunVerification, mockUpgradeDependency, mockTryLockfileRepair, mockRunAiIntegration } = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
    mockUpgradeDependency: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
    mockRunAiIntegration: vi.fn(),
}))

vi.mock('../runners/verification-runner', () => ({
    runVerification: mockRunVerification,
}))

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return {
        ...actual,
        upgradeDependency: mockUpgradeDependency,
    }
})

vi.mock('./helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers')>()
    return {
        ...actual,
        tryLockfileRepair: mockTryLockfileRepair,
    }
})

vi.mock('../ai/app-integration', () => ({
    runAiIntegration: mockRunAiIntegration,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function verificationResult(success: boolean) {
    return {
        success,
        commandResults: [
            { command: 'pnpm install --frozen-lockfile', exitCode: success ? 0 : 1, durationMs: 0, stdout: '', stderr: success ? '' : 'mock install failure' },
            { command: 'pnpm lint', exitCode: success ? 0 : 1, durationMs: 0, stdout: '', stderr: success ? '' : 'mock lint failure' },
            { command: 'pnpm build', exitCode: success ? 0 : 1, durationMs: 0, stdout: '', stderr: success ? '' : 'mock build failure' },
        ],
    }
}

function makeViteCrossMajorAlert(number: number): Record<string, unknown> {
    return {
        number,
        state: 'open',
        html_url: `https://github.com/foo/bar/security/dependabot/${number}`,
        security_advisory: { ghsa_id: `GHSA-${number}`, severity: 'high', summary: 'vite vuln' },
        security_vulnerability: {
            package: { ecosystem: 'npm', name: 'vite' },
            severity: 'high',
            vulnerable_version_range: '< 6.4.3',
            first_patched_version: { identifier: '6.4.3' },
        },
        dependency: { package: { ecosystem: 'npm', name: 'vite' }, manifest_path: 'pnpm-lock.yaml' },
    }
}

function writeSingleVersionLockfile(workDir: string): void {
    writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
        'lockfileVersion: \'9.0\'',
        '',
        '  vite@5.4.14:',
        '    resolution: {integrity: sha512-a}',
        '',
    ].join('\n'))
}

function mockUpgradeWritingManifest(packageName: string, targetVersion: string): void {
    mockUpgradeDependency.mockImplementation(async ({ workDir }: { workDir: string }) => {
        const pkgPath = join(workDir, 'package.json')
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, Record<string, string>>
        const groups = ['dependencies', 'devDependencies', 'optionalDependencies']
        for (const group of groups) {
            const deps = pkg[group]
            if (deps && packageName in deps) {
                const from = deps[packageName]
                deps[packageName] = `^${targetVersion}`
                writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
                const lockPath = join(workDir, 'pnpm-lock.yaml')
                const lockContent = readFileSync(lockPath, 'utf-8')
                const instanceMatch = new RegExp(`^\\s+${packageName}@(\\d+\\.\\d+\\.\\d+):`, 'm').exec(lockContent)
                const updated = instanceMatch
                    ? lockContent.replace(`  ${packageName}@${instanceMatch[1]}:`, `  ${packageName}@${targetVersion}:`)
                    : lockContent
                writeFileSync(lockPath, updated)
                return { packageName, fromVersion: from, toVersion: `^${targetVersion}`, isMajor: true, success: true }
            }
        }
        return { packageName, fromVersion: '', toVersion: targetVersion, isMajor: true, success: false, error: 'not found' }
    })
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

/** 构造 ai-patch 成功 action（模拟 runAiIntegration 的 code-change 闭环结果） */
function aiPatchSuccessAction(): FixAction {
    return {
        type: 'dependency-upgrade',
        repository: 'foo/bar',
        target: 'vite',
        fromVersion: '^5.4.0',
        toVersion: '^6.4.3',
        isMajor: true,
        success: true,
        strategy: 'ai-patch',
        diff: 'AI 修复 1 个文件：src/main.ts',
        durationMs: 0,
    }
}

function aiSuggestionAction(): FixAction {
    return {
        type: 'dependency-upgrade',
        repository: 'foo/bar',
        target: 'vite',
        fromVersion: '^5.4.0',
        toVersion: '^6.4.3',
        isMajor: true,
        success: true,
        strategy: 'ai-suggestion',
        noOp: true,
        diff: '人工处理建议：需要迁移配置',
        durationMs: 0,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DependfixApp AI integration (2.0.2 × AI)', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-ai-'))
        mockRunVerification.mockReset()
        mockUpgradeDependency.mockReset()
        mockTryLockfileRepair.mockReset().mockReturnValue({
            type: 'lockfile-repair', repository: 'foo/bar', target: 'pnpm-lock.yaml', success: true, durationMs: 0,
        })
        mockRunAiIntegration.mockReset()
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function runApp(overrides: { env?: Record<string, string>, cliOverrides?: Parameters<typeof resolveRuntimeConfig>[0]['cliOverrides'] } = {}): Promise<Awaited<ReturnType<DependfixApp['run']>>> {
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

    function setupMajorUpgradeFixture(): void {
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'exit 0', build: 'exit 0' },
            devDependencies: { vite: '^5.4.0' },
        }, null, 2))
        writeSingleVersionLockfile(workDir)
        nockAlerts([makeViteCrossMajorAlert(1)])
        mockUpgradeWritingManifest('vite', '6.4.3')
    }

    it('triggers AI on verification failure and keeps the upgrade when AI patch succeeds', async () => {
        setupMajorUpgradeFixture()
        mockRunVerification.mockResolvedValue(verificationResult(false))
        mockRunAiIntegration.mockResolvedValue({
            attempted: true,
            actions: [aiPatchSuccessAction()],
        })

        const { result } = await runApp({
            env: { DEPENDFIX_AI: 'true', DEPENDFIX_AI_API_KEY: 'sk-test-key-1234567890' },
            cliOverrides: { allowMajorUpgrade: true },
        })

        // 验证失败 → AI 触发（带失败日志）→ patch 成功 → 升级保留
        expect(mockRunAiIntegration).toHaveBeenCalledTimes(1)
        const aiCall = mockRunAiIntegration.mock.calls[0] as [unknown, { failureLog?: string }]
        expect(aiCall[1].failureLog).toBeDefined()
        // verifyProject 的失败 action error 为 exit code 形态
        expect(aiCall[1].failureLog).toContain('exit code 1')
        expect(result.summary.alertsFixed).toBe(1)
        expect(result.summary.alertsFailed).toBe(0)
        // 声明保留新版本
        const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as { devDependencies: Record<string, string> }
        expect(pkg.devDependencies.vite).toBe('^6.4.3')
        // ai-patch action 入报告
        const aiPatchActions = result.actions.filter((a) => a.strategy === 'ai-patch')
        expect(aiPatchActions).toHaveLength(1)
        expect(aiPatchActions[0].success).toBe(true)
    })

    it('rolls back the upgrade when AI degrades to suggestion', async () => {
        setupMajorUpgradeFixture()
        mockRunVerification.mockResolvedValue(verificationResult(false))
        mockRunAiIntegration.mockResolvedValue({
            attempted: true,
            actions: [aiSuggestionAction()],
        })

        const { result } = await runApp({
            env: { DEPENDFIX_AI: 'true', DEPENDFIX_AI_API_KEY: 'sk-test-key-1234567890' },
            cliOverrides: { allowMajorUpgrade: true },
        })

        expect(result.summary.alertsFailed).toBe(1)
        expect(result.summary.alertsFixed).toBe(0)
        // 声明已回滚
        const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as { devDependencies: Record<string, string> }
        expect(pkg.devDependencies.vite).toBe('^5.4.0')
        // 建议 action 可见
        const suggestionActions = result.actions.filter((a) => a.strategy === 'ai-suggestion')
        expect(suggestionActions).toHaveLength(1)
    })

    it('runs preventive AI after successful major upgrade (no failure log)', async () => {
        setupMajorUpgradeFixture()
        mockRunVerification.mockResolvedValue(verificationResult(true))
        mockRunAiIntegration.mockResolvedValue({
            attempted: true,
            actions: [aiPatchSuccessAction()],
        })

        const { result } = await runApp({
            env: { DEPENDFIX_AI: 'true', DEPENDFIX_AI_API_KEY: 'sk-test-key-1234567890' },
            cliOverrides: { allowMajorUpgrade: true },
        })

        expect(mockRunAiIntegration).toHaveBeenCalledTimes(1)
        const aiCall = mockRunAiIntegration.mock.calls[0] as [unknown, { failureLog?: string }]
        expect(aiCall[1].failureLog).toBeUndefined()
        expect(result.summary.alertsFixed).toBe(1)
    })

    it('does not trigger AI in dry-run (no cost)', async () => {
        setupMajorUpgradeFixture()
        mockRunVerification.mockResolvedValue(verificationResult(true))

        const { result } = await runApp({
            env: {
                DEPENDFIX_AI: 'true',
                DEPENDFIX_AI_API_KEY: 'sk-test-key-1234567890',
                DEPENDFIX_DRY_RUN: 'true',
            },
            cliOverrides: { allowMajorUpgrade: true },
        })

        expect(mockRunAiIntegration).not.toHaveBeenCalled()
        expect(result.summary.alertsFixed).toBe(1)
    })

    it('does not trigger AI when trigger=failure and verification passed', async () => {
        setupMajorUpgradeFixture()
        mockRunVerification.mockResolvedValue(verificationResult(true))

        const { result } = await runApp({
            env: {
                DEPENDFIX_AI: 'true',
                DEPENDFIX_AI_API_KEY: 'sk-test-key-1234567890',
                DEPENDFIX_AI_TRIGGER: 'failure',
            },
            cliOverrides: { allowMajorUpgrade: true },
        })

        expect(mockRunAiIntegration).not.toHaveBeenCalled()
        expect(result.summary.alertsFixed).toBe(1)
    })

    it('keeps AI disabled by default (no trigger, backward compatible)', async () => {
        setupMajorUpgradeFixture()
        mockRunVerification.mockResolvedValue(verificationResult(false))

        const { result } = await runApp({ cliOverrides: { allowMajorUpgrade: true } })

        expect(mockRunAiIntegration).not.toHaveBeenCalled()
        expect(result.summary.alertsFailed).toBe(1)
    })

    it('keeps the upgrade when preventive AI patch fails (scenario C: exit 1, not counted as alert failure)', async () => {
        setupMajorUpgradeFixture()
        mockRunVerification.mockResolvedValue(verificationResult(true))
        // AI 内部验证失败 → 已回滚 patch（ai-patch failed 动作）
        mockRunAiIntegration.mockResolvedValue({
            attempted: true,
            usage: { calls: 1, inputTokens: 1200, outputTokens: 340, totalTokens: 1540, estimatedCostUsd: 0.0003 },
            actions: [{
                type: 'dependency-upgrade',
                repository: 'foo/bar',
                target: 'vite',
                fromVersion: '^5.4.0',
                toVersion: '^6.4.3',
                isMajor: true,
                success: false,
                strategy: 'ai-patch',
                error: 'AI 修复验证失败（pnpm build）；已回滚，转人工建议',
                durationMs: 0,
            }],
        })

        const { result, exitCode } = await runApp({
            env: { DEPENDFIX_AI: 'true', DEPENDFIX_AI_API_KEY: 'sk-test-key-1234567890' },
            cliOverrides: { allowMajorUpgrade: true },
        })

        // 升级保留（fixed）+ AI 修复失败（exit 1，提示人工）但不计 alertsFailed
        expect(result.summary.alertsFixed).toBe(1)
        expect(result.summary.alertsFailed).toBe(0)
        expect(exitCode).toBe(1)
        // 声明保留新版本
        const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as { devDependencies: Record<string, string> }
        expect(pkg.devDependencies.vite).toBe('^6.4.3')
        // ai-patch 失败动作报告可见
        const aiPatchActions = result.actions.filter((a) => a.strategy === 'ai-patch')
        expect(aiPatchActions).toHaveLength(1)
        expect(aiPatchActions[0].success).toBe(false)
        // AI 用量聚合进报告（aiUsage 段数据源）
        expect(result.aiUsage).toEqual({ calls: 1, inputTokens: 1200, outputTokens: 340, totalTokens: 1540, estimatedCostUsd: 0.0003 })
    })
})
