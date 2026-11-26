/**
 * check-release-security-alerts.mjs —— 发布前安全告警门禁（权威口径见 security.md §5.9）
 *
 * 背景：`pnpm audit` 的 CI 阻断（security.md §5.6）只覆盖 npm 依赖面，Dependabot / Code Scanning
 * 的 open 告警仍可能在发布时未收敛。本脚本在 `release.yml` 进入发布前做发布级判定：
 * - critical：一律阻断，**不接受任何豁免**（台账中也不允许登记 critical）；
 * - high：仅当 `.github/release-security-exemptions.json` 台账登记了该告警时才放行；
 * - moderate / low：不阻断，仅打印统计。
 *
 * 设计原则：
 * - 纯函数（loadExemptions / evaluateAlerts / classify*）+ CLI 入口守卫：vitest import 时无副作用
 * - **fail-closed**：token 缺失、API 403/401、响应非数组、级别无法判定 → 一律失败，不得视为"无告警"
 * - 台账与文档单一事实源：台账唯一落点是本脚本读取的 JSON 文件，security.md §5.9 只声明字段要求
 *
 * 用法：
 *   GH_PAT=<token> GITHUB_REPOSITORY=owner/repo pnpm run check:release-security
 *   node scripts/check-release-security-alerts.mjs --repo=owner/repo --exemptions=.github/release-security-exemptions.json
 *
 * 退出码：0 通过（允许 stale 台账 warning）/ 1 门禁失败或配置 / API 错误 / 2 参数错误
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { getCliArgs, isDirectExecution } from './shared/cli.mjs'

export const EXEMPTIONS_REL = '.github/release-security-exemptions.json'
const DEFAULT_API_BASE = 'https://api.github.com'
const PER_PAGE = 100
const MAX_PAGES = 20
const ALLOWED_SOURCES = ['dependabot', 'code-scanning']
const ALLOWED_CATEGORIES = ['no-fix', 'hard-fix', 'false-positive']
const REQUIRED_FIELDS = ['source', 'id', 'severity', 'category', 'target', 'path', 'reason', 'review', 'tracking']
// GitHub API 的严重级别原值为 critical / high / medium / low（无 moderate）；
// 本项目统一口径用 moderate，故 medium 在归一化阶段映射为 moderate。
const SEVERITIES = ['critical', 'high', 'moderate', 'low']
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 200
const REQUEST_TIMEOUT_MS = 10_000
const BLOCKING_SEVERITY = 'critical'
const EXEMPTIBLE_SEVERITY = 'high'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Code Scanning rule.severity（error/warning/note/none）→ 与 Dependabot 同量纲的级别；未知返回 null。 */
export function mapRuleSeverity(severity) {
    if (severity === 'error') {
        return 'high'
    }
    if (severity === 'warning') {
        return 'moderate'
    }
    if (severity === 'note' || severity === 'none') {
        return 'low'
    }
    return null
}

/** 归一化级别（medium → moderate）；无法映射时返回 'unknown'（由评估阶段按失败处理）。 */
export function normalizeSeverity(source, raw) {
    if (raw === 'medium') {
        return 'moderate'
    }
    if (SEVERITIES.includes(raw)) {
        return raw
    }
    if (source === 'code-scanning') {
        return mapRuleSeverity(raw) ?? 'unknown'
    }
    return 'unknown'
}

/** Dependabot alert → 门禁判定所需的扁平结构。 */
export function classifyDependabotAlert(alert = {}) {
    const advisory = alert.security_advisory ?? {}
    return {
        source: 'dependabot',
        id: String(advisory.ghsa_id ?? advisory.cve_id ?? alert.number ?? 'unknown'),
        severity: normalizeSeverity('dependabot', advisory.severity),
        target: alert.dependency?.package?.name ?? 'unknown',
        location: alert.dependency?.manifest_path ?? '',
        state: alert.state ?? 'open',
        url: alert.html_url ?? '',
    }
}

/** Code Scanning alert → 门禁判定所需的扁平结构（security_severity_level 优先）。 */
export function classifyCodeScanningAlert(alert = {}) {
    const rule = alert.rule ?? {}
    const raw = rule.security_severity_level ?? rule.severity
    return {
        source: 'code-scanning',
        id: String(rule.id ?? alert.number ?? 'unknown'),
        severity: normalizeSeverity('code-scanning', raw),
        target: rule.name ?? rule.id ?? 'unknown',
        location: alert.most_recent_instance?.location?.path ?? '',
        state: alert.state ?? 'open',
        url: alert.html_url ?? '',
    }
}

/** 台账条目的匹配键：来源 + 告警编号（GHSA / rule id 大小写不敏感）。 */
export function exemptionKey(source, id) {
    return `${source}:${String(id).trim().toUpperCase()}`
}

/** 台账条目的唯一身份：Code Scanning 含实例路径（同一 rule 不同文件可分别登记）。 */
export function exemptionIdentity(entry) {
    const key = exemptionKey(entry.source, entry.id)
    return typeof entry.location === 'string' && entry.location.trim() !== '' ? `${key}:${entry.location}` : key
}

/**
 * 解析并校验豁免台账。
 * @returns {{ exemptions: object[], errors: string[] }} 任一条目不合法时 exemptions 为空（避免半套台账放行）
 */
export function loadExemptions(text) {
    let parsed
    try {
        parsed = JSON.parse(text)
    } catch (error) {
        return { exemptions: [], errors: [`JSON 解析失败：${error.message}`] }
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.exemptions)) {
        return { exemptions: [], errors: ['顶层必须为 { "exemptions": [...] } 结构'] }
    }

    const errors = []
    const exemptions = []
    const seen = new Set()

    parsed.exemptions.forEach((entry, index) => {
        const prefix = `exemptions[${index}]`
        if (!entry || typeof entry !== 'object') {
            errors.push(`${prefix} 必须是对象`)
            return
        }
        for (const field of REQUIRED_FIELDS) {
            if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
                errors.push(`${prefix}.${field} 必须是非空字符串`)
            }
        }
        if (!ALLOWED_SOURCES.includes(entry.source)) {
            errors.push(`${prefix}.source 必须是 ${ALLOWED_SOURCES.join(' / ')}`)
        }
        if (entry.severity === BLOCKING_SEVERITY) {
            errors.push(`${prefix}.severity 不得为 critical（critical 禁止豁免，见 security.md §5.9）`)
        } else if (entry.severity !== EXEMPTIBLE_SEVERITY) {
            errors.push(`${prefix}.severity 仅允许 high（moderate / low 无需登记）`)
        }
        if (!ALLOWED_CATEGORIES.includes(entry.category)) {
            errors.push(`${prefix}.category 必须是 ${ALLOWED_CATEGORIES.join(' / ')}`)
        }
        if (entry.source === 'code-scanning' && (typeof entry.location !== 'string' || entry.location.trim() === '')) {
            errors.push(`${prefix}.location 必须是非空字符串（Code Scanning 按实例路径豁免，避免同 rule 其他实例被连带放行）`)
        }
        const identity = exemptionIdentity(entry)
        if (seen.has(identity)) {
            errors.push(`${prefix} 与前面的条目重复（${identity}）`)
        }
        seen.add(identity)
        exemptions.push({ ...entry, id: String(entry.id) })
    })

    return { exemptions: errors.length > 0 ? [] : exemptions, errors }
}

/**
 * 台账条目是否命中该告警：
 * - 来源 + 编号一致；
 * - `false-positive` 只对 dismissed 告警生效，`no-fix` / `hard-fix` 只对 open 告警生效
 *   （避免用「误报」条目豁免真实 open 漏洞，反之亦然）；
 * - Code Scanning 额外要求实例路径一致（同一 rule 的其他实例不得被连带放行）。
 */
export function exemptionMatches(alert, entry) {
    if (entry.source !== alert.source) {
        return false
    }
    if (exemptionKey(entry.source, entry.id) !== exemptionKey(alert.source, alert.id)) {
        return false
    }
    const dismissed = alert.state === 'dismissed'
    if ((entry.category === 'false-positive') !== dismissed) {
        return false
    }
    if (alert.source === 'code-scanning') {
        return entry.location === alert.location
    }
    return true
}

/**
 * 按 security.md §5.9 判定：critical 阻断（含 dismissed——不得以 dismiss 代替修复）；
 * high 需台账命中（dismissed 须登记 `false-positive`，open 须 `no-fix` / `hard-fix`）；
 * moderate / low 放行；级别 unknown → 失败（fail-closed，不能当作无告警）。
 */
export function evaluateAlerts({ dependabot = [], codeScanning = [], exemptions = [] }) {
    const failures = []
    const warnings = []
    const summary = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0, exempted: 0 }
    const alerts = [...dependabot.map(classifyDependabotAlert), ...codeScanning.map(classifyCodeScanningAlert)]
    const byKey = new Map()
    for (const entry of exemptions) {
        const key = exemptionKey(entry.source, entry.id)
        const bucket = byKey.get(key) ?? []
        bucket.push(entry)
        byKey.set(key, bucket)
    }
    const used = new Set()

    for (const alert of alerts) {
        const dismissed = alert.state === 'dismissed'
        if (alert.severity === BLOCKING_SEVERITY) {
            summary.critical += 1
            failures.push({ code: dismissed ? 'critical-dismissed' : 'critical', ...alert })
            continue
        }
        if (alert.severity === EXEMPTIBLE_SEVERITY) {
            summary.high += 1
            const candidates = byKey.get(exemptionKey(alert.source, alert.id)) ?? []
            const hit = candidates.find((entry) => exemptionMatches(alert, entry))
            if (hit) {
                summary.exempted += 1
                used.add(hit)
                continue
            }
            failures.push({ code: dismissed ? 'high-dismissed-unregistered' : 'high-unexempted', ...alert })
            continue
        }
        if (alert.severity === 'moderate' || alert.severity === 'low') {
            summary[alert.severity] += 1
            continue
        }
        summary.unknown += 1
        failures.push({ code: 'unknown-severity', ...alert })
    }

    for (const entry of exemptions) {
        if (!used.has(entry)) {
            warnings.push({ code: 'stale-exemption', key: exemptionKey(entry.source, entry.id), entry })
        }
    }

    return { failures, warnings, summary }
}

/**
 * 采集时点行（UTC ISO 8601，固定单行格式）。
 *
 * 发布证据（终端输出 / Job Summary / 归档日志）此前只能靠文件 mtime 推断"什么时候查的"，
 * 时区与时钟漂移都无法自证。所有路径（PASS / FAIL / token 缺失 / 台账非法 / 拉取异常 / 参数错误）
 * 的第一行统一输出本行，落盘即可自证采集时点。
 */
export function formatCollectionTime(now = new Date()) {
    return `[release-security] 采集时点 ${now.toISOString()}`
}

/**
 * 给结果行加采集时点首行（保持退出码不变）。
 * @param {{exitCode: number, lines: string[]}} result
 * @param {() => Date} now
 * @returns {{exitCode: number, lines: string[]}}
 */
function withCollectionTime(result, now) {
    return { ...result, lines: [formatCollectionTime(now()), ...result.lines] }
}

/** 组装输出行；在 GitHub Actions 环境中附加 ::error:: / ::warning:: 注解。 */
export function formatLines({ repo, result, annotate = false }) {
    const { failures, warnings, summary } = result
    const lines = [
        `[release-security] 仓库 ${repo}：告警汇总（open + dismissed） critical ${summary.critical} / high ${summary.high}（豁免 ${summary.exempted}）/ moderate ${summary.moderate} / low ${summary.low} / 无法判定 ${summary.unknown}`,
    ]

    for (const failure of failures) {
        const detail = `${failure.source} ${failure.id}（${failure.target}${failure.location ? ` @ ${failure.location}` : ''}）${failure.url ? ` ${failure.url}` : ''}`
        if (failure.code === 'critical') {
            lines.push(`${annotate ? '::error::' : '[release-security] FAIL：'}critical 告警必须修复，禁止豁免：${detail}`)
        } else if (failure.code === 'critical-dismissed') {
            lines.push(`${annotate ? '::error::' : '[release-security] FAIL：'}critical 告警被 dismiss，不得以 dismiss 代替修复：${detail}`)
        } else if (failure.code === 'high-unexempted') {
            lines.push(`${annotate ? '::error::' : '[release-security] FAIL：'}high 告警未在豁免台账登记：${detail}`)
        } else if (failure.code === 'high-dismissed-unregistered') {
            lines.push(`${annotate ? '::error::' : '[release-security] FAIL：'}high 告警被 dismiss 但未在豁免台账登记：${detail}`)
        } else {
            lines.push(`${annotate ? '::error::' : '[release-security] FAIL：'}无法判定告警级别（不得视为无告警）：${detail}`)
        }
    }

    for (const warning of warnings) {
        const entry = warning.entry
        const message = `stale 豁免：${entry.source} ${entry.id} 当前无匹配的 high 告警，请按复核条件移除（${entry.review}）`
        lines.push(`${annotate ? '::warning::' : '[release-security] WARN：'}${message}`)
    }

    if (failures.length === 0) {
        lines.push('[release-security] PASS：无未豁免的 critical / high 告警')
    } else {
        lines.push(`[release-security] FAIL：${failures.length} 条告警阻断发布（critical 一律修复；high 需台账豁免）`)
    }
    return lines
}

/** 解析 Link 头的 rel="next"。 */
export function parseNextLink(linkHeader) {
    if (!linkHeader || typeof linkHeader !== 'string') {
        return null
    }
    for (const part of linkHeader.split(',')) {
        const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
        if (match) {
            return match[1]
        }
    }
    return null
}

async function readErrorBody(response) {
    try {
        return typeof response.text === 'function' ? await response.text() : ''
    } catch {
        return ''
    }
}

/** HTTP 错误：retryable 区分 429/5xx（可重试）与 4xx（直接失败）。 */
export class HttpError extends Error {
    constructor(status, message, retryable) {
        super(message)
        this.name = 'HttpError'
        this.status = status
        this.retryable = retryable
    }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 单页请求：10s 超时 + 429/5xx 指数退避重试（最多 3 次）；4xx 立即失败。 */
async function requestPage(url, { token, fetchImpl = globalThis.fetch, sleep = defaultSleep } = {}) {
    let lastError = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetchImpl(url, {
                headers: {
                    accept: 'application/vnd.github+json',
                    authorization: `Bearer ${token}`,
                    'x-github-api-version': '2022-11-28',
                    'user-agent': 'dependfix-release-security-gate',
                },
                signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
            })
            if (response.ok) {
                return response
            }
            const body = (await readErrorBody(response)).slice(0, 200)
            const error = new HttpError(
                response.status,
                `HTTP ${response.status} ${response.statusText ?? ''} ${body}`.trim(),
                RETRYABLE_STATUS.has(response.status),
            )
            if (!error.retryable) {
                throw error
            }
            lastError = error
        } catch (error) {
            if (error instanceof HttpError && !error.retryable) {
                throw error
            }
            lastError = error
        }
        if (attempt < MAX_ATTEMPTS) {
            await sleep(RETRY_DELAY_MS * attempt)
        }
    }
    throw lastError ?? new Error(`请求失败：${url}`)
}

/**
 * 逐页拉取告警（GitHub API per_page 上限 100）。
 * 任何非 2xx / 非数组响应 / 超时都抛错，由调用方 fail-closed 处理。
 */
export async function fetchAllPages(url, { token, fetchImpl = globalThis.fetch, sleep = defaultSleep } = {}) {
    const items = []
    let next = url
    for (let page = 0; next; page += 1) {
        if (page >= MAX_PAGES) {
            throw new Error(`分页超过上限 ${MAX_PAGES} 页，拒绝继续拉取：${url}`)
        }
        const response = await requestPage(next, { token, fetchImpl, sleep })
        const data = await response.json()
        if (!Array.isArray(data)) {
            throw new Error(`响应不是数组：${next}`)
        }
        items.push(...data)
        next = parseNextLink(response.headers?.get?.('link') ?? null)
    }
    return items
}

/** 从 https / ssh / git@ 形态的 remote URL 解析 owner/repo。 */
export function parseRepoSlug(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return null
    }
    const trimmed = value.trim().replace(/\.git$/, '')
    const https = trimmed.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+)$/)
    if (https) {
        return `${https[1]}/${https[2]}`
    }
    const ssh = trimmed.match(/^(?:ssh:\/\/)?git@[^/:]+[:/]([^/]+)\/([^/]+)$/)
    if (ssh) {
        return `${ssh[1]}/${ssh[2]}`
    }
    const plain = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/)
    if (plain) {
        return `${plain[1]}/${plain[2]}`
    }
    return null
}

/** 解析仓库 slug：显式参数 > GITHUB_REPOSITORY > git remote origin；失败返回 null。 */
export function resolveRepoSlug({ argValue = null, env = process.env, cwd = repoRoot, execImpl = execFileSync } = {}) {
    const fromArgOrEnv = parseRepoSlug(argValue ?? env.GITHUB_REPOSITORY ?? '')
    if (fromArgOrEnv) {
        return fromArgOrEnv
    }
    try {
        const remote = execImpl('git', ['config', '--get', 'remote.origin.url'], { cwd, encoding: 'utf8' })
        return parseRepoSlug(String(remote).trim())
    } catch {
        return null
    }
}

/**
 * 按告警源解析 token（两者权限面不同，不能假设一个 PAT 同时覆盖）：
 * - Dependabot：专用 secret > GH_PAT（Actions 里 GITHUB_TOKEN 恒 403）> GH_TOKEN > GITHUB_TOKEN
 * - Code Scanning：专用 secret > Actions 的 GITHUB_TOKEN（受 workflow `security-events: read` 控制）
 *   > GH_PAT / GH_TOKEN / GITHUB_TOKEN（本地或 fine-grained 场景）
 */
export function resolveTokens(env = process.env) {
    const dependabot = env.DEPENDABOT_ALERTS_TOKEN || env.SECURITY_ALERTS_TOKEN || env.GH_PAT || env.GH_TOKEN || env.GITHUB_TOKEN || ''
    const codeScanning = env.CODE_SCANNING_TOKEN
        || env.SECURITY_ALERTS_TOKEN
        || (env.GITHUB_ACTIONS === 'true' ? env.GITHUB_TOKEN : '')
        || env.GH_PAT
        || env.GH_TOKEN
        || env.GITHUB_TOKEN
        || ''
    return { dependabot, codeScanning }
}

/** 兼容旧调用：返回 Dependabot 读取 token。 */
export function resolveToken(env = process.env) {
    return resolveTokens(env).dependabot
}

export function permissionHint(tokenError) {
    if (/HTTP (401|403)/.test(tokenError)) {
        return '（Dependabot alerts 需 classic security_events 或 fine-grained Dependabot alerts: read，GITHUB_TOKEN 恒 403；Code Scanning 需 security-events: read / fine-grained Code scanning alerts: read）'
    }
    if (/HTTP 404/.test(tokenError)) {
        return '（404 通常表示该仓库未启用此告警源：Dependabot alerts 或 GitHub Advanced Security / Code Scanning 未开启）'
    }
    return ''
}

/**
 * 门禁主流程（可注入 fetch / readFile，便于单测）。
 * @returns {Promise<{ exitCode: number, lines: string[] }>}
 */
export async function runCheck({
    repo,
    token,
    dependabotToken = token,
    codeScanningToken = token,
    exemptionsPath = EXEMPTIONS_REL,
    cwd = repoRoot,
    fetchImpl = globalThis.fetch,
    readFile = readFileSync,
    apiBase = process.env.GITHUB_API_URL || DEFAULT_API_BASE,
    now = () => new Date(),
} = {}) {
    if (!repo) {
        return withCollectionTime(
            { exitCode: 2, lines: ['[release-security] 无法确定仓库：请设置 GITHUB_REPOSITORY 或传 --repo=owner/repo'] },
            now,
        )
    }
    const missing = []
    if (!dependabotToken) {
        missing.push('Dependabot（GH_PAT / DEPENDABOT_ALERTS_TOKEN）')
    }
    if (!codeScanningToken) {
        missing.push('Code Scanning（GITHUB_TOKEN / CODE_SCANNING_TOKEN）')
    }
    if (missing.length > 0) {
        return withCollectionTime(
            { exitCode: 1, lines: [`[release-security] FAIL：缺少读取告警的 token：${missing.join('、')}`] },
            now,
        )
    }

    let text
    try {
        text = readFile(path.resolve(cwd, exemptionsPath), 'utf8')
    } catch (error) {
        return withCollectionTime(
            { exitCode: 1, lines: [`[release-security] FAIL：无法读取豁免台账 ${exemptionsPath}：${error.message}`] },
            now,
        )
    }
    const { exemptions, errors } = loadExemptions(text)
    if (errors.length > 0) {
        return withCollectionTime({
            exitCode: 1,
            lines: [...errors.map((error) => `[release-security] 台账错误：${error}`), '[release-security] FAIL：豁免台账不合法'],
        }, now)
    }

    let dependabot
    let codeScanning
    try {
        const [openDependabot, dismissedDependabot, openCodeScanning, dismissedCodeScanning] = await Promise.all([
            fetchAllPages(`${apiBase}/repos/${repo}/dependabot/alerts?state=open&per_page=${PER_PAGE}`, { token: dependabotToken, fetchImpl }),
            fetchAllPages(`${apiBase}/repos/${repo}/dependabot/alerts?state=dismissed&per_page=${PER_PAGE}`, { token: dependabotToken, fetchImpl }),
            fetchAllPages(`${apiBase}/repos/${repo}/code-scanning/alerts?state=open&per_page=${PER_PAGE}`, { token: codeScanningToken, fetchImpl }),
            fetchAllPages(`${apiBase}/repos/${repo}/code-scanning/alerts?state=dismissed&per_page=${PER_PAGE}`, { token: codeScanningToken, fetchImpl }),
        ])
        dependabot = [...openDependabot, ...dismissedDependabot]
        codeScanning = [...openCodeScanning, ...dismissedCodeScanning]
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return withCollectionTime(
            { exitCode: 1, lines: [`[release-security] FAIL：拉取告警失败 ${message}${permissionHint(message)}`] },
            now,
        )
    }

    const result = evaluateAlerts({ dependabot, codeScanning, exemptions })
    return withCollectionTime(
        {
            exitCode: result.failures.length > 0 ? 1 : 0,
            lines: formatLines({ repo, result, annotate: process.env.GITHUB_ACTIONS === 'true' }),
        },
        now,
    )
}

export class UsageError extends Error {
    constructor(message) {
        super(message)
        this.name = 'UsageError'
    }
}

/** 参数解析：支持 `--repo=owner/repo` 与 `--repo owner/repo`；未知 / 缺值参数直接报错（退出码 2）。 */
export function parseCli(argv = []) {
    const options = { repo: null, exemptions: null, help: false }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--') {
            continue
        }
        if (arg === '--help' || arg === '-h') {
            options.help = true
            continue
        }
        const match = arg.match(/^--(repo|exemptions)(?:=(.*))?$/s)
        if (!match) {
            throw new UsageError(`未知参数：${arg}`)
        }
        const key = match[1]
        let value = match[2]
        if (value === undefined) {
            value = argv[index + 1]
            if (value === undefined || value.startsWith('-')) {
                throw new UsageError(`--${key} 缺少取值`)
            }
            index += 1
        }
        if (value.trim() === '') {
            throw new UsageError(`--${key} 取值不能为空`)
        }
        options[key] = value
    }
    return options
}

export function printUsage(log = (line) => console.log(line)) {
    log(`用法：node scripts/check-release-security-alerts.mjs [--repo=owner/repo] [--exemptions=path]

环境变量：
  GITHUB_REPOSITORY          GitHub Actions 自动注入的 owner/repo（本地可用 --repo 替代）
  DEPENDABOT_ALERTS_TOKEN    Dependabot alerts 专用 token（优先于 GH_PAT）
  CODE_SCANNING_TOKEN        Code Scanning 专用 token（优先于 Actions 的 GITHUB_TOKEN）
  SECURITY_ALERTS_TOKEN      两个来源共用的专用 token
  GH_PAT                     Dependabot 读取用 PAT；本地也用于 Code Scanning 兜底
  GH_TOKEN / GITHUB_TOKEN    兜底 token（Actions 下 Code Scanning 优先用 GITHUB_TOKEN）

退出码：0 通过 / 1 门禁失败或配置、API 错误 / 2 参数错误`)
}

/** CLI 主流程（依赖可注入，便于单测；退出码语义：0 通过 / 1 门禁失败 / 2 参数错误）。 */
export async function main({
    argv = getCliArgs(),
    env = process.env,
    tokens = resolveTokens(env),
    runCheckImpl = runCheck,
    log = (line) => console.log(line),
    error = (line) => console.error(line),
} = {}) {
    let options
    try {
        options = parseCli(argv)
    } catch (failure) {
        if (failure instanceof UsageError) {
            error(formatCollectionTime())
            error(`[release-security] 参数错误：${failure.message}`)
            printUsage(log)
            return 2
        }
        /* v8 ignore next -- 防御性重抛：parseCli 当前只抛 UsageError（保留以防未来新增错误类型） */
        throw failure
    }
    if (options.help) {
        printUsage(log)
        return 0
    }
    const result = await runCheckImpl({
        repo: resolveRepoSlug({ argValue: options.repo, env }),
        dependabotToken: tokens.dependabot,
        codeScanningToken: tokens.codeScanning,
        exemptionsPath: options.exemptions || EXEMPTIONS_REL,
    })
    for (const line of result.lines) {
        log(line)
    }
    return result.exitCode
}

/* v8 ignore start -- CLI 入口守卫：进程级副作用不可在单测内触发（与其它脚本同惯例） */
if (isDirectExecution(import.meta.url)) {
    main()
        .then((code) => {
            process.exitCode = code
        })
        .catch((failure) => {
            console.error(formatCollectionTime())
            console.error(`[release-security] FAIL：${failure instanceof Error ? failure.message : String(failure)}`)
            process.exitCode = 1
        })
}
/* v8 ignore stop */
