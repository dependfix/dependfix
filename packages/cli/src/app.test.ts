import { mkdtempSync, rmSync } from 'node:fs'
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
