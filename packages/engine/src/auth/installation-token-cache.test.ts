import { describe, expect, it } from 'vitest'
import { InstallationTokenCache } from './installation-token-cache'

/**
 * InstallationTokenCache 单测（M18.1 commit 4 主实施）。
 *
 * 当前实现：占位 + 监控 API（依赖 @octokit/auth-app 内置 59 分钟 LRU TTL 缓存）。
 *
 * 覆盖：
 * - 构造函数接受 params + ttlMs 选项
 * - 默认 TTL = 59 分钟（与 @octokit/auth-app 一致）
 * - getOrRefresh 返回占位字符串（永不抛错）
 * - clear 是 no-op 占位
 * - getCacheKey 静态方法返回基于 installationId 的稳定 key
 */
describe('InstallationTokenCache', () => {
    const sampleParams = {
        appId: '123',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
        installationId: '456',
        botLogin: 'my-bot[bot]',
    }

    describe('constructor', () => {
        it('accepts FromAppParams without options', () => {
            const cache = new InstallationTokenCache(sampleParams)
            expect(cache.getTtlMs()).toBe(59 * 60 * 1000) // 默认 59 分钟
        })

        it('accepts custom ttlMs option', () => {
            const cache = new InstallationTokenCache(sampleParams, { ttlMs: 30 * 60 * 1000 })
            expect(cache.getTtlMs()).toBe(30 * 60 * 1000)
        })

        it('accepts refreshThresholdMs option (保留用于未来扩展)', () => {
            // 当前实现不直接使用 refreshThresholdMs（@octokit/auth-app 内部管理）
            // 但构造不应抛错
            expect(() => new InstallationTokenCache(sampleParams, {
                ttlMs: 30 * 60 * 1000,
                refreshThresholdMs: 5 * 60 * 1000,
            })).not.toThrow()
        })
    })

    describe('getOrRefresh (占位实现)', () => {
        it('returns installation-token 占位字符串', async () => {
            const cache = new InstallationTokenCache(sampleParams)
            const token = await cache.getOrRefresh()

            expect(token).toBe('installation-token-managed-by-octokit-auth-app')
        })

        it('never throws (占位实现保证调用方安全)', async () => {
            const cache = new InstallationTokenCache({ appId: '', privateKey: '', installationId: '' })
            await expect(cache.getOrRefresh()).resolves.toBeDefined()
        })
    })

    describe('clear (no-op 占位)', () => {
        it('does not throw', () => {
            const cache = new InstallationTokenCache(sampleParams)
            expect(() => cache.clear()).not.toThrow()
        })
    })

    describe('getCacheKey (静态方法)', () => {
        it('returns stable cache key based on installationId', () => {
            const key = InstallationTokenCache.getCacheKey(sampleParams)
            expect(key).toBe('installation:456')
        })

        it('returns different keys for different installationIds', () => {
            const key1 = InstallationTokenCache.getCacheKey({ ...sampleParams, installationId: '111' })
            const key2 = InstallationTokenCache.getCacheKey({ ...sampleParams, installationId: '222' })

            expect(key1).not.toBe(key2)
            expect(key1).toBe('installation:111')
            expect(key2).toBe('installation:222')
        })

        it('ignores other fields (appId / privateKey / botLogin)', () => {
            // cache key 仅基于 installationId；同一 installation 不同 app 不应串缓存
            const key1 = InstallationTokenCache.getCacheKey({ appId: '1', privateKey: 'p1', installationId: '100', botLogin: 'a' })
            const key2 = InstallationTokenCache.getCacheKey({ appId: '2', privateKey: 'p2', installationId: '100', botLogin: 'b' })

            expect(key1).toBe(key2) // 同一 installationId = 同一 key
        })
    })

    describe('M18.1 commit 4 集成设计契约 (与 @octokit/auth-app 协同)', () => {
        it('默认 TTL = 59 分钟 = GitHub installation token 60 分钟有效期 - 1 分钟缓冲', () => {
            const cache = new InstallationTokenCache(sampleParams)
            const ttlMs = cache.getTtlMs()
            const sixtyMinutesMs = 60 * 60 * 1000

            // 确保默认 TTL 比 GitHub 有效期短至少 1 分钟
            expect(sixtyMinutesMs - ttlMs).toBeGreaterThanOrEqual(60 * 1000)
        })
    })
})
