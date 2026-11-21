import { createServer, type Server } from 'node:http'
import { connect as connectTcp, createServer as createTcpServer } from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    closeServerBounded,
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
        // Release 资产重定向落地域：只登记 objects 会把合法下载判成违规
        expect(isDomainAllowed('release-assets.githubusercontent.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('evil.githubusercontent.com', DEFAULT_ALLOWED_DOMAINS)).toBe(false)
    })

    it('matches wildcard subdomains of *.npmjs.org', () => {
        expect(isDomainAllowed('registry.npmjs.org', ['*.npmjs.org'])).toBe(true)
        expect(isDomainAllowed('a.b.npmjs.org', ['*.npmjs.org'])).toBe(true)
    })

    it('rejects bare domain for wildcard pattern', () => {
        // *.npmjs.org 不匹配裸域 npmjs.org（通配符只覆盖子域）
        expect(isDomainAllowed('npmjs.org', ['*.npmjs.org'])).toBe(false)
    })

    it('matches common mirror registries and their CDN in defaults', () => {
        // 镜像站 registry + tarball CDN（302 目标域）成对登记：只放 registry 域会让 tarball 仍被拦
        expect(isDomainAllowed('registry.npmmirror.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('cdn.npmmirror.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('registry.yarnpkg.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('npm.jsr.io', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('mirrors.cloud.tencent.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('repo.huaweicloud.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        expect(isDomainAllowed('npm.pkg.github.com', DEFAULT_ALLOWED_DOMAINS)).toBe(true)
        // 相似域 / 裸域不被通配放行
        expect(isDomainAllowed('evil-npmmirror.com', DEFAULT_ALLOWED_DOMAINS)).toBe(false)
        expect(isDomainAllowed('npmmirror.com', DEFAULT_ALLOWED_DOMAINS)).toBe(false)
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

    it('merges extraAllowedDomains with defaults (registry discovery path)', async () => {
        // 动态发现路径：extraAllowedDomains 与「默认清单 + 环境变量扩展」合并
        audit = await startNetworkAudit({ extraAllowedDomains: ['mirror.internal.example.com'] })

        expect(audit.allowedDomains).toContain('mirror.internal.example.com')
        expect(audit.allowedDomains).toContain('*.npmjs.org')
        expect(audit.allowedDomains).toContain('*.npmmirror.com')
        // 显式传 allowedDomains 时以它为准（extraAllowedDomains 不叠加）
        const explicit = await startNetworkAudit({ allowedDomains: ['only.example.com'], extraAllowedDomains: ['ignored.example.com'] })
        expect(explicit.allowedDomains).toEqual(['only.example.com'])
        await explicit.stop().catch(() => { /* 幂等 */ })
        // 动态发现不放开未知域：未列举域名仍 deny-by-default
        expect(isDomainAllowed('evil.example.com', audit.allowedDomains)).toBe(false)
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

// ---------------------------------------------------------------------------
// 停止语义：CONNECT 隧道不得把 stop() 拖成永久等待
// （2026-11-13 momei 运行收尾 5m20s 空窗的根因：upgrade 后的隧道被移出 closeAllConnections 追踪集）
// ---------------------------------------------------------------------------

describe('stop 与 CONNECT 隧道的生命周期', () => {
    it('destroys a live tunnel and settles stop() instead of waiting for the client', async () => {
        const echo = createTcpServer((socket) => socket.pipe(socket))
        await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve))
        const echoPort = (echo.address() as { port: number }).port

        const audit = await startNetworkAudit({ allowedDomains: ['127.0.0.1'] })
        const tunnel = connectTcp(Number(new URL(audit.proxyUrl!).port), '127.0.0.1')
        const tunnelClosed = new Promise<boolean>((resolve) => tunnel.once('close', () => resolve(true)))

        try {
            await new Promise<void>((resolve, reject) => {
                // 响应头可能被分片：累积到 \r\n\r\n 再判定
                let head = ''
                const onData = (chunk: Buffer): void => {
                    head += chunk.toString('latin1')
                    if (!head.includes('\r\n\r\n')) {
                        return
                    }
                    tunnel.off('data', onData)
                    if (head.startsWith('HTTP/1.1 200')) {
                        resolve()
                        return
                    }
                    reject(new Error(`unexpected CONNECT response: ${head.slice(0, 40)}`))
                }
                tunnel.on('data', onData)
                tunnel.once('error', reject)
                tunnel.write(`CONNECT 127.0.0.1:${echoPort} HTTP/1.1\r\nHost: 127.0.0.1:${echoPort}\r\n\r\n`)
            })

            // 隧道保持打开（模拟 keep-alive 外联）；修复前这里会等客户端断开，超时判定失败
            const startedAt = Date.now()
            await audit.stop()
            expect(Date.now() - startedAt).toBeLessThan(1_000)

            // 服务端主动断开隧道：stop 之后不再服务后续流量
            await expect(Promise.race([
                tunnelClosed,
                new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000)),
            ])).resolves.toBe(true)
        } finally {
            // 兜底：destroy 可能再触发一次 error，避免冒成未捕获异常
            tunnel.on('error', () => { /* 关闭期错误已由上方断言覆盖 */ })
            tunnel.destroy()
            await audit.stop().catch(() => { /* 幂等 */ })
            await new Promise((resolve) => echo.close(resolve))
        }
    })
})

describe('closeServerBounded', () => {
    it('clears its fallback timer when close completes', async () => {
        vi.useFakeTimers()
        try {
            const onTimeout = vi.fn()
            const server = { close: (callback: () => void) => callback() } as unknown as Server

            await closeServerBounded(server, 30, onTimeout)

            // 定时器必须被清掉：否则每次 stop 都让事件循环多存活一个上限周期（与本次修复的挂起同族）
            expect(vi.getTimerCount()).toBe(0)
            vi.advanceTimersByTime(100)
            expect(onTimeout).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

    it('gives up after the bound when close never completes', async () => {
        const onTimeout = vi.fn()
        // 模拟「仍有未知句柄」：close 回调永不触发
        const server = { close: () => { /* never calls back */ } } as unknown as Server

        const startedAt = Date.now()
        await closeServerBounded(server, 30, onTimeout)

        expect(onTimeout).toHaveBeenCalledTimes(1)
        expect(Date.now() - startedAt).toBeLessThan(1_000)
    })
})
