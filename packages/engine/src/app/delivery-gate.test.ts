// delivery-gate.test.ts — 交付正确性守卫的端到端集成（从 index.test.ts 拆出：
// index.test.ts 触及 max-lines 1000）。
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

const unfixableAlertPayload = () => ([{
    number: 1,
    state: 'open',
    security_advisory: { ghsa_id: 'GHSA-test-0000-0000', severity: 'high' },
    security_vulnerability: {
        package: { ecosystem: 'npm', name: 'lodash' },
        severity: 'high',
        vulnerable_version_range: '< 4.17.21',
    },
    dependency: { package: { ecosystem: 'npm', name: 'lodash' }, manifest_path: 'package.json' },
}])

describe('DependfixApp delivery gate', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-delivery-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            scripts: { lint: 'node -e "process.exit(0)"' },
        }))
        execSync('git add . && git commit -qm init', { cwd: workDir })
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('skips PR creation when no deliverable fixes are produced (install still failing)', async () => {
        // 未知参数让安装命令在基线与修复后都稳定失败（不依赖 shell 元字符 / 首次 install 生成 lockfile）。
        // 不 mock pulls：若错误地走到 PR 创建，nock 会因未拦截请求而失败。
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, unfixableAlertPayload())
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })

        const commands = ['pnpm install --frozen-lockfile --definitely-not-a-real-flag', 'pnpm lint']
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
            cliOverrides: { commands },
        })

        const app = new DependfixApp({
            config, workDir, reportOutputDir: join(workDir, 'reports'), commands,
        })
        const { result } = await app.run()

        // 本用例覆盖「零修复 + 安装既有失败」的组合：不可修告警 + 安装命令失败 → 0 写入。
        // 0 写入时后验证无对象：不跑验证、不交付，结果标 `no-write`；
        // 安装守卫 / 既有失败归因分别由 delivery.test.ts / verify-project.test.ts 覆盖。
        expect(result.actions.some((a) => a.type === 'verification')).toBe(false)
        expect(result.repositories[0]?.verificationSkipped).toBe('no-write')
        expect(result.summary.verificationsSkipped).toBe(1)
        expect(result.summary.alertsFixed).toBe(0)
        expect(result.errors.some((e) => e.category === 'PR_CREATION_FAILED')).toBe(false)
        expect(result.actions.some((a) => a.type === 'dependency-upgrade' && a.target.startsWith('PR #'))).toBe(false)
    }, 30_000)
})
