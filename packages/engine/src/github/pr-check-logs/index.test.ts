import { describe, expect, it, vi } from 'vitest'
import {
    PROVIDER_LOG_MAX_BYTES,
    fetchProviderLog,
    redactProviderLog,
    resolveProviderLogProvider,
    tailByBytes,
    type ProviderLogFetch,
    type ProviderLogRequest,
} from './index'

/**
 * Layer 5 契约与 adapter 单测（无网络：注入 fetch stub）。
 *
 * 覆盖 AC1（无 token / 无目标 → 零请求）、AC2（尾部 ≤ 8 KB + 真实生成值脱敏）、
 * AC3（401 / 429 / 超时降级不抛错）。
 */
const TOKEN = 'vercel_live_AbCdEfGhIjKlMnOpQrStUvWx'
const HEAD_SHA = 'abcdef0123456789abcdef0123456789abcdef01'

const baseRequest = (overrides: Partial<ProviderLogRequest> = {}): ProviderLogRequest => ({
    provider: 'vercel',
    token: TOKEN,
    headSha: HEAD_SHA,
    targets: { vercelProjectId: 'prj_123' },
    ...overrides,
})

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** 按调用顺序返回预置响应的 fetch stub */
const queueFetch = (...responses: Array<Response | Error>): ProviderLogFetch => {
    let index = 0
    return vi.fn(async () => {
        const next = responses[index++]
        if (next instanceof Error) {
            throw next
        }
        if (!next) {
            throw new Error('unexpected fetch call')
        }
        return next
    })
}

describe('provider 归一化与契约', () => {
    it('归一化 vercel / cloudflare（去 bot 后缀与安装号前缀）', () => {
        expect(resolveProviderLogProvider('vercel')).toBe('vercel')
        expect(resolveProviderLogProvider('Vercel[bot]')).toBe('vercel')
        expect(resolveProviderLogProvider('12345+vercel[bot]')).toBe('vercel')
        expect(resolveProviderLogProvider('Cloudflare')).toBe('cloudflare')
        expect(resolveProviderLogProvider('cloudflare-workers-and-pages')).toBe('cloudflare')
        expect(resolveProviderLogProvider('github-actions')).toBeNull()
    })

    it('headSha 过短 / maxBytes 越权 → invalid_request（不误报 token_missing）', async () => {
        const fetchSpy = vi.fn()
        const shortSha = await fetchProviderLog(baseRequest({ headSha: 'abc' }), { fetch: fetchSpy })
        expect(shortSha).toMatchObject({ available: false, reason: 'invalid_request' })
        const oversized = await fetchProviderLog(baseRequest({ maxBytes: 64 * 1024 }), { fetch: fetchSpy })
        expect(oversized).toMatchObject({ available: false, reason: 'invalid_request' })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('不支持的 provider / 缺 token / 缺目标 → 零请求降级', async () => {
        const fetchSpy = vi.fn()
        const unsupported = await fetchProviderLog(baseRequest({ provider: 'github-actions' }), { fetch: fetchSpy })
        expect(unsupported).toMatchObject({ available: false, reason: 'unsupported_provider' })

        const missingToken = await fetchProviderLog(baseRequest({ token: '' }), { fetch: fetchSpy })
        expect(missingToken).toMatchObject({ available: false, reason: 'token_missing' })

        const missingTarget = await fetchProviderLog(baseRequest({ targets: {} }), { fetch: fetchSpy })
        expect(missingTarget).toMatchObject({ available: false, provider: 'vercel', reason: 'unsupported_target' })

        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe('脱敏与截尾', () => {
    const generated = [
        'token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
        'api dfk_abcdefghijklmnopqrstuvwxyz012345',
        'Authorization: Bearer sk-live-0123456789abcdef',
        'postgres://user:super-secret@db.example.com:5432/app',
        'https://user:p@ssw0rd@db.example.com/x',
        'Cookie: session=abcdef1234567890',
        `echo ${TOKEN}`,
    ].join('\n')

    it('真实生成值取样全部脱敏（含调用方 token 原文）', () => {
        const redacted = redactProviderLog(generated, TOKEN)
        expect(redacted).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345')
        expect(redacted).not.toContain('dfk_abcdefghijklmnopqrstuvwxyz012345')
        expect(redacted).not.toContain('sk-live-0123456789abcdef')
        expect(redacted).not.toContain('super-secret')
        expect(redacted).not.toContain('ssw0rd')
        expect(redacted).not.toContain('abcdef1234567890')
        expect(redacted).not.toContain(TOKEN)
    })

    it('按 UTF-8 字节截尾且不切裂多字节字符', () => {
        const text = `${'前'.repeat(3000)}尾部标记`
        const { tail, truncated } = tailByBytes(text, 100)
        expect(truncated).toBe(true)
        expect(Buffer.byteLength(tail, 'utf8')).toBeLessThanOrEqual(100)
        expect(tail).toContain('尾部标记')
        expect(tail.startsWith('\uFFFD')).toBe(false)
    })
})

describe('Vercel adapter', () => {
    it('成功：按 projectId + sha 定位部署并合并 events 文本，尾部脱敏且 ≤ 上限', async () => {
        const lines = Array.from({ length: 400 }, (_, i) => `line ${i} ${'x'.repeat(40)}`)
        const fetchImpl = queueFetch(
            jsonResponse({ deployments: [{ uid: 'dpl_123' }] }),
            jsonResponse(lines.map((text) => ({ text }))),
        )
        const result = await fetchProviderLog(baseRequest(), { fetch: fetchImpl })
        expect(result.available).toBe(true)
        if (result.available) {
            expect(result.provider).toBe('vercel')
            expect(result.truncated).toBe(true)
            expect(Buffer.byteLength(result.tail, 'utf8')).toBeLessThanOrEqual(PROVIDER_LOG_MAX_BYTES)
            expect(fetchImpl).toHaveBeenCalledTimes(2)
        }
    })

    it('401 / 429 → unauthorized / rate_limited（不抛错）', async () => {
        const unauthorized = await fetchProviderLog(baseRequest(), { fetch: queueFetch(jsonResponse({}, 401)) })
        expect(unauthorized).toMatchObject({ available: false, reason: 'unauthorized', status: 401 })

        const limited = await fetchProviderLog(baseRequest(), { fetch: queueFetch(jsonResponse({}, 429)) })
        expect(limited).toMatchObject({ available: false, reason: 'rate_limited', status: 429 })
    })

    it('超时 → timeout（AbortError / TimeoutError 降级）', async () => {
        const timeoutError = new Error('The operation was aborted due to timeout')
        timeoutError.name = 'TimeoutError'
        const result = await fetchProviderLog(baseRequest(), { fetch: queueFetch(timeoutError) })
        expect(result).toMatchObject({ available: false, reason: 'timeout' })
    })

    it('部署列表为空 → not_found', async () => {
        const result = await fetchProviderLog(baseRequest(), { fetch: queueFetch(jsonResponse({ deployments: [] })) })
        expect(result).toMatchObject({ available: false, reason: 'not_found' })
    })
})

describe('Cloudflare adapter', () => {
    const cfRequest = baseRequest({
        provider: 'cloudflare',
        targets: { cloudflareAccountId: 'acct_1', cloudflareWorkerTag: 'my-worker' },
    })

    it('成功：按 commit hash 匹配构建并取日志', async () => {
        const fetchImpl = queueFetch(
            jsonResponse({
                result: [
                    { build_uuid: 'build-old', build_trigger_metadata: { commit_hash: 'ffffffff' } },
                    { build_uuid: 'build-1', build_trigger_metadata: { commit_hash: HEAD_SHA } },
                ],
            }),
            jsonResponse({ result: { lines: [['t1', 'build start'], ['t2', 'compiled ok']] } }),
        )
        const result = await fetchProviderLog(cfRequest, { fetch: fetchImpl })
        expect(result.available).toBe(true)
        if (result.available) {
            expect(result.tail).toContain('compiled ok')
        }
    })

    it('日志分页：跟随 cursor 合并多页（上限 3 次请求）', async () => {
        const fetchImpl = queueFetch(
            jsonResponse({ result: [{ build_uuid: 'build-1', build_trigger_metadata: { commit_hash: HEAD_SHA } }] }),
            jsonResponse({ result: { lines: [['t1', 'first page']], cursor: 'c1', truncated: true } }),
            jsonResponse({ result: { lines: [['t2', 'second page']] } }),
        )
        const result = await fetchProviderLog(cfRequest, { fetch: fetchImpl })
        expect(result.available).toBe(true)
        if (result.available) {
            expect(result.tail).toContain('first page')
            expect(result.tail).toContain('second page')
        }
        expect(fetchImpl).toHaveBeenCalledTimes(3)
    })

    it('无匹配构建 → not_found（不拿最新构建冒充）', async () => {
        const fetchImpl = queueFetch(jsonResponse({ result: [{ build_uuid: 'build-2', build_trigger_metadata: { commit_hash: 'deadbeef' } }] }))
        const result = await fetchProviderLog(cfRequest, { fetch: fetchImpl })
        expect(result).toMatchObject({ available: false, reason: 'not_found' })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('缺 account / worker tag → unsupported_target（零请求）', async () => {
        const fetchSpy = vi.fn()
        const result = await fetchProviderLog(baseRequest({ provider: 'cloudflare', targets: { cloudflareAccountId: 'acct_1' } }), { fetch: fetchSpy })
        expect(result).toMatchObject({ available: false, reason: 'unsupported_target' })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('日志响应非法 → unsupported_response', async () => {
        const fetchImpl = queueFetch(
            jsonResponse({ result: [{ build_uuid: 'build-1', build_trigger_metadata: { commit_hash: HEAD_SHA } }] }),
            jsonResponse({ result: { unexpected: true } }),
        )
        const result = await fetchProviderLog(cfRequest, { fetch: fetchImpl })
        expect(result).toMatchObject({ available: false, reason: 'unsupported_response' })
    })
})
