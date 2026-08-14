import { createServer, request as httpRequest, type Server } from 'node:http'
import { connect, type Socket } from 'node:net'

/**
 * 执行期网络外联审计（安全治理：恶意脚本外联回传/下载 payload 的事故溯源）。
 *
 * 捕获面（实证驱动，2026-08-14）：
 * - **命令输出 URL 提取**（主）：执行命令 stdout/stderr 中的 http(s) URL——
 *   pnpm install 输出含完整 tarball URL（registry 域名 + 包名 + 版本），
 *   确定性捕获 pnpm/npm 的 registry 外联（pnpm 11 undici 直连不走代理 env，实证确认）
 * - **本地审计代理**（辅）：注入 HTTP(S)_PROXY 捕获尊重代理的工具（curl/wget/npm CLI/git http）；
 *   仅当环境无既有代理时注入（覆盖用户代理会破坏其网络行为，稳定性优先）
 * - 覆盖边界：undici 直连（node fetch/https.request 默认不读代理 env）与原始 socket 不在列——
 *   连接级全量捕获依赖后续网络出站白名单（默认 deny）治理，本模块为过渡期备查记录
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
}

export interface NetworkAudit {
    /** 审计代理地址（未注入时为 undefined） */
    proxyUrl?: string
    /** 已收集的外联记录（代理捕获 + 输出提取合并，追加即生效） */
    entries: NetworkAuditEntry[]
    /** 追加一条记录（命令输出 URL 提取用） */
    addEntries(entries: NetworkAuditEntry[]): void
    /** 停止审计（关闭代理服务器，幂等） */
    stop(): Promise<void>
}

const CONNECT_TIMEOUT_MS = 10_000

/**
 * 启动本地网络审计代理（127.0.0.1 随机端口）。
 * 支持 CONNECT 隧道（HTTPS）与明文 HTTP 转发；转发失败返回 502/销毁 socket，
 * 不挂死调用方。停止后服务器关闭。
 */
export async function startNetworkAudit(): Promise<NetworkAudit> {
    const entries: NetworkAuditEntry[] = []
    const server: Server = createServer()

    server.on('connect', (req, clientSocket, head) => {
        const target = req.url ?? ''
        entries.push({ time: new Date().toISOString(), source: 'proxy', method: 'CONNECT', target })

        const idx = target.lastIndexOf(':')
        const host = target.slice(0, idx)
        const port = Number.parseInt(target.slice(idx + 1), 10) || 443

        const upstream: Socket = connect(port, host)
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
        entries.push({ time: new Date().toISOString(), source: 'proxy', method: req.method ?? 'GET', target })

        const host = hostHeader.split(':')[0]
        const port = Number.parseInt(hostHeader.split(':')[1], 10) || 80
        const proxyReq = httpRequest({
            host,
            port,
            path: req.url,
            method: req.method,
            headers: req.headers,
            timeout: CONNECT_TIMEOUT_MS,
        }, (proxyRes) => {
            // 过滤 hop-by-hop 头（Connection/Transfer-Encoding 等逐跳头不应透传给客户端）
            const cleanHeaders: Record<string, string | string[] | number | undefined> = { ...proxyRes.headers }
            for (const hop of ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-connection']) {
                delete cleanHeaders[hop]
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
        entries,
        addEntries: (newEntries) => entries.push(...newEntries),
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
