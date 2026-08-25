import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
    DEFAULT_ALLOWED_DOMAINS,
    extractHostname,
    extractUrlsFromOutput,
    isDomainAllowed,
    readAllowedDomains,
    redactUrlForReport,
    startNetworkAudit,
    type NetworkAudit,
} from './network-audit'

// 集成测试前置：真实 curl 可用性探测（不可用则跳过真实进程用例）
const hasCurl = (() => {
    try {
        const res = spawnSync('curl', ['--version'], { stdio: 'ignore' })
        return res.status === 0
    } catch {
        return false
    }
})()

// ---------------------------------------------------------------------------
// isDomainAllowed（白名单判定规则）
// ---------------------------------------------------------------------------

describe('isDomainAllowed', () => {
    it('matches exact domain', () => {
        expect(isDomainAllowed('registry.npmjs.org', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('github.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('api.github.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        // rolldown.rs = vite 6/7 Rust 实现官方文档站；vite 跨 major 升级 verification
        // 命令输出会出现该 URL，verification-runner 提取后需放行避免误判 network_violation
        expect(isDomainAllowed('rolldown.rs', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
    })

    it('matches wildcard subdomains of *.npmjs.org', () => {
        expect(isDomainAllowed('registry.npmjs.org', ['*.npmjs.org'])).toBe(true)
        expect(isDomainAllowed('a.b.npmjs.org', ['*.npmjs.org'])).toBe(true)
    })

    it('rejects bare domain for wildcard pattern', () => {
        // *.npmjs.org 不匹配裸域 npmjs.org（通配符只覆盖子域）
        expect(isDomainAllowed('npmjs.org', ['*.npmjs.org'])).toBe(false)
    })

    it('rejects lookalike domains (boundary guaranteed by leading dot)', () => {
        expect(isDomainAllowed('evilnpmjs.org', ['*.npmjs.org'])).toBe(false)
        expect(isDomainAllowed('notnpmjs.org.evil.com', ['*.npmjs.org'])).toBe(false)
    })

    it('rejects non-allowlisted domain', () => {
        expect(isDomainAllowed('evil.example.com', DEFAULT_ALLOWED_DOMAINS)).toBe(false)
        expect(isDomainAllowed('registry.npmjs.com', DEFAULT_ALLOWED_DOMAINS)).toBe(false)
    })

    it('is case-insensitive', () => {
        expect(isDomainAllowed('REGISTRY.NPMJS.ORG', ['registry.npmjs.org'])).toBe(true)
        expect(isDomainAllowed('Registry.Npmjs.Org', ['*.npmjs.org'])).toBe(true)
    })

    it('matches ip literal exactly', () => {
        expect(isDomainAllowed('127.0.0.1', ['127.0.0.1'])).toBe(true)
        expect(isDomainAllowed('127.0.0.2', ['127.0.0.1'])).toBe(false)
    })

    it('trims whitespace around hostname', () => {
        expect(isDomainAllowed('  github.com  ', ['github.com'])).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// extractHostname
// ---------------------------------------------------------------------------

describe('extractHostname', () => {
    it('strips port', () => {
        expect(extractHostname('registry.npmjs.org:443')).toBe('registry.npmjs.org')
    })

    it('strips protocol and path from full url', () => {
        expect(extractHostname('https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz')).toBe('registry.npmjs.org')
        expect(extractHostname('http://evil.example.com/path?q=1')).toBe('evil.example.com')
    })

    it('keeps ipv6 brackets', () => {
        expect(extractHostname('[::1]:443')).toBe('[::1]')
    })

    it('passes through bare host', () => {
        expect(extractHostname('github.com')).toBe('github.com')
    })
})

// ---------------------------------------------------------------------------
// readAllowedDomains（环境变量扩展）
// ---------------------------------------------------------------------------

describe('readAllowedDomains', () => {
    it('returns defaults when env is empty', () => {
        expect(readAllowedDomains({})).toEqual([...DEFAULT_ALLOWED_DOMAINS])
    })

    it('appends custom domains from DEPENDFIX_ALLOWED_DOMAINS', () => {
        const domains = readAllowedDomains({ DEPENDFIX_ALLOWED_DOMAINS: 'registry.example.com, git.example.com' })
        expect(domains).toContain('registry.example.com')
        expect(domains).toContain('git.example.com')
        expect(domains).toContain('github.com') // 默认清单保留
    })

    it('falls back to bare ALLOWED_DOMAINS', () => {
        const domains = readAllowedDomains({ ALLOWED_DOMAINS: 'mirror.example.com' })
        expect(domains).toContain('mirror.example.com')
    })

    it('deduplicates entries and ignores blanks', () => {
        const domains = readAllowedDomains({ DEPENDFIX_ALLOWED_DOMAINS: 'github.com, , a.example.com,, github.com' })
        expect(domains.filter((d) => d === 'github.com')).toHaveLength(1)
        expect(domains).not.toContain('')
    })
})

// ---------------------------------------------------------------------------
// redactUrlForReport（报告回显最小化）
// ---------------------------------------------------------------------------

describe('redactUrlForReport', () => {
    it('keeps connect target host:port as-is', () => {
        expect(redactUrlForReport('evil.example.com:443')).toBe('evil.example.com:443')
    })

    it('strips path and query from full url', () => {
        expect(redactUrlForReport('https://evil.example.com/exfil?token=stolen&x=1')).toBe('evil.example.com')
        expect(redactUrlForReport('http://evil.example.com/path')).toBe('evil.example.com')
    })

    it('keeps port in url and ipv6 brackets', () => {
        expect(redactUrlForReport('http://host.example.com:8080/path')).toBe('host.example.com:8080')
        expect(redactUrlForReport('[::1]:443')).toBe('[::1]:443')
    })

    it('falls back for empty or unparseable target', () => {
        expect(redactUrlForReport('')).toBe('<unknown-target>')
        expect(redactUrlForReport('   ')).toBe('<unknown-target>')
    })
})

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
// startNetworkAudit（白名单拦截代理）
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

    it('records CONNECT tunnel targets (https via proxy) when allowlisted', async () => {
        audit = await startNetworkAudit({ allowedDomains: ['127.0.0.1'] })

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
        // 白名单命中 → 无违规记录
        expect(audit.violations).toHaveLength(0)
    })

    it('records plain http requests and forwards them when allowlisted', async () => {
        audit = await startNetworkAudit({ allowedDomains: ['127.0.0.1'] })

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
        expect(audit.violations).toHaveLength(0)
    })

    it('returns 502 when upstream forward fails (allowlisted but unreachable)', async () => {
        audit = await startNetworkAudit({ allowedDomains: ['127.0.0.1'] })

        const http = await import('node:http')
        const status = await new Promise<number>((resolve) => {
            const req = http.request({
                host: '127.0.0.1',
                port: new URL(audit!.proxyUrl!).port,
                method: 'GET',
                path: '/x',
                headers: { host: '127.0.0.1:1' }, // 白名单内但无服务端口
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
        // 白名单放行后上游失败 ≠ 违规（仅 deny-by-default 拦截记 violation）
        expect(audit.violations).toHaveLength(0)
    })

    it('blocks CONNECT to non-allowlisted host with 502 and records violation', async () => {
        audit = await startNetworkAudit() // 默认白名单：evil.example.com 不在列

        const http = await import('node:http')
        await new Promise<void>((resolve) => {
            const req = http.request({
                host: '127.0.0.1',
                port: new URL(audit!.proxyUrl!).port,
                method: 'CONNECT',
                path: 'evil.example.com:443',
            })
            req.on('connect', (res2) => {
                // 拦截路径不应返回 200 CONNECT Established
                expect(res2.statusCode).toBe(502)
                res2.socket?.destroy()
                resolve()
            })
            req.on('error', (err) => {
                // 部分 HTTP 客户端实现将 502 视为 error（Connection reset）；两种都是拦截证据
                expect(err.message).toMatch(/502|reset|ECONNRESET/i)
                resolve()
            })
            req.end()
        })

        expect(audit.violations.some((v) => v.method === 'CONNECT' && v.target === 'evil.example.com:443')).toBe(true)
        expect(audit.violations[0]?.violation).toBe(true)
        // 违规记录同步存在于 entries（审计完整性）
        expect(audit.entries.some((e) => e.target === 'evil.example.com:443' && e.violation)).toBe(true)
    })

    it('blocks plain http to non-allowlisted host with 502 and records violation', async () => {
        audit = await startNetworkAudit()

        const http = await import('node:http')
        const status = await new Promise<number>((resolve) => {
            const req = http.request({
                host: '127.0.0.1',
                port: new URL(audit!.proxyUrl!).port,
                method: 'GET',
                path: '/exfil',
                headers: { host: 'evil.example.com' },
            }, (res) => {
                resolve(res.statusCode ?? 0)
                res.resume()
            })
            req.on('error', () => resolve(0))
            req.end()
        })

        expect(status).toBe(502)
        expect(audit.violations.some((v) => v.method === 'GET' && v.target === 'evil.example.com/exfil')).toBe(true)
    })

    it('addViolation records into both entries and violations', async () => {
        const entry = { time: '2026-08-20T00:00:00.000Z', source: 'command-output' as const, method: 'GET', target: 'https://evil.example.com/x.tgz' }
        audit = await startNetworkAudit()

        audit.addViolation(entry)
        expect(audit.violations).toHaveLength(1)
        expect(audit.violations[0]).toEqual({ ...entry, violation: true })
        expect(audit.entries).toHaveLength(1)
        expect(audit.entries[0]?.violation).toBe(true)
    })

    it('addEntries does not mark violations', async () => {
        audit = await startNetworkAudit()
        audit.addEntries([{ time: 't', source: 'command-output', method: 'GET', target: 'https://registry.npmjs.org/x.tgz' }])

        expect(audit.entries).toHaveLength(1)
        expect(audit.violations).toHaveLength(0)
    })

    it('addEntries for non-allowlisted command-output urls (pnpm.io) stays as audit only', async () => {
        // 治本（候选方向 3）实证 2026-08-25 —— pnpm.io 不在默认白名单，但命令输出 URL
        // 仅入 audit entries；违规外联仍由代理拦截捕获。验证 addEntries 不论白名单/非白名单
        // 都不打 violation 标记。
        audit = await startNetworkAudit()
        audit.addEntries([
            { time: 't1', source: 'command-output', method: 'GET', target: 'https://pnpm.io/catalogs' },
            { time: 't2', source: 'command-output', method: 'GET', target: 'https://telemetry.nuxt.com/v1/track' },
        ])

        expect(audit.entries).toHaveLength(2)
        expect(audit.violations).toHaveLength(0)
        // 验证 entry 内容完整保留（hostname 提取待调用方做；这里只验 entries 内容）
        expect(audit.entries.find((e) => extractHostname(e.target) === 'pnpm.io')).toBeDefined()
        expect(audit.entries.find((e) => extractHostname(e.target) === 'telemetry.nuxt.com')).toBeDefined()
    })

    it('respects custom allowedDomains option', async () => {
        // 自定义白名单（不含 github.com）→ github.com 应被拦截
        audit = await startNetworkAudit({ allowedDomains: ['registry.npmjs.org'] })

        const http = await import('node:http')
        const status = await new Promise<number>((resolve) => {
            const req = http.request({
                host: '127.0.0.1',
                port: new URL(audit!.proxyUrl!).port,
                method: 'GET',
                path: '/',
                headers: { host: 'github.com' },
            }, (res) => {
                resolve(res.statusCode ?? 0)
                res.resume()
            })
            req.on('error', () => resolve(0))
            req.end()
        })

        expect(status).toBe(502)
        expect(audit.violations.some((v) => extractHostname(v.target) === 'github.com')).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// 集成测试：真实 curl 经代理访问非白名单域名（拒绝闭环）
// ---------------------------------------------------------------------------

describe.skipIf(!hasCurl)('startNetworkAudit blocks real curl to non-allowlisted host', () => {
    let audit: NetworkAudit | undefined

    afterEach(async () => {
        if (audit) {
            await audit.stop().catch(() => { /* 幂等 */ })
        }
    })

    it('curl https to evil domain gets 502 with violation recorded', async () => {
        audit = await startNetworkAudit() // 默认白名单

        // 异步 spawn（spawnSync 会阻塞代理服务器事件循环导致连接无法处理）
        // https 走 CONNECT 隧道：代理返回 502 → curl 在 stderr 报错且退出码非 0
        const child = spawn('curl', ['-sS', '-m', '10', 'https://evil.example.com/'], {
            env: {
                ...process.env,
                HTTP_PROXY: audit.proxyUrl!,
                HTTPS_PROXY: audit.proxyUrl!,
                ALL_PROXY: audit.proxyUrl!,
                NO_PROXY: '',
                no_proxy: '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stderr = ''
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf-8')
        })
        const exitCode = await new Promise<number | null>((resolve) => {
            child.on('close', (code) => resolve(code))
            child.on('error', () => resolve(-1))
        })

        expect(exitCode).not.toBe(0)
        expect(stderr).toContain('502')
        expect(audit.violations.some((v) => v.method === 'CONNECT' && v.target === 'evil.example.com:443')).toBe(true)
    })
})
