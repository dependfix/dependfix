import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { extractUrlsFromOutput, startNetworkAudit, type NetworkAudit } from './network-audit'

// ---------------------------------------------------------------------------
// extractUrlsFromOutput
// ---------------------------------------------------------------------------

describe('extractUrlsFromOutput', () => {
    it('extracts http(s) urls from output', () => {
        const output = 'Downloading https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz (1.1 MB)\nDone'
        const urls = extractUrlsFromOutput(output)

        expect(urls).toEqual(['https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz'])
    })

    it('deduplicates repeated urls', () => {
        const output = 'https://a.example/x\nhttps://a.example/x\nhttps://b.example/y'
        expect(extractUrlsFromOutput(output)).toEqual(['https://a.example/x', 'https://b.example/y'])
    })

    it('trims trailing punctuation', () => {
        expect(extractUrlsFromOutput('see https://a.example/x.')).toEqual(['https://a.example/x'])
        expect(extractUrlsFromOutput('(https://a.example/x)')).toEqual(['https://a.example/x'])
    })

    it('caps extracted urls per command', () => {
        const output = Array.from({ length: 150 }, (_, i) => `https://p${i}.example.com/x`).join('\n')
        expect(extractUrlsFromOutput(output)).toHaveLength(100)
    })

    it('returns empty array for no urls or empty output', () => {
        expect(extractUrlsFromOutput('')).toEqual([])
        expect(extractUrlsFromOutput('no urls here')).toEqual([])
        expect(extractUrlsFromOutput(undefined as unknown as string)).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// startNetworkAudit（代理记录）
// ---------------------------------------------------------------------------

describe('startNetworkAudit', () => {
    let audit: NetworkAudit | undefined
    let upstream: ReturnType<typeof createServer> | undefined

    afterEach(async () => {
        if (audit) {
            await audit.stop().catch(() => { /* 幂等 */ })
        }
        if (upstream) {
            await new Promise((resolve) => upstream?.close(resolve))
        }
    })

    it('records CONNECT tunnel targets (https via proxy)', async () => {
        audit = await startNetworkAudit()

        // 上游：本地 TCP 服务（模拟 CONNECT 隧道目标）
        const net = await import('node:net')
        const upstreamServer = net.createServer((socket) => socket.end())
        await new Promise<void>((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve))
        upstream = upstreamServer as never
        const upstreamPort = (upstreamServer.address() as { port: number }).port

        // 用 node:http CONNECT 方法直接打代理（模拟 curl --proxytunnel）
        const http = await import('node:http')
        await new Promise<void>((resolve) => {
            const req = http.request({
                host: '127.0.0.1',
                port: new URL(audit!.proxyUrl!).port,
                method: 'CONNECT',
                path: `127.0.0.1:${upstreamPort}`,
            })
            req.on('connect', (res2, socket) => {
                socket.destroy()
                resolve()
            })
            req.on('error', () => resolve())
            req.end()
        })

        const targets = audit.entries
            .filter((e) => e.source === 'proxy' && e.method === 'CONNECT')
            .map((e) => e.target)
        expect(targets).toContain(`127.0.0.1:${upstreamPort}`)
    })

    it('records plain http requests and forwards them', async () => {
        audit = await startNetworkAudit()

        // 上游：本地 http 服务
        upstream = createServer((req, res) => {
            res.writeHead(200, { 'content-type': 'text/plain' })
            res.end('upstream-ok')
        })
        await new Promise<void>((resolve) => upstream!.listen(0, '127.0.0.1', resolve))
        const upstreamPort = (upstream.address() as { port: number }).port

        // 明文 HTTP 经代理：request 到代理（host 头指向上游）
        const http = await import('node:http')
        const body = await new Promise<string>((resolve, reject) => {
            const req = http.request({
                host: '127.0.0.1',
                port: new URL(audit!.proxyUrl!).port,
                method: 'GET',
                path: '/hello',
                headers: { host: `127.0.0.1:${upstreamPort}` },
            }, (res) => {
                let data = ''
                res.on('data', (chunk) => {
                    data += chunk
                })
                res.on('end', () => resolve(data))
            })
            req.on('error', reject)
            req.end()
        })

        expect(body).toBe('upstream-ok')
        expect(audit.entries).toContainEqual(expect.objectContaining({
            source: 'proxy',
            method: 'GET',
            target: `127.0.0.1:${upstreamPort}/hello`,
        }))
    })

    it('returns 502 when upstream forward fails', async () => {
        audit = await startNetworkAudit()

        const http = await import('node:http')
        const status = await new Promise<number>((resolve) => {
            const req = http.request({
                host: '127.0.0.1',
                port: new URL(audit!.proxyUrl!).port,
                method: 'GET',
                path: '/x',
                headers: { host: '127.0.0.1:1' }, // 无服务端口
            }, (res) => {
                resolve(res.statusCode ?? 0)
                res.resume()
            })
            req.on('error', () => resolve(0))
            req.end()
        })

        expect(status).toBe(502)
        // 失败转发不产生额外记录（无数据外联）
        expect(audit.entries.some((e) => e.target.endsWith('/x'))).toBe(true)
    })
})
