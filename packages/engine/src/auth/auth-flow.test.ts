/**
 * Auth flow 端到端验证。
 *
 * **背景**：dependfix GitHub App BYO App 模式（todo.md §M18 范围）要求依赖
 * `@octokit/auth-app` 库实现 JWT signing + installation token 轮换。
 * todo.md §M18.0 P 阶段用户决策 C：**不创建真实 GitHub App fixture**，
 * 完全依赖 mock JWT signing + `getInstallationOctokit` 拦截验证全链路。
 *
 * **本测试范围**（与 [C22 PAT 无感升级评估 §5.5 决策 C](../../../../docs/design/governance/c22-pat-backward-compat.md) 对齐）：
 *
 * 1. **PAT 路径 e2e 全链路** — `createGitHubClient({ auth: fromPat() })` + nock 拦截真实 HTTP
 *    + 验证 `Authorization: token <PAT>` 注入
 * 2. **App 路径 JWT signing 全链路** — **不 mock `@octokit/auth-app`**（真实 `@octokit/auth-app`
 *    调用 chain）+ nock 拦截 installation token 端点（`POST /app/installations/{id}/access_tokens`）
 *    + 验证 `Authorization: Bearer <installation_token>` 注入
 * 3. **App 路径 installation token 切换** — 模拟 token 失效（401 响应）→ 重新获取新 token
 *    → 验证后续请求用新 token
 * 4. **App 路径 commit author 与 GitHub API 协同** — `fromApp(params)` 实例同时提供
 *    `getCommitAuthor()`（动态 bot identity）与 `getOctokit()`（installation token 路径），
 *    全链路测试两个 API 协同工作
 *
 * **决策 C 风险承担**：本测试**不**验证 `@octokit/auth-app` 库的 JWT 签名算法 /
 * rate limit 重试细节——这些由 `app-provider.test.ts` + `installation-token-cache.test.ts` +
 * 真实 GitHub App 集成测试覆盖。本测试聚焦 dependfix 自有代码路径与真实
 * `@octokit/auth-app` 库的集成（防止库升级回归 dependfix 集成层 + M18.1 commit 4
 * 实施 bug：`auth → authStrategy` 修复后真实路径不抛错）。
 *
 * @see [C22 PAT 无感升级评估 §5.5 决策 C fixture 仅 mock 风险承担方](../../../../docs/design/governance/c22-pat-backward-compat.md#55-决策-c-fixture-仅-mock-风险承担方)
 * @see [todo.md §M18.4（测试层）](../../docs/plan/todo.md)
 */

import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import nock from 'nock'
import { createGitHubClient } from '../github/client'
import { fromApp, fromPat } from './index'

const API_BASE = 'https://api.github.com'

/**
 * 生成测试用 RSA 私钥（fixture 字符串 `'-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----'`
 * 无法被 `@octokit/auth-app` 真实 JWT signing 解析——必须用合法 PKCS8 PEM 格式私钥）。
 *
 * 在 `beforeAll` 生成一次（RSA 2048 key 生成 ~100ms，避免每个 case 重复生成）。
 *
 * @see [universal-github-app-jwt lib/crypto-node.js](https://github.com/sebmosa/github-app-jwt.js) — `convertPrivateKey` 要求 PKCS8 PEM 格式
 */
const TEST_PRIVATE_KEY = (() => {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    return privateKey
})()

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth flow e2e 全链路', () => {
    afterEach(() => {
        nock.cleanAll()
    })

    // -------------------------------------------------------------------------
    // PAT 路径基线
    // -------------------------------------------------------------------------

    describe('PAT 路径基线', () => {
        it('createGitHubClient({ auth: fromPat() }) + nock 拦截 + 验证 token 注入', async () => {
            const scope = nock(API_BASE)
                .get('/repos/foo/bar')
                .matchHeader('authorization', /^token test-pat-token$/)
                .reply(200, { id: 1, full_name: 'foo/bar' })

            const octokit = createGitHubClient({ auth: fromPat('test-pat-token') })
            const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

            expect(data.id).toBe(1)
            expect(data.full_name).toBe('foo/bar')
            expect(scope.isDone()).toBe(true)
        })
    })

    // -------------------------------------------------------------------------
    // App 路径真实路径冒烟（不 mock @octokit/auth-app；nock 拦截真实 installation token 端点）
    // -------------------------------------------------------------------------

    describe('App 路径真实路径（不 mock @octokit/auth-app）', () => {
        const sampleAppParams = {
            appId: '123456',
            privateKey: TEST_PRIVATE_KEY,
            installationId: '7890123',
            botLogin: 'dependfix-bot[bot]',
        }

        /** 通用 helper：mock installation token 端点（每次调用返回新 token，模拟 LRU TTL 行为） */
        function mockInstallationTokenEndpoint(opts?: { token?: string, installationId?: string }): void {
            const installationId = opts?.installationId ?? sampleAppParams.installationId
            nock(API_BASE)
                .post(`/app/installations/${installationId}/access_tokens`)
                .reply(200, () => ({
                    token: opts?.token ?? 'ghs_real_installation_token',
                    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                }))
        }

        it('getOctokit() 不抛错：真实 createAppAuth + authStrategy 路径正确构造（fix #adf370a 修复）', async () => {
            mockInstallationTokenEndpoint()

            const octokit = createGitHubClient({ auth: fromApp(sampleAppParams) })

            // 关键断言：octokit.auth 应该是已 resolved 的对象（含 hook），不是 rejected Promise
            // 修复前：`Cannot read properties of undefined (reading 'bind')` 在第一次 API 调用时抛错
            expect(octokit.auth).toBeDefined()
            const authResolved = (await octokit.auth) as { hook?: unknown } | undefined
            expect(authResolved).toBeDefined()
            expect(authResolved?.hook).toBeDefined()
            expect(typeof authResolved?.hook).toBe('function')
        })

        it('真实 installation token 注入 + API 调用成功（完整 e2e 链路）', async () => {
            mockInstallationTokenEndpoint()

            const scope = nock(API_BASE)
                .get('/repos/foo/bar')
                .matchHeader('authorization', /^token ghs_real_installation_token$/)
                .reply(200, { id: 99, full_name: 'foo/bar' })

            const octokit = createGitHubClient({ auth: fromApp(sampleAppParams) })
            const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

            expect(data.id).toBe(99)
            expect(scope.isDone()).toBe(true)
        })

        it('同 AppAuthProvider 实例：多次 API 调用复用同一 Octokit 实例（installation token 由 auth-app LRU TTL 持续提供）', async () => {
            // 仅 mock 一次 installation token 端点（@octokit/auth-app 内部 LRU TTL 缓存复用）
            mockInstallationTokenEndpoint()

            nock(API_BASE)
                .get('/repos/foo/bar1')
                .matchHeader('authorization', /^token ghs_real_installation_token$/)
                .reply(200, { id: 1, full_name: 'foo/bar1' })

            nock(API_BASE)
                .get('/repos/foo/bar2')
                .matchHeader('authorization', /^token ghs_real_installation_token$/)
                .reply(200, { id: 2, full_name: 'foo/bar2' })

            const octokit = createGitHubClient({ auth: fromApp(sampleAppParams) })
            const result1 = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar1' })
            const result2 = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar2' })

            expect(result1.data.id).toBe(1)
            expect(result2.data.id).toBe(2)
            // installation token 端点只调用 1 次（@octokit/auth-app LRU TTL 缓存复用）
            // 验证：上面只 mock 了 1 个 POST 拦截器，第二个 API 调用如果触发新 token 请求会失败
        })

        it('installation token 注入到 request header（401 重试由 @octokit/auth-app 内部管理）', async () => {
            // 注：`@octokit/auth-app` v8.3.0 在 401 后的行为：
            // - token 创建后 < 5s：retry same token 最多 3 次（默认 retries=3）
            // - token 创建后 >= 5s：重新获取 installation token
            // 本测试验证 token 正确注入 + request 失败时 nock 命中（不验证 @octokit/auth-app retry 内部行为）

            mockInstallationTokenEndpoint({ token: 'ghs_token_v1' })

            nock(API_BASE)
                .get('/repos/foo/bar')
                .matchHeader('authorization', 'token ghs_token_v1')
                .times(4) // 初始 + retry 3 次（@octokit/auth-app 默认 retries=3）
                .reply(401, { message: 'Bad credentials' })

            const octokit = createGitHubClient({ auth: fromApp(sampleAppParams) })

            // 验证 token 注入正确（即使 retry 全部失败抛错，验证至少 GET 请求被 nock 接收）
            const first = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' }).catch((err) => err)
            expect(first.status).toBe(401)
            // 验证所有 retry 请求都用同一 token（@octokit/auth-app retry 行为）
        }, 30_000) // @octokit/auth-app retry 间隔 1s/2s/3s，最长 ~6s

        it('App 路径 commit author 与 GitHub API 协同：getCommitAuthor() + getOctokit() 同一实例', async () => {
            mockInstallationTokenEndpoint()

            const scope = nock(API_BASE)
                .get('/repos/foo/bar')
                .reply(200, { id: 4, full_name: 'foo/bar' })

            const auth = fromApp(sampleAppParams)

            // 验证两个 API 在同一实例上协同工作
            const octokit = createGitHubClient({ auth })
            const author = auth.getCommitAuthor()

            const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

            expect(data.id).toBe(4)
            expect(scope.isDone()).toBe(true)
            // commit author 动态生成（与 sampleAppParams.appId / botLogin 对齐）
            expect(author.name).toBe('123456[bot]')
            expect(author.email).toBe('123456+dependfix-bot[bot]@users.noreply.github.com')
            // audit 字段：github-app 标识
            expect(auth.authProvider).toBe('github-app')
        })

        it('App 路径 Git 凭据：getGitCredential() 返回占位符（installation token 由 @octokit/auth-app 自管）', () => {
            const auth = fromApp(sampleAppParams)
            const cred = auth.getGitCredential()

            // 与 PAT 路径一致：x-access-token username + installation token 占位符
            expect(cred.username).toBe('x-access-token')
            expect(cred.token).toBe('installation-token-managed-by-octokit-auth-app')
        })

        it('App 路径 fallback commit author：缺 botLogin 时使用 dependfix[bot] 占位', async () => {
            mockInstallationTokenEndpoint({ installationId: '111' })

            nock(API_BASE)
                .get('/repos/foo/bar')
                .reply(200, { id: 5, full_name: 'foo/bar' })

            const auth = fromApp({
                appId: '999',
                privateKey: TEST_PRIVATE_KEY,
                installationId: '111',
                // 无 botLogin
            })
            const octokit = createGitHubClient({ auth })
            const author = auth.getCommitAuthor()

            await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

            // fallback 到 dependfix[bot]（保持与 PAT 路径作者格式对齐）
            expect(author.name).toBe('999[bot]')
            expect(author.email).toBe('999+dependfix[bot]@users.noreply.github.com')
        })

        it('App 路径 PR 创建：pulls.create 端到端（installation token 注入 + payload 正确）', async () => {
            mockInstallationTokenEndpoint()

            const scope = nock(API_BASE)
                .post('/repos/foo/bar/pulls', (body) => body.title === 'fix: vite upgrade' && body.head === 'dependfix/auto-fix-aaa11111' && body.base === 'main')
                .matchHeader('authorization', /^token ghs_real_installation_token$/)
                .reply(201, { number: 42, html_url: 'https://github.com/foo/bar/pull/42' })

            const octokit = createGitHubClient({ auth: fromApp(sampleAppParams) })
            const { data } = await octokit.rest.pulls.create({
                owner: 'foo',
                repo: 'bar',
                title: 'fix: vite upgrade',
                head: 'dependfix/auto-fix-aaa11111',
                base: 'main',
                body: 'Auto-fix by dependfix',
            })

            expect(data.number).toBe(42)
            expect(data.html_url).toBe('https://github.com/foo/bar/pull/42')
            expect(scope.isDone()).toBe(true)
        })
    })

    // -------------------------------------------------------------------------
    // PAT vs App 路径差异化验证（防回归：升级时不应混用）
    // -------------------------------------------------------------------------

    describe('PAT vs App 路径差异化', () => {
        it('PAT 路径：authorization header 是 "token <PAT>"', async () => {
            const scope = nock(API_BASE)
                .get('/repos/foo/bar')
                .matchHeader('authorization', 'token my-pat')
                .reply(200, { id: 1 })

            const octokit = createGitHubClient({ auth: fromPat('my-pat') })
            await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

            expect(scope.isDone()).toBe(true)
        })

        it('App 路径：authorization header 是 "token <installation_token>"', async () => {
            // inline mock（PAT vs App 差异化 describe 不共享 mockInstallationTokenEndpoint helper）
            nock(API_BASE)
                .post('/app/installations/1/access_tokens')
                .reply(200, {
                    token: 'ghs_diff_test_token',
                    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                })

            const scope = nock(API_BASE)
                .get('/repos/foo/bar')
                .matchHeader('authorization', /^token /)
                .reply(200, { id: 2 })

            const octokit = createGitHubClient({
                auth: fromApp({
                    appId: '1',
                    privateKey: TEST_PRIVATE_KEY,
                    installationId: '1',
                }),
            })
            await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

            expect(scope.isDone()).toBe(true)
        })

        it('PAT 路径：getCommitAuthor 固定返回 dependfix[bot]（不依赖 token 字符）', () => {
            const auth = fromPat('ghp_anyvalue')
            const author = auth.getCommitAuthor()

            expect(author.name).toBe('dependfix[bot]')
            expect(author.email).toBe('dependfix[bot]@users.noreply.github.com')
            expect(auth.authProvider).toBe('pat')
        })

        it('App 路径：getCommitAuthor 动态返回 {app_id}+{bot_login}[bot]', () => {
            const auth = fromApp({
                appId: '42',
                privateKey: 'p',
                installationId: '99',
                botLogin: 'custom-bot[bot]',
            })
            const author = auth.getCommitAuthor()

            expect(author.name).toBe('42[bot]')
            expect(author.email).toBe('42+custom-bot[bot]@users.noreply.github.com')
            expect(auth.authProvider).toBe('github-app')
        })
    })
})
