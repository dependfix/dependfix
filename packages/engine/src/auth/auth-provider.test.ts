import { describe, expect, it } from 'vitest'
import { Octokit } from '@octokit/rest'
import {
    type AuthProvider,
    PAT_COMMIT_AUTHOR,
    PAT_GIT_USERNAME,
} from './auth-provider'
import { fromPat } from './pat-provider'

/**
 * AuthProvider 接口契约测试。
 *
 * 覆盖：
 * - fromPat 工厂函数返回 AuthProvider 实例
 * - authProvider 字段为 discriminated union 标识（'pat'）
 * - getOctokit() 返回 Octokit 实例
 * - getGitCredential() 返回 username + token
 * - getCommitAuthor() 返回 PAT 路径固定 author
 *
 * PatAuthProvider 行为详见 pat-provider.test.ts。
 */
describe('AuthProvider interface contract', () => {
    describe('fromPat factory', () => {
        it('returns an AuthProvider instance', () => {
            const auth = fromPat('test-token')
            expect(auth).toBeDefined()
            expect(typeof auth.getOctokit).toBe('function')
            expect(typeof auth.getGitCredential).toBe('function')
            expect(typeof auth.getCommitAuthor).toBe('function')
        })

        it('sets authProvider to "pat" discriminated union identifier', () => {
            const auth = fromPat('test-token')
            expect(auth.authProvider).toBe('pat')
        })

        it('exposes PAT_COMMIT_AUTHOR constant for PAT path (固定 author)', () => {
            expect(PAT_COMMIT_AUTHOR).toEqual({
                name: 'dependfix[bot]',
                email: 'dependfix[bot]@users.noreply.github.com',
            })
        })

        it('exposes PAT_GIT_USERNAME constant for PAT path (固定 username)', () => {
            expect(PAT_GIT_USERNAME).toBe('x-access-token')
        })
    })

    describe('AuthProvider interface shape (TypeScript type guard)', () => {
        it('satisfies AuthProvider shape for fromPat result', () => {
            const auth: AuthProvider = fromPat('test-token')

            // 调用所有接口方法不抛 TypeError
            expect(() => auth.getOctokit()).not.toThrow()
            expect(() => auth.getGitCredential()).not.toThrow()
            expect(() => auth.getCommitAuthor()).not.toThrow()
        })

        it('getOctokit returns Octokit instance', () => {
            const auth = fromPat('test-token')
            const octokit = auth.getOctokit()

            expect(octokit).toBeInstanceOf(Octokit)
        })

        it('getGitCredential returns username + token (username = x-access-token)', () => {
            const auth = fromPat('ghp_test_xxxx')
            const cred = auth.getGitCredential()

            expect(cred.username).toBe(PAT_GIT_USERNAME)
            expect(cred.token).toBe('ghp_test_xxxx')
        })

        it('getCommitAuthor returns dependfix[bot] for PAT path', () => {
            const auth = fromPat('test-token')
            const author = auth.getCommitAuthor()

            expect(author.name).toBe('dependfix[bot]')
            expect(author.email).toBe('dependfix[bot]@users.noreply.github.com')
        })
    })

    describe('retry options passthrough', () => {
        it('accepts retry options without throwing', () => {
            expect(() => fromPat('test-token', { retry: { maxRetries: 0 } })).not.toThrow()
            expect(() => fromPat('test-token', { retry: { maxRetries: 3, baseDelayMs: 100 } })).not.toThrow()
            expect(() => fromPat('test-token', { retry: { maxRetries: 5, baseDelayMs: 200, maxBackoffMs: 60_000 } })).not.toThrow()
        })
    })
})
