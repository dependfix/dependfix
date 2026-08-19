import { createServer, request as httpRequest, type Server } from 'node:http'
import { connect, type Socket } from 'node:net'

/**
 * 执行期网络外联审计 + 出站白名单拦截（安全治理：恶意脚本外联回传/下载 payload 的事故溯源与阻断）。
 *
 * 捕获面（实证驱动，2026-08-14）：
 * - **命令输出 URL 提取**（主）：执行命令 stdout/stderr 中的 http(s) URL——
 *   pnpm install 输出含完整 tarball URL（registry 域名 + 包名 + 版本），
 *   确定性捕获 pnpm/npm 的 registry 外联（pnpm 11 undici 直连不走代理 env，实证确认）
 * - **本地拦截代理**（辅）：注入 HTTP(S)_PROXY 捕获尊重代理的工具（curl/wget/npm CLI/git http）；
 *   仅当环境无既有代理时注入（覆盖用户代理会破坏其网络行为，稳定性优先）；
 *   **deny-by-default**：非白名单域名的 CONNECT/HTTP 请求直接 502 拒绝（不建上游连接），
 *   记录为违规外联（`violation`）；白名单命中才放行（registry/GitHub 默认域 + 可配置扩展）
 * - 覆盖边界：undici 直连（node fetch/https.request 默认不读代理 env）不在连接级拦截范围——
 *   命令输出 URL 提取对这类外联提供冗余判定（攻击者绕过代理 env 也会被命中并归类违规）
 *
 * 无敏感信息：仅记录方法 + 目标（host/URL），不记录请求体与响应体。
 */

export type NetworkAuditSource = 'proxy' | 'command-output'

export interface NetworkAuditEntry {
    /** 记录时间（ISO） */
    time: string
    /** 来源：proxy = 审计代理捕获；command-output = 命令输出 URL 提取 */
    source: NetworkAuditSource
    /** 请求方法（CONNECT / GET / POST / ...） */
    method: string
    /** 外联目标（proxy：host:port；command-output：完整 URL） */
    target: string
    /** deny-by-default 拦截的违规外联标记（白名单校验失败的外联为 true） */
    violation?: boolean
}

export interface NetworkAudit {
    /** 审计代理地址（未注入时为 undefined） */
    proxyUrl?: string
    /** 生效的出站白名单（默认清单 + 配置扩展；deny-by-default 判定依据） */
    allowedDomains: string[]
    /** 已收集的外联记录（代理捕获 + 输出提取合并，追加即生效） */
    entries: NetworkAuditEntry[]
    /** 非白名单外联违规（deny-by-default 拦截记录；同步存在于 entries） */
    violations: NetworkAuditEntry[]
    /** 追加一条记录（命令输出 URL 提取用，白名单命中路径） */
    addEntries(entries: NetworkAuditEntry[]): void
    /** 追加一条违规外联（非白名单；同时进入 entries 与 violations） */
    addViolation(entry: NetworkAuditEntry): void
    /** 停止审计（关闭代理服务器，幂等） */
    stop(): Promise<void>
}

const CONNECT_TIMEOUT_MS = 10_000

/**
 * 默认出站白名单（网络白名单治理决策：仅 registry + GitHub API/资产域）。
 * - `*.npmjs.org` 覆盖 npm registry 全子域（含 registry.npmjs.org 的 tarball 下载域）
 * - GitHub 相关：REST API（api.github.com）、git clone/网页（github.com）、
 *   release 资产（objects.githubusercontent.com）、raw 文件（raw.githubusercontent.com）
 * 需要更多域时通过环境变量扩展（见 readAllowedDomains）。
 */
export const DEFAULT_ALLOWED_DOMAINS = [
    '*.npmjs.org',
    'api.github.com',
    'github.com',
    'objects.githubusercontent.com',
    'raw.githubusercontent.com',
] as const

/**
 * 从环境读取出站白名单：默认清单 + 扩展域（逗号分隔，追加不替换）。
 * 读取顺序：`DEPENDFIX_ALLOWED_DOMAINS` 优先，回退裸 `ALLOWED_DOMAINS`
 * （与 CLI 配置层的 DEPENDFIX_ 前缀惯例一致，同时兼容决策文档中的裸变量名）。
 * 空/未配置 → 仅默认清单。
 */
export function readAllowedDomains(env: NodeJS.ProcessEnv = process.env): string[] {
    const raw = env.DEPENDFIX_ALLOWED_DOMAINS ?? env.ALLOWED_DOMAINS
    if (!raw) {
        return [...DEFAULT_ALLOWED_DOMAINS]
    }
    const extra = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return [...new Set([...DEFAULT_ALLOWED_DOMAINS, ...extra])]
}

/**
 * 从外联目标提取主机名（去协议、去路径、去端口；IPv6 方括号形式保留括号）。
 * - `host:port` / `https://host/path` / `host` → `host`
 * - `[::1]:443` → `[::1]`
 */
export function extractHostname(target: string): string {
    let t = target.trim()
    const protoIdx = t.indexOf('://')
    if (protoIdx >= 0) {
        t = t.slice(protoIdx + 3)
    }
    const slashIdx = t.indexOf('/')
    if (slashIdx >= 0) {
        t = t.slice(0, slashIdx)
    }
    if (t.startsWith('[')) {
        const close = t.indexOf(']')
        return close >= 0 ? t.slice(0, close + 1) : t
    }
    const colonIdx = t.lastIndexOf(':')
    return colonIdx >= 0 ? t.slice(0, colonIdx) : t
}

/**
 * 白名单命中判定（大小写不敏感）。
 * - `*.domain` 通配符：匹配任意**子域**（`sub.domain`、`a.b.domain`），不含裸 `domain` 本身；
 *   边界由前导点保证（`evilnpmjs.org` 不会被 `*.npmjs.org` 命中）
 * - 其他条目：主机名精确匹配（IPv6 需带方括号，与 extractHostname 输出一致）
 */
export function isDomainAllowed(hostname: string, allowedDomains: readonly string[]): boolean {
    const host = hostname.trim().toLowerCase()
    return allowedDomains.some((pattern) => {
        const p = pattern.trim().toLowerCase()
        if (p.startsWith('*.')) {
            const base = p.slice(2)
            return host.length > base.length + 1 && host.endsWith(`.${base}`)
        }
        return host === p
    })
}

/**
 * 将外联目标最小化为报告安全形态：仅保留 host[:port]，丢弃路径与查询串。
 * deny-by-default 拦截的证据字段不落 payload——恶意脚本通过 URL query 外带凭据时，
 * 网络层已拦截但查询串不得原样回显进报告/日志（防御纵深，最小暴露）。
 * - `evil.example.com:443`（CONNECT）→ 原样
 * - `https://evil.example.com/exfil?token=x` → `evil.example.com`
 * - `[::1]:443` / `http://host:8080/path` → 保留方括号/端口
 * - 空/无法解析 → `<unknown-target>`（防报告出现空目标）
 */
export function redactUrlForReport(target: string): string {
    let t = target.trim()
    const protoIdx = t.indexOf('://')
    if (protoIdx >= 0) {
        t = t.slice(protoIdx + 3)
    }
    const slashIdx = t.indexOf('/')
    if (slashIdx >= 0) {
        t = t.slice(0, slashIdx)
    }
    return t || '<unknown-target>'
}

export interface StartNetworkAuditOptions {
    /** 出站白名单（deny-by-default 判定）；缺省 = 默认清单 + 环境变量扩展 */
    allowedDomains?: string[]
}

/**
 * 启动本地网络拦截代理（127.0.0.1 随机端口）。
 * 支持 CONNECT 隧道（HTTPS）与明文 HTTP 转发；deny-by-default：非白名单目标
 * 返回 502/销毁 socket 且不建立上游连接，并记录违规外联；白名单命中才转发
 * （转发失败仍返回 502，不挂死调用方）。停止后服务器关闭。
 */
export async function startNetworkAudit(options?: StartNetworkAuditOptions): Promise<NetworkAudit> {
    const allowedDomains = options?.allowedDomains ?? readAllowedDomains()
    const entries: NetworkAuditEntry[] = []
    const violations: NetworkAuditEntry[] = []
    const server: Server = createServer()

    server.on('connect', (req, clientSocket, head) => {
        const target = req.url ?? ''
        const baseEntry: NetworkAuditEntry = {
            time: new Date().toISOString(),
            source: 'proxy',
            method: 'CONNECT',
            target,
        }

        const host = extractHostname(target)
        const allowed = isDomainAllowed(host, allowedDomains)
        // 违规记录带 violation 标记（entries 与 violations 共享同一对象，审计完整性 + 标记一致）
        const entry = allowed ? baseEntry : { ...baseEntry, violation: true }
        entries.push(entry)
        if (!allowed) {
            violations.push(entry)
            // deny-by-default：直接 502 拒绝，不建立上游连接
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
            clientSocket.end()
            return
        }

        const idx = target.lastIndexOf(':')
        const upstreamHost = target.slice(0, idx)
        const port = Number.parseInt(target.slice(idx + 1), 10) || 443

        const upstream: Socket = connect(port, upstreamHost)
        const timer = setTimeout(() => {
            upstream.destroy()
            clientSocket.destroy()
        }, CONNECT_TIMEOUT_MS)

        upstream.on('connect', () => {
            clearTimeout(timer)
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
            if (head && head.length > 0) {
                upstream.write(head)
            }
            upstream.pipe(clientSocket)
            clientSocket.pipe(upstream)
        })
        upstream.on('error', () => {
            clearTimeout(timer)
            clientSocket.destroy()
        })
        clientSocket.on('error', () => {
            clearTimeout(timer)
            upstream.destroy()
        })
    })

    server.on('request', (req, res) => {
        const hostHeader = req.headers.host ?? ''
        const target = `${hostHeader}${req.url ?? ''}`
        const baseEntry: NetworkAuditEntry = {
            time: new Date().toISOString(),
            source: 'proxy',
            method: req.method ?? 'GET',
            target,
        }

        const host = extractHostname(hostHeader)
        const allowed = isDomainAllowed(host, allowedDomains)
        // 违规记录带 violation 标记（entries 与 violations 共享同一对象）
        const entry = allowed ? baseEntry : { ...baseEntry, violation: true }
        entries.push(entry)
        if (!allowed) {
            violations.push(entry)
            // deny-by-default：直接 502 拒绝，不转发上游
            res.statusCode = 502
            res.end()
            return
        }

        const port = Number.parseInt(hostHeader.split(':')[1], 10) || 80
        const proxyReq = httpRequest({
            host,
            port,
            path: req.url,
            method: req.method,
            headers: req.headers,
            timeout: CONNECT_TIMEOUT_MS,
        }, (proxyRes) => {
            // 过滤 hop-by-hop 头（Connection/Transfer-Encoding 等逐跳头不应透传给客户端）。
            // 用 Reflect.deleteProperty 代替 delete obj[key]，规避 @typescript-eslint/no-dynamic-delete（警告级 lint 升级为 CI 失败）
            const cleanHeaders: Record<string, string | string[] | number | undefined> = { ...proxyRes.headers }
            for (const hop of ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-connection']) {
                Reflect.deleteProperty(cleanHeaders, hop)
            }
            res.writeHead(proxyRes.statusCode ?? 500, cleanHeaders)
            proxyRes.pipe(res)
        })
        proxyReq.on('error', () => {
            res.statusCode = 502
            res.end()
        })
        proxyReq.on('timeout', () => {
            proxyReq.destroy()
            res.statusCode = 502
            res.end()
        })
        req.pipe(proxyReq)
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    return {
        proxyUrl: `http://127.0.0.1:${port}`,
        allowedDomains,
        entries,
        violations,
        addEntries: (newEntries) => entries.push(...newEntries),
        addViolation: (entry) => {
            const violation: NetworkAuditEntry = { ...entry, violation: true }
            entries.push(violation)
            violations.push(violation)
        },
        // closeAllConnections 强制关闭活跃隧道（防 server.close 等待长连接挂起）
        stop: () => new Promise<void>((resolve) => {
            server.closeAllConnections?.()
            server.close(() => resolve())
        }),
    }
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+/g
/** 单条命令输出提取的外联 URL 数量上限（防恶意脚本输出轰炸撑爆审计记录） */
const MAX_URLS_PER_COMMAND = 100

/**
 * 从命令输出提取外联 URL（去重、限数、截断超长）。
 * 仅提取 http(s) URL；无 URL 返回空数组。
 */
export function extractUrlsFromOutput(output: string): string[] {
    if (!output) {
        return []
    }
    const urls: string[] = []
    for (const match of output.match(URL_PATTERN) ?? []) {
        const clean = match.replace(/[.,;:]+$/, '')
        if (!urls.includes(clean)) {
            urls.push(clean)
        }
        if (urls.length >= MAX_URLS_PER_COMMAND) {
            break
        }
    }
    return urls
}

/** 日志接口（与 PipelineLogger 的最小对齐） */
export interface AuditLogger {
    info(msg: string): void
    debug(msg: string): void
}

/**
 * 输出外联审计记录到执行日志：总数进 info、明细进 debug（verbose 才逐条）。
 * 仅记录方法+目标，无请求/响应体（无敏感信息）。
 */
export function logNetworkAudit(logger: AuditLogger, repo: string, entries: NetworkAuditEntry[]): void {
    if (entries.length === 0) {
        return
    }
    logger.info(`[network-audit] ${repo}: ${entries.length} outbound connection(s) recorded`)
    for (const entry of entries) {
        logger.debug(`[network-audit] ${repo}: ${entry.source} ${entry.method} ${entry.target}`)
    }
}
