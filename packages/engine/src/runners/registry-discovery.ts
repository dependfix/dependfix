import { execFileSync } from 'node:child_process'
import { extractHostname } from './network-audit'

/**
 * 动态发现「实际生效的 registry」主机名（出站白名单的配置面来源）。
 *
 * 动机：verification 阶段向子进程注入 deny-by-default 拦截代理，默认清单只覆盖官方 registry 域；
 * 在 registry 指向镜像源 / 企业私服 / JSR 等场景下，非白名单 registry 的 CONNECT 被直接 502
 * （不建上游连接，记网络违规）→ `pnpm install --frozen-lockfile` 失败 → 门禁全量回滚。
 * 本模块从 `workDir` 的配置面读出实际生效的 registry 主机名并追加进白名单——**只读本地配置、不联网**。
 *
 * 信任模型：用户 / 目标仓库显式配置的 registry 视为可信（不校验镜像来源真实性、不做签名 / SRI 钉定）；
 * 未列举域名仍 deny-by-default；白名单**不因「命令输出里出现的 URL」扩展**（防绕过配置面扩白名单）。
 *
 * 回退链（fail-open，仅 warn 不阻断）：`pnpm config list --json` → `npm_config_registry` 环境变量
 * → 预置清单（由调用方兜底）。
 */

/** 发现来源 */
export type RegistryDiscoverySource = 'pnpm-config' | 'env' | 'none'

/** 发现结果 */
export interface RegistryDiscoveryResult {
    /** 发现的 registry 主机名（小写、去重；不含协议 / 路径 / 端口） */
    hosts: string[]
    /** 命中来源：pnpm-config = 本地 pnpm 配置；env = 环境变量回退；none = 未发现 */
    source: RegistryDiscoverySource
    /** 降级说明（fail-open 到预置清单时给出，供调用方 warn） */
    warning?: string
}

/** 配置读取命令的执行注入点（默认 execFileSync；单测替换为桩） */
export type ConfigCommandRunner = (
    command: string,
    args: string[],
    options: { cwd: string, timeoutMs: number },
) => string

/** 单次配置读取超时（只读本地配置，正常毫秒级完成；超时即 fail-open） */
const DEFAULT_TIMEOUT_MS = 5_000

/**
 * registry 主机名校验（严格形态，收敛动态来源的攻击面）。
 * 允许：多标签域名 / 单标签主机（如 `localhost`）/ IPv4；
 * 拒绝：通配符、协议、路径、端口、空格、下划线、超长与空值。
 */
const HOST_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

/** registry 配置键名：裸 `registry` 与 `@scope:registry` */
const REGISTRY_KEY_PATTERN = /(^|:)registry$/

/**
 * 主机名是否可作为动态发现的白名单条目。
 * 校验在 host 粒度进行（不含端口），与 `isDomainAllowed` 的精确匹配口径一致。
 */
export function isValidRegistryHost(host: string): boolean {
    return HOST_PATTERN.test(host)
}

/** 从 registry URL 提取合法主机名；非法 / 不可解析返回 undefined */
export function registryHostFromUrl(url: string): string | undefined {
    // 剥离 userinfo（`user:pass@host`）——凭据段不得被误当作主机名（既不漏发现真实域，也不外带凭据）
    const withoutUserinfo = url.replace(/\/\/[^/@]*@/, '//')
    const host = extractHostname(withoutUserinfo).trim().toLowerCase()
    return isValidRegistryHost(host) ? host : undefined
}

/**
 * 从 `pnpm config list --json` 的解析结果抽取 registry 主机名。
 * 仅取键名匹配 `registry` / `@scope:registry` 且值为字符串的项；非法值与重复值被丢弃。
 */
export function extractRegistryHostsFromConfig(config: unknown): string[] {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return []
    }
    const hosts: string[] = []
    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
        if (!REGISTRY_KEY_PATTERN.test(key) || typeof value !== 'string') {
            continue
        }
        const host = registryHostFromUrl(value)
        if (host) {
            hosts.push(host)
        }
    }
    return [...new Set(hosts)]
}

/** 容错解析命令输出为 JSON（pnpm 输出可能夹带提示行，取首尾花括号区间重试） */
function parseConfigJson(raw: string): unknown {
    const trimmed = raw.trim()
    if (!trimmed) {
        return undefined
    }
    try {
        return JSON.parse(trimmed)
    } catch {
        const start = trimmed.indexOf('{')
        const end = trimmed.lastIndexOf('}')
        if (start < 0 || end <= start) {
            return undefined
        }
        try {
            return JSON.parse(trimmed.slice(start, end + 1))
        } catch {
            return undefined
        }
    }
}

/**
 * 命令失败的最小说明：优先 `code`（如 ENOENT / ETIMEDOUT），否则 message 首行截断。
 * 不原样带出 stderr（避免把目标仓库路径等细节写进运行日志）。
 */
function describeCommandFailure(error: unknown): string {
    if (!(error instanceof Error)) {
        return 'unknown error'
    }
    const code = (error as NodeJS.ErrnoException).code
    if (code) {
        return code
    }
    const firstLine = error.message.split('\n')[0]?.trim() ?? ''
    if (firstLine.length > 120) {
        return `${firstLine.slice(0, 120)}…`
    }
    return firstLine || error.name
}

/** 默认命令执行：只读本地 pnpm 配置（不联网、不进 shell） */
function defaultRunCommand(
    command: string,
    args: string[],
    options: { cwd: string, timeoutMs: number },
): string {
    return execFileSync(command, args, {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf-8',
    })
}

/** 环境变量回退（pnpm 读取的两种大小写形态） */
function hostsFromEnv(env: NodeJS.ProcessEnv): string[] {
    const raw = env.npm_config_registry ?? env.NPM_CONFIG_REGISTRY
    if (!raw) {
        return []
    }
    const host = registryHostFromUrl(raw)
    return host ? [host] : []
}

/** 按 workDir 缓存（同一次运行内多次 verification 不重复读取配置） */
const discoveryCache = new Map<string, RegistryDiscoveryResult>()

/**
 * 缓存条数上限：平台进程长驻而 workDir 逐 run 唯一（`runs/{runId}/`），
 * 无上限会让缓存随 run 数无界增长；超限整体清空（重新读取成本仅为一次本地命令）。
 */
const MAX_CACHE_ENTRIES = 64

/** 清空发现缓存（测试用；运行期无需调用） */
export function clearRegistryDiscoveryCache(): void {
    discoveryCache.clear()
}

/**
 * 发现 workDir 内实际生效的 registry 主机名（结果按 workDir 缓存）。
 * fail-open：pnpm 不可用 / 输出不可解析 / 超时 → 回退环境变量 → 返回空 hosts + warning，
 * 由调用方与预置清单合并，**不阻断**执行。
 */
export function discoverRegistryHosts(
    workDir: string,
    options?: { env?: NodeJS.ProcessEnv, runCommand?: ConfigCommandRunner, timeoutMs?: number },
): RegistryDiscoveryResult {
    const cached = discoveryCache.get(workDir)
    if (cached) {
        return cached
    }
    const result = discoverRegistryHostsUncached(workDir, options)
    if (discoveryCache.size >= MAX_CACHE_ENTRIES) {
        discoveryCache.clear()
    }
    discoveryCache.set(workDir, result)
    return result
}

function discoverRegistryHostsUncached(
    workDir: string,
    options?: { env?: NodeJS.ProcessEnv, runCommand?: ConfigCommandRunner, timeoutMs?: number },
): RegistryDiscoveryResult {
    const env = options?.env ?? process.env
    const runCommand = options?.runCommand ?? defaultRunCommand
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

    let warning: string | undefined
    try {
        const raw = runCommand('pnpm', ['config', 'list', '--json'], { cwd: workDir, timeoutMs })
        const parsed = parseConfigJson(raw)
        const hosts = extractRegistryHostsFromConfig(parsed)
        if (hosts.length > 0) {
            return { hosts, source: 'pnpm-config' }
        }
        warning = parsed === undefined
            ? 'pnpm 配置输出不可解析，回退环境变量与预置白名单'
            : 'pnpm 配置未声明 registry 键，回退环境变量与预置白名单'
    } catch (error) {
        warning = `读取 pnpm 配置失败（${describeCommandFailure(error)}），回退环境变量与预置白名单`
    }

    const envHosts = hostsFromEnv(env)
    if (envHosts.length > 0) {
        return { hosts: envHosts, source: 'env', ...(warning ? { warning } : {}) }
    }
    return { hosts: [], source: 'none', ...(warning ? { warning } : {}) }
}
