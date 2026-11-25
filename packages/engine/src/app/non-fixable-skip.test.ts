import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

/**
 * 不可自动修复告警的跳过原因归组（Dependabot 无补丁版本 → `no-patch`）与告警级未修复计数。
 *
 * 单独成文件：`index.test.ts` 已接近 max-lines，新增 fixture 会把大文件推过阈值；
 * 本用例复用同一真实引擎路径（nock + 临时工作区），不引入 mock 自洽。
 */
describe('DependfixApp non-fixable alert skip reason', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-non-fixable-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            dependencies: { '@dependfix/core': '^1.0.0' },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\n')
        nock.disableNetConnect()
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('records Dependabot alerts without a patched version under no-patch reason', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [{
                number: 9,
                state: 'open',
                html_url: 'https://github.com/foo/bar/security/dependabot/9',
                dependency: {
                    package: { ecosystem: 'npm', name: 'left-pad' },
                    manifest_path: 'package.json',
                    relationship: 'direct',
                },
                security_advisory: { ghsa_id: 'GHSA-nofix', severity: 'high', summary: 'No patched version' },
                security_vulnerability: {
                    package: { ecosystem: 'npm', name: 'left-pad' },
                    severity: 'high',
                    vulnerable_version_range: '< 1.0.0',
                    first_patched_version: null,
                },
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

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        expect(result.actions.filter((a) => a.type === 'dependency-upgrade')).toHaveLength(0)
        expect(result.summary.alertsSkipped).toBe(1)
        expect(result.summary.alertsSkippedByReason['no-patch']).toBe(1)
        // 无补丁版本不得同时计入 not-fixable（同一告警一轮只计一次）
        expect(result.summary.alertsSkippedByReason['not-fixable']).toBeUndefined()
        expect(result.summary.alertsUnfixed).toBe(1)
        expect(Object.values(result.summary.alertsSkippedByReason).reduce((sum, value) => sum + value, 0)).toBe(1)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('records no-patch outcomes without writing no-recommended-version alerts', async () => {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [
                {
                    number: 9,
                    state: 'open',
                    html_url: 'https://github.com/foo/bar/security/dependabot/9',
                    dependency: {
                        package: { ecosystem: 'npm', name: 'left-pad' },
                        manifest_path: 'package.json',
                        relationship: 'direct',
                    },
                    security_advisory: { ghsa_id: 'GHSA-nofix', severity: 'high', summary: 'No patched version' },
                    security_vulnerability: {
                        package: { ecosystem: 'npm', name: 'left-pad' },
                        severity: 'high',
                        vulnerable_version_range: '< 1.0.0',
                        first_patched_version: null,
                    },
                },
                {
                    // 缺 first_patched_version：按 fixable=true、无推荐版本处理（等上游，不落明细）
                    number: 10,
                    state: 'open',
                    html_url: 'https://github.com/foo/bar/security/dependabot/10',
                    dependency: {
                        package: { ecosystem: 'npm', name: 'minimist' },
                        manifest_path: 'package.json',
                        relationship: 'direct',
                    },
                    security_advisory: { ghsa_id: 'GHSA-wait', severity: 'high', summary: 'Waiting for upstream' },
                    security_vulnerability: {
                        package: { ecosystem: 'npm', name: 'minimist' },
                        severity: 'high',
                        vulnerable_version_range: '< 1.2.6',
                    },
                },
            ])

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

        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports') })
        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(0)
        // 无补丁版本落显式明细（平台回写 skipped，不被包级 success 覆盖）
        expect(result.alertOutcomes?.find((outcome) => outcome.upstreamId === 'dependabot:9'))
            .toMatchObject({ status: 'skipped', reason: 'no-patch' })
        // 「fixable=true 但无推荐版本」等上游，不落条目（保持 not-tried）
        expect(result.alertOutcomes?.some((outcome) => outcome.upstreamId === 'dependabot:10')).toBe(false)
        expect(result.summary.alertsSkippedByReason).toEqual({ 'no-patch': 1, 'not-fixable': 1 })
        expect(Object.values(result.summary.alertsSkippedByReason).reduce((sum, value) => sum + value, 0))
            .toBe(result.summary.alertsSkipped)
        expect(nock.pendingMocks()).toEqual([])
    })
})
