import { describe, expect, it, vi, beforeEach } from 'vitest'

// 使用 vi.hoisted 确保 mock 变量在 vi.mock hoisting 之前初始化
const { createAppAuthMock, octokitInstanceMock, FakeOctokit } = vi.hoisted(() => {
    const innerCreateAppAuthMock = vi.fn()
    const innerOctokitInstanceMock = { hook: { wrap: vi.fn() }, rest: {} }

    // 注意：vi.fn + mockReturnValue 不能与 `new` 配合使用；需用 class 模拟
    class InnerFakeOctokit {
        constructor() {
            return innerOctokitInstanceMock as unknown as InnerFakeOctokit
        }
    }

    return {
        createAppAuthMock: innerCreateAppAuthMock,
        octokitInstanceMock: innerOctokitInstanceMock,
        FakeOctokit: InnerFakeOctokit,
    }
})

// Mock @octokit/auth-app 避免真实 GitHub API 调用
vi.mock('@octokit/auth-app', () => ({
    createAppAuth: (...args: unknown[]) => createAppAuthMock(...args),
}))

// Mock @octokit/rest 避免真实网络初始化
vi.mock('@octokit/rest', () => ({
    Octokit: FakeOctokit,
}))

import { Octokit } from '@octokit/rest'
import { AppAuthProvider, fromApp } from './app-provider'

// 注：Octokit import 在 vi.mock 之后；TypeScript 仍可识别类型（运行时被 mock 替换）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _OctokitType: typeof Octokit = Octokit // 保留类型导入用于类型注解

/**
 * AppAuthProvider 单测（M18.1 commit 4 主实施）。
 *
 * 覆盖：
 * - 工厂函数 fromApp 返回 AppAuthProvider 实例
 * - authProvider 字段标识为 'github-app'（discriminated union）
 * - getOctokit 返回 Octokit 实例（首次 + 缓存复用）
 * - getGitCredential 返回 username='x-access-token' + 占位 token
 * - getCommitAuthor 按 GitHub App 协议动态生成（{app_id}+{bot_login}[bot]）
 * - 依赖注入：createAppAuthentication 接受正确参数
 */
describe('AppAuthProvider', () => {
    const sampleParams = {
        appId: '123456',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
        installationId: '7890123',
        botLogin: 'dependfix-bot[bot]',
    }

    beforeEach(() => {
        createAppAuthMock.mockReset()
        createAppAuthMock.mockReturnValue({}) // 占位 auth strategy
    })

    describe('factory fromApp', () => {
        it('returns an AppAuthProvider instance', () => {
            const auth = fromApp(sampleParams)
            expect(auth).toBeInstanceOf(AppAuthProvider)
            expect(auth.authProvider).toBe('github-app')
        })
    })

    describe('getOctokit', () => {
        it('returns Octokit instance (via @octokit/auth-app strategy)', () => {
            const auth = new AppAuthProvider(sampleParams)
            const octokit = auth.getOctokit()

            // FakeOctokit 构造函数返回 octokitInstanceMock（mock 注入）
            expect(octokit).toBe(octokitInstanceMock)
        })

        it('passes correct params to createAppAuth', () => {
            const auth = new AppAuthProvider(sampleParams)
            auth.getOctokit()

            expect(createAppAuthMock).toHaveBeenCalledWith({
                appId: sampleParams.appId,
                privateKey: sampleParams.privateKey,
                installationId: sampleParams.installationId,
            })
        })

        it('caches the Octokit instance across calls (同一引用)', () => {
            const auth = new AppAuthProvider(sampleParams)
            const octokit1 = auth.getOctokit()
            const octokit2 = auth.getOctokit()

            expect(octokit1).toBe(octokit2)
            // createAppAuth 只应被调用一次
            expect(createAppAuthMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('getGitCredential', () => {
        it('returns username=x-access-token + token=installation-token 占位符', () => {
            const auth = new AppAuthProvider(sampleParams)
            const cred = auth.getGitCredential()

            expect(cred.username).toBe('x-access-token')
            // installation token 由 @octokit/auth-app 内部管理，AppAuthProvider 无法直接获取
            expect(cred.token).toBe('installation-token-managed-by-octokit-auth-app')
        })

        it('Git 凭据 username 与 PAT 路径一致（保持下游 git push 兼容性）', () => {
            const auth = new AppAuthProvider(sampleParams)
            const cred = auth.getGitCredential()

            // x-access-token 是 GitHub Basic Auth 标准 username；PAT 与 App 路径都用此 username
            // token 内容不同（PAT vs installation token）但调用方无需关心
            expect(cred.username).toBe('x-access-token')
        })
    })

    describe('getCommitAuthor (GitHub App 协议动态生成)', () => {
        it('returns {app_id}+{bot_login}[bot]@users.noreply.github.com (动态格式)', () => {
            const auth = new AppAuthProvider(sampleParams)
            const author = auth.getCommitAuthor()

            expect(author.name).toBe('123456[bot]')
            expect(author.email).toBe('123456+dependfix-bot[bot]@users.noreply.github.com')
        })

        it('falls back to dependfix[bot] when botLogin is not provided', () => {
            const paramsWithoutBotLogin = {
                appId: '999',
                privateKey: '...',
                installationId: '111',
            }
            const auth = new AppAuthProvider(paramsWithoutBotLogin)
            const author = auth.getCommitAuthor()

            expect(author.name).toBe('999[bot]')
            expect(author.email).toBe('999+dependfix[bot]@users.noreply.github.com')
        })

        it('returns fresh object on each call (no shared reference)', () => {
            const auth = new AppAuthProvider(sampleParams)
            const author1 = auth.getCommitAuthor()
            const author2 = auth.getCommitAuthor()

            expect(author1).not.toBe(author2)
            expect(author1).toEqual(author2)
        })

        it('commit author 格式与 GitHub App 协议一致（M18.0 §4.2 AuthProvider 接口设计）', () => {
            const auth = new AppAuthProvider({ ...sampleParams, appId: '42', botLogin: 'my-bot[bot]' })
            const author = auth.getCommitAuthor()

            // GitHub noreply email 协议格式：{app_id}+{bot_login}@users.noreply.github.com
            expect(author.email).toMatch(/^\d+\+.+@users\.noreply\.github\.com$/)
            expect(author.name).toMatch(/^\d+\[bot\]$/)
        })
    })

    describe('discriminated union 标识', () => {
        it('authProvider 字段为 "github-app"（与 PAT 路径区分）', () => {
            const auth = new AppAuthProvider(sampleParams)
            expect(auth.authProvider).toBe('github-app')
        })

        it('audit field 使用：与 PAT 路径的 "pat" 标识区分', () => {
            // 验证 AppAuthProvider 与 PatAuthProvider 的 authProvider 字段值不同
            // 这是 AuthProvider 接口 discriminated union 的核心约束
            const appAuth = new AppAuthProvider(sampleParams)
            // PatAuthProvider 不在本测试中 import（避免额外依赖）；通过字符串字面量验证
            expect(appAuth.authProvider).not.toBe('pat')
        })
    })
})
