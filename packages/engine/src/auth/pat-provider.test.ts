import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Octokit } from '@octokit/rest'
import { PatAuthProvider, fromPat } from './pat-provider'

// Mock createGitHubClient 以验证 retry 选项透传（避免依赖 client.ts 的 applyRetryPolicy 内部实现）
const mockCreateGitHubClient = vi.fn()
vi.mock('../github/client', () => ({
    createGitHubClient: (...args: unknown[]) => mockCreateGitHubClient(...args),
}))

/**
 * PatAuthProvider 单测。
 *
 * 覆盖：
 * - 工厂函数 fromPat 返回 PatAuthProvider 实例
 * - authProvider 字段标识
 * - getOctokit 返回 Octokit 实例（首次 + 缓存复用）
 * - getGitCredential 返回 username='x-access-token' + token=输入值
 * - getCommitAuthor 返回 PAT 路径固定 author
 * - retry 选项透传（maxRetries=0 不应用 retry hook）
 */
describe('PatAuthProvider', () => {
    describe('factory fromPat', () => {
        it('returns a PatAuthProvider instance', () => {
            const auth = fromPat('ghp_test')
            expect(auth).toBeInstanceOf(PatAuthProvider)
            expect(auth.authProvider).toBe('pat')
        })

        it('accepts options parameter (retry config)', () => {
            const auth = fromPat('ghp_test', { retry: { maxRetries: 0 } })
            expect(auth).toBeInstanceOf(PatAuthProvider)
        })
    })

    describe('getOctokit', () => {
        beforeEach(() => {
            mockCreateGitHubClient.mockReset()
            mockCreateGitHubClient.mockReturnValue(new Octokit({ auth: 'token' }))
        })

        it('returns Octokit instance', () => {
            const auth = new PatAuthProvider('ghp_test')
            const octokit = auth.getOctokit()
            expect(octokit).toBeInstanceOf(Octokit)
        })

        it('caches the Octokit instance across calls (同一引用)', () => {
            const auth = new PatAuthProvider('ghp_test')
            const octokit1 = auth.getOctokit()
            const octokit2 = auth.getOctokit()

            expect(octokit1).toBe(octokit2)
            // createGitHubClient 只应被调用一次（缓存命中）
            expect(mockCreateGitHubClient).toHaveBeenCalledTimes(1)
        })

        it('delegates to createGitHubClient with token + retry 选项透传', () => {
            const auth = new PatAuthProvider('ghp_test', {
                retry: { maxRetries: 5, baseDelayMs: 100, maxBackoffMs: 60_000 },
            })
            auth.getOctokit()

            expect(mockCreateGitHubClient).toHaveBeenCalledWith({
                token: 'ghp_test',
                retry: { maxRetries: 5, baseDelayMs: 100, maxBackoffMs: 60_000 },
            })
        })

        it('默认不传 retry（createGitHubClient 内部默认 maxRetries=3）', () => {
            const auth = new PatAuthProvider('ghp_test')
            auth.getOctokit()

            // PatAuthProvider 默认透传 undefined；createGitHubClient 内部走 options.retry?.maxRetries ?? 3 默认值
            // 测试 PatAuthProvider 委托行为而非 createGitHubClient 默认值（后者由 client.test.ts 覆盖）
            expect(mockCreateGitHubClient).toHaveBeenCalledWith({
                token: 'ghp_test',
                retry: undefined,
            })
        })

        it('maxRetries=0 透传（client.ts:applyRetryPolicy 据此跳过 hook 注册）', () => {
            const auth = new PatAuthProvider('ghp_test', { retry: { maxRetries: 0 } })
            auth.getOctokit()

            expect(mockCreateGitHubClient).toHaveBeenCalledWith({
                token: 'ghp_test',
                retry: { maxRetries: 0 },
            })
        })
    })

    describe('getGitCredential', () => {
        it('returns username=x-access-token + token=input', () => {
            const auth = new PatAuthProvider('ghp_my_token')
            const cred = auth.getGitCredential()

            expect(cred).toEqual({
                username: 'x-access-token',
                token: 'ghp_my_token',
            })
        })

        it('returns fresh object on each call (no shared reference)', () => {
            const auth = new PatAuthProvider('ghp_my_token')
            const cred1 = auth.getGitCredential()
            const cred2 = auth.getGitCredential()

            // 不应是同一引用（避免调用方意外共享 token）
            expect(cred1).not.toBe(cred2)
            expect(cred1).toEqual(cred2)
        })
    })

    describe('getCommitAuthor', () => {
        it('returns dependfix[bot] for PAT path', () => {
            const auth = new PatAuthProvider('ghp_test')
            const author = auth.getCommitAuthor()

            expect(author).toEqual({
                name: 'dependfix[bot]',
                email: 'dependfix[bot]@users.noreply.github.com',
            })
        })

        it('returns a fresh object on each call (no shared reference)', () => {
            const auth = new PatAuthProvider('ghp_test')
            const author1 = auth.getCommitAuthor()
            const author2 = auth.getCommitAuthor()

            // 返回新对象避免 PAT_COMMIT_AUTHOR 共享引用被修改
            expect(author1).not.toBe(author2)
            expect(author1).toEqual(author2)
        })
    })

    describe('PAT 路径用户行为零变化承诺 (M18.0 §5.1 兼容性)', () => {
        it('hardcoded dependfix[bot]@users.noreply.github.com（保持现有 PR commit 归属）', () => {
            const auth = new PatAuthProvider('any-token')
            const author = auth.getCommitAuthor()

            // 与 pr-creator.ts:60-61 硬编码格式一致（保证 PAT 路径 commit 行为零变化）
            expect(author.name).toBe('dependfix[bot]')
            expect(author.email).toBe('dependfix[bot]@users.noreply.github.com')
        })

        it('uses x-access-token for git push (Basic Auth) 与原行为一致', () => {
            const auth = new PatAuthProvider('any-token')
            const cred = auth.getGitCredential()

            // 与原 createGitHubClient({ token }).auth 行为一致（Octokit 内部用 Basic Auth）
            expect(cred.username).toBe('x-access-token')
        })
    })
})
