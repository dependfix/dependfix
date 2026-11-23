import type { DataSource } from 'typeorm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderLogCollector, toProviderLogRecord, type ProviderLogCollectInput } from './provider-log-collector'
import type { UnifiedBuildSignal } from './types'
import { encryptToken } from '#server/services/credential.service'

/** 构造最小信号（默认成功 check，按需改为失败 provider 信号） */
const makeSignal = (overrides: Partial<UnifiedBuildSignal> = {}): UnifiedBuildSignal => ({
    kind: 'check',
    provider: 'github-actions',
    name: 'Test',
    state: 'success',
    rawState: 'success',
    sourceId: '9001',
    targetUrl: null,
    logUrl: null,
    summary: null,
    observedAt: new Date('2026-11-23T00:00:00Z'),
    ...overrides,
})

const makeInput = (overrides: Partial<ProviderLogCollectInput> = {}): ProviderLogCollectInput => ({
    repository: {
        organizationId: 'org-1',
        vercelProjectId: 'prj_123',
        cloudflareAccountId: null,
        cloudflareWorkerTag: null,
    },
    headSha: 'a'.repeat(40),
    overallStatus: 'failure',
    signals: [makeSignal({ kind: 'deployment', provider: 'vercel', state: 'failure', rawState: 'failure' })],
    ...overrides,
})

const unusedDataSource = {
    getRepository: () => {
        throw new Error('data source must not be touched in this test')
    },
} as unknown as DataSource

const fixedNow = () => new Date('2026-11-23T00:00:00Z')

describe('ProviderLogCollector', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('非失败轮次 → null（零请求）', async () => {
        const fetchProviderLog = vi.fn()
        const collector = new ProviderLogCollector(unusedDataSource, {
            fetchProviderLog,
            loadProviderToken: vi.fn(),
            now: fixedNow,
        })

        await expect(collector.collect(makeInput({ overallStatus: 'success' }))).resolves.toBeNull()
        await expect(collector.collect(makeInput({ overallStatus: 'pending' }))).resolves.toBeNull()
        expect(fetchProviderLog).not.toHaveBeenCalled()
    })

    it('无失败信号 / 失败信号 provider 不受支持 → null（零请求）', async () => {
        const fetchProviderLog = vi.fn()
        const loadProviderToken = vi.fn()
        const collector = new ProviderLogCollector(unusedDataSource, { fetchProviderLog, loadProviderToken, now: fixedNow })

        await expect(collector.collect(makeInput({ signals: [makeSignal()] }))).resolves.toBeNull()
        await expect(collector.collect(makeInput({
            signals: [makeSignal({ provider: 'github-actions', state: 'failure', rawState: 'failure' })],
        }))).resolves.toBeNull()
        expect(fetchProviderLog).not.toHaveBeenCalled()
        expect(loadProviderToken).not.toHaveBeenCalled()
    })

    it('缺少仓库级目标 → null（零请求，且不查凭据）', async () => {
        const fetchProviderLog = vi.fn()
        const loadProviderToken = vi.fn()
        const collector = new ProviderLogCollector(unusedDataSource, { fetchProviderLog, loadProviderToken, now: fixedNow })

        await expect(collector.collect(makeInput({
            repository: { organizationId: 'org-1', vercelProjectId: null, cloudflareAccountId: null, cloudflareWorkerTag: null },
        }))).resolves.toBeNull()
        // Cloudflare 需要 account id 与 worker tag 成对
        await expect(collector.collect(makeInput({
            repository: { organizationId: 'org-1', vercelProjectId: null, cloudflareAccountId: 'acc', cloudflareWorkerTag: null },
            signals: [makeSignal({ provider: 'cloudflare', state: 'failure', rawState: 'failure' })],
        }))).resolves.toBeNull()
        expect(fetchProviderLog).not.toHaveBeenCalled()
        expect(loadProviderToken).not.toHaveBeenCalled()
    })

    it('同组织未配置对应凭据 → null（零请求）', async () => {
        const fetchProviderLog = vi.fn()
        const collector = new ProviderLogCollector(unusedDataSource, {
            fetchProviderLog,
            loadProviderToken: vi.fn().mockResolvedValue(null),
            now: fixedNow,
        })

        await expect(collector.collect(makeInput())).resolves.toBeNull()
        expect(fetchProviderLog).not.toHaveBeenCalled()
    })

    it('可用结果 → 透传 tail / truncated 并附加 fetchedAt；只取第一条可支持的失败信号', async () => {
        const fetchProviderLog = vi.fn().mockResolvedValue({
            available: true,
            provider: 'vercel',
            tail: 'build failed',
            truncated: true,
        })
        const loadProviderToken = vi.fn().mockResolvedValue('vercel-token')
        const collector = new ProviderLogCollector(unusedDataSource, { fetchProviderLog, loadProviderToken, now: fixedNow })

        const result = await collector.collect(makeInput({
            signals: [
                makeSignal({ kind: 'deployment', provider: 'vercel', state: 'failure', rawState: 'failure' }),
                makeSignal({ kind: 'deployment', provider: 'vercel', name: 'second', state: 'failure', rawState: 'failure' }),
            ],
        }))

        expect(fetchProviderLog).toHaveBeenCalledTimes(1)
        expect(fetchProviderLog).toHaveBeenCalledWith({
            provider: 'vercel',
            token: 'vercel-token',
            headSha: 'a'.repeat(40),
            targets: {
                vercelProjectId: 'prj_123',
                cloudflareAccountId: undefined,
                cloudflareWorkerTag: undefined,
            },
        })
        expect(result).toEqual({
            available: true,
            provider: 'vercel',
            tail: 'build failed',
            truncated: true,
            fetchedAt: '2026-11-23T00:00:00.000Z',
        })
    })

    it('401 → 降级为不可用记录（保留 provider / reason / status）', async () => {
        const collector = new ProviderLogCollector(unusedDataSource, {
            fetchProviderLog: vi.fn().mockResolvedValue({
                available: false,
                provider: 'vercel',
                reason: 'unauthorized',
                status: 401,
            }),
            loadProviderToken: vi.fn().mockResolvedValue('vercel-token'),
            now: fixedNow,
        })

        await expect(collector.collect(makeInput())).resolves.toEqual({
            available: false,
            provider: 'vercel',
            reason: 'unauthorized',
            status: 401,
            fetchedAt: '2026-11-23T00:00:00.000Z',
        })
    })

    it('采集函数抛错 → 降级为 http_error，不向调用方抛错', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const collector = new ProviderLogCollector(unusedDataSource, {
            fetchProviderLog: vi.fn().mockRejectedValue(new Error('boom')),
            loadProviderToken: vi.fn().mockResolvedValue('vercel-token'),
            now: fixedNow,
        })

        await expect(collector.collect(makeInput())).resolves.toEqual({
            available: false,
            provider: 'vercel',
            reason: 'http_error',
            fetchedAt: '2026-11-23T00:00:00.000Z',
        })
        expect(warn).toHaveBeenCalled()
    })

    it('默认凭据加载：按组织 + 凭据类型查最新一条并解密', async () => {
        const encryptedToken = encryptToken('vercel-readonly-token', 'test-encryption-key-32-bytes!!')
        const findOne = vi.fn().mockResolvedValue({ id: 'cred-1', type: 'vercel-token', encryptedToken })
        const ds = {
            getRepository: () => ({ findOne }),
        } as unknown as DataSource
        const fetchProviderLog = vi.fn().mockResolvedValue({
            available: true,
            provider: 'vercel',
            tail: 'ok',
            truncated: false,
        })
        const collector = new ProviderLogCollector(ds, { fetchProviderLog, now: fixedNow })

        await collector.collect(makeInput())

        expect(findOne).toHaveBeenCalledWith({
            where: { organizationId: 'org-1', type: 'vercel-token' },
            order: { createdAt: 'DESC' },
        })
        expect(fetchProviderLog).toHaveBeenCalledWith(expect.objectContaining({ token: 'vercel-readonly-token' }))
    })

    it('仓库无组织归属 → 不跨组织取凭据（零请求）', async () => {
        const ds = {
            getRepository: () => {
                throw new Error('must not query credentials without organization')
            },
        } as unknown as DataSource
        const fetchProviderLog = vi.fn()
        const collector = new ProviderLogCollector(ds, { fetchProviderLog, now: fixedNow })

        await expect(collector.collect(makeInput({
            repository: { organizationId: null, vercelProjectId: 'prj_123', cloudflareAccountId: null, cloudflareWorkerTag: null },
        }))).resolves.toBeNull()
        expect(fetchProviderLog).not.toHaveBeenCalled()
    })

    it('默认凭据加载失败（读取异常）→ null，不抛错', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const ds = {
            getRepository: () => ({
                findOne: vi.fn().mockRejectedValue(new Error('db down')),
            }),
        } as unknown as DataSource
        const fetchProviderLog = vi.fn()
        const collector = new ProviderLogCollector(ds, { fetchProviderLog, now: fixedNow })

        await expect(collector.collect(makeInput())).resolves.toBeNull()
        expect(fetchProviderLog).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalled()
    })
})

describe('toProviderLogRecord', () => {
    it('可用结果与不可用结果的字段集合互不串味', () => {
        const now = new Date('2026-11-23T01:02:03Z')
        expect(toProviderLogRecord({ available: true, provider: 'cloudflare', tail: 'x', truncated: false }, now))
            .toEqual({ available: true, provider: 'cloudflare', tail: 'x', truncated: false, fetchedAt: now.toISOString() })
        expect(toProviderLogRecord({ available: false, provider: 'cloudflare', reason: 'timeout' }, now))
            .toEqual({ available: false, provider: 'cloudflare', reason: 'timeout', fetchedAt: now.toISOString() })
    })
})
