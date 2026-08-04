import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DependfixApp } from './app'
import { resolveRuntimeConfig } from './config'

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
