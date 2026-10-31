/**
 * pr-health.mjs —— G8 产品指标采集：近 N 个 PR 的 CI 绿率 / 人工介入率 / 误关率
 *
 * 口径（与 [1.0 就绪度台账 §2.1](../../docs/design/governance/release-1.0-readiness.md) 一致，改动须同步两侧与夹具）：
 * - **窗口**：`--days`（默认 30）内创建的 PR，按创建时间倒序取前 `--limit`（默认 30，上界 1000）个；
 *   分母 = `window.prCount` = `min(窗口内 PR 数, limit)`。
 * - **CI 绿率**：head 提交的 check runs 中至少一个 `success`、且没有失败 / 未完成 → 绿。
 *   无 check run（`none`）与全为 neutral / skipped（`neutral`）都不算绿，但单独计数披露。
 * - **人工介入率**：PR 上存在非机器人作者的 commit 或 review。机器人判定 = actor type 为 `Bot`、
 *   登录名以 `[bot]` 结尾、或在 `BOT_LOGINS` 名单内；未关联到账号的 commit 按人工处理，另给 `humanAuthored` 便于解读。
 * - **误关率**：关闭后被人重开（含重开后仍 open / 随后合入）、或关闭未合并后同一 head 分支（base 相同）的
 *   新 PR 在其关闭之后合入 → 记一次误关。分母同样取窗口内 PR 数（与 G8「近 30 个 PR」一致），
 *   另给 `closedUnmerged`（曾关闭未合并，含重开后合入）/ `closureRate` 供诊断。
 *
 * 取数两条路径：
 * - `--source=api`（默认）：GitHub REST API，需要 token（`--token` / `GITHUB_TOKEN` / `GH_PAT`）。
 *   **无 token 直接报错**，不降级为「0 值读数」。
 * - `--source=file --input=<path>`：读取同结构的本地快照（离线复算 / 夹具回归），不需要网络与 token。
 *
 * 用法：
 *   GITHUB_TOKEN=xxx pnpm metrics:pr-health --repo=dependfix/dependfix --out-dir=artifacts/metrics
 *   pnpm metrics:pr-health --source=file --input=scripts/metrics/__fixtures__/pr-health.sample.json --json
 *
 * 退出码：0 成功 / 1 取数或写文件失败（含缺少 token、窗口内 0 个 PR、快照文件不可读）/ 2 参数错误
 * （未知参数、缺 repo / 缺 --input、--limit 超上界）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { isDirectExecution, parseCliOptions } from '../shared/cli.mjs'

/** 报告 JSON 结构版本（字段增删须升版本并在台账记口径变更）。 */
export const SCHEMA_VERSION = 1
export const DEFAULT_WINDOW_DAYS = 30
export const DEFAULT_LIMIT = 30
export const DEFAULT_API_BASE = 'https://api.github.com'

const DAY_MS = 24 * 60 * 60 * 1000
/** `--limit` 上界（与列表翻页上限 MAX_LIST_PAGES × PER_PAGE 对齐，避免静默截断）。 */
export const MAX_LIMIT = 1000
const PER_PAGE = 100
const MAX_LIST_PAGES = 10
const MAX_EVENT_PAGES = 5
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 200
const REQUEST_TIMEOUT_MS = 15_000

/** 视为失败的 check 结论（与 core/report 的归因口径同源：未知不算通过）。 */
export const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required', 'startup_failure', 'cancelled', 'stale', 'error'])
/** 中性（既不算通过也不算失败）的 check 结论。 */
export const NEUTRAL_CONCLUSIONS = new Set(['neutral', 'skipped'])

/** 已知机器人登录名（不带 `[bot]` 后缀形态，如 GitHub App 在部分字段返回纯登录名）。 */
export const BOT_LOGINS = new Set([
    'dependabot',
    'dependabot-preview',
    'renovate',
    'github-actions',
    'dependfix',
    'dependfix-bot',
])

/** 参数错误（退出码 2）；运行期错误用普通 Error（退出码 1）。 */
export class CliUsageError extends Error {}

const parsePositiveInt = (raw) => {
    const value = Number(raw)
    if (!Number.isInteger(value) || value <= 0) {
        throw new CliUsageError(`需要正整数，收到：${raw}`)
    }
    return value
}

const parseLimit = (raw) => {
    const value = parsePositiveInt(raw)
    if (value > MAX_LIMIT) {
        throw new CliUsageError(`--limit 上界为 ${MAX_LIMIT}（超出会静默截断），收到：${raw}`)
    }
    return value
}

/** 解析 CLI 参数（纯函数）。未知参数由 `parseCliOptions` 抛出。 */
export function parseCli(argv = process.argv) {
    return parseCliOptions(argv, {
        defaults: {
            repo: null,
            days: DEFAULT_WINDOW_DAYS,
            limit: DEFAULT_LIMIT,
            source: 'api',
            input: null,
            outDir: null,
            json: false,
            allowEmpty: false,
            now: null,
            token: null,
        },
        flags: {
            '--json': { key: 'json', value: true },
            '--allow-empty': { key: 'allowEmpty', value: true },
            '--help': { key: 'help', value: true },
        },
        values: {
            '--repo': { key: 'repo' },
            '--days': { key: 'days', parse: parsePositiveInt },
            '--limit': { key: 'limit', parse: parseLimit },
            '--source': { key: 'source', allowedValues: ['api', 'file'] },
            '--input': { key: 'input' },
            '--out-dir': { key: 'outDir' },
            '--now': { key: 'now' },
            '--token': { key: 'token' },
        },
        allowUnknown: false,
    })
}

/** 机器人判定：type=Bot / `[bot]` 后缀 / 已知名单（大小写不敏感）。 */
export function isBotActor(actor, bots = BOT_LOGINS) {
    if (!actor) {
        return false
    }
    if (String(actor.type ?? '').toLowerCase() === 'bot') {
        return true
    }
    const login = String(actor.login ?? '').toLowerCase()
    if (!login) {
        return false
    }
    return login.endsWith('[bot]') || bots.has(login)
}

const normalizeConclusion = (conclusion) => String(conclusion ?? 'pending').toLowerCase()

/**
 * 归类一个 PR 的 CI 状态。
 *
 * - `green`：至少一个 `success` 且无失败 / 未完成
 * - `red`：存在失败结论
 * - `pending`：存在未完成结论且无失败
 * - `neutral`：全部为 neutral / skipped（有 check 但没有任何 success）
 * - `none`：没有 check run
 */
export function classifyCi(checks = []) {
    if (!Array.isArray(checks) || checks.length === 0) {
        return 'none'
    }
    let hasSuccess = false
    let hasPending = false
    for (const check of checks) {
        const conclusion = normalizeConclusion(check?.conclusion)
        if (FAILED_CONCLUSIONS.has(conclusion)) {
            return 'red'
        }
        if (conclusion === 'success') {
            hasSuccess = true
        } else if (!NEUTRAL_CONCLUSIONS.has(conclusion)) {
            // 未完成 / 未识别结论一律按未完成处理（fail-closed：未知不得当作通过或中性）
            hasPending = true
        }
    }
    if (hasPending) {
        return 'pending'
    }
    return hasSuccess ? 'green' : 'neutral'
}

/** PR 上是否存在非机器人 commit / review。 */
export function hasHumanIntervention(pull, bots = BOT_LOGINS) {
    const commits = Array.isArray(pull?.commits) ? pull.commits : []
    if (commits.some((commit) => !isBotActor(commit?.author, bots))) {
        return true
    }
    const reviews = Array.isArray(pull?.reviews) ? pull.reviews : []
    return reviews.some((review) => !isBotActor(review?.author, bots))
}

/**
 * 误关判定，满足任一即记一次：
 * ① 关闭后被人重开（`reopened`）——重开后可能仍是 open，也可能随后合入，两种都算「当初关错了」；
 * ② 关闭且未合并，同一 head 分支（base 相同）的另一个 PR 在其关闭之后合入（修复以新 PR 再落地）。
 *
 * 时间基准（仅「再落地」分支）：`closedAt` 缺失时回退 `createdAt`；两者都缺或 `mergedAt` 不可解析时
 * **不计入**（宁可少算也不把发布日期上的误关率抬高）。缺 base 信息时退化为只比 head 分支。
 */
export function isFalseClose(pull, pulls = []) {
    if (!pull) {
        return false
    }
    if (pull.reopened === true) {
        return true
    }
    if (pull.state !== 'closed' || pull.merged !== false) {
        return false
    }
    const headRef = pull.headRef
    if (!headRef) {
        return false
    }
    const closedAt = Date.parse(pull.closedAt ?? '')
    const fallbackAt = Date.parse(pull.createdAt ?? '')
    const closedTime = Number.isFinite(closedAt) ? closedAt : fallbackAt
    if (!Number.isFinite(closedTime)) {
        return false
    }
    return pulls.some((other) => {
        if (!other || other.number === pull.number || other.merged !== true || other.headRef !== headRef) {
            return false
        }
        if (pull.baseRef && other.baseRef && other.baseRef !== pull.baseRef) {
            return false
        }
        const mergedAt = Date.parse(other.mergedAt ?? '')
        return Number.isFinite(mergedAt) && mergedAt >= closedTime
    })
}

const rate = (numerator, denominator) => (denominator > 0
    ? Math.round((numerator / denominator) * 10_000) / 10_000
    : null)

/**
 * 计算三指标（纯函数）。
 *
 * @param {{ pulls?: unknown[] }} snapshot 归一化快照（`pulls` 项字段见 {@link normalizePull}）
 * @param {{ now?: Date|string, windowDays?: number, limit?: number, bots?: Set<string> }} [options]
 */
export function computePrHealth(snapshot, options = {}) {
    const {
        now = new Date(),
        windowDays = DEFAULT_WINDOW_DAYS,
        limit = DEFAULT_LIMIT,
        bots = BOT_LOGINS,
    } = options
    const sourcePulls = Array.isArray(snapshot?.pulls) ? snapshot.pulls : null
    if (!sourcePulls) {
        throw new Error('快照缺少 pulls 数组（--source=file 的输入须为 pr-health 结构）')
    }
    const until = now instanceof Date ? now : new Date(now)
    if (Number.isNaN(until.getTime())) {
        throw new CliUsageError(`--now 不是合法时间：${now}`)
    }
    const since = new Date(until.getTime() - windowDays * DAY_MS)

    const inWindow = sourcePulls
        .filter((pull) => {
            const createdAt = Date.parse(pull?.createdAt ?? '')
            return Number.isFinite(createdAt) && createdAt >= since.getTime() && createdAt <= until.getTime()
        })
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    const selected = inWindow.slice(0, limit)

    const rows = selected.map((pull) => ({
        number: pull.number,
        state: pull.state,
        merged: pull.merged === true,
        reopened: pull.reopened === true,
        ci: classifyCi(pull.checks),
        intervention: hasHumanIntervention(pull, bots),
        falseClose: isFalseClose(pull, sourcePulls),
    }))

    const prCount = rows.length
    const ciBreakdown = { green: 0, red: 0, pending: 0, neutral: 0, none: 0 }
    for (const row of rows) {
        ciBreakdown[row.ci] += 1
    }
    const interventionCount = rows.filter((row) => row.intervention).length
    const falseCloseRows = rows.filter((row) => row.falseClose)
    // 「曾关闭未合并」= 当前关闭未合并，或曾被关闭后重开（含重开后合入）；保证误关分子是它的子集
    const closedUnmerged = rows.filter((row) => row.reopened || (row.state === 'closed' && !row.merged)).length

    return {
        schemaVersion: SCHEMA_VERSION,
        repo: snapshot.repo ?? null,
        generatedAt: until.toISOString(),
        window: {
            days: windowDays,
            limit,
            since: since.toISOString(),
            until: until.toISOString(),
            prCount,
            available: inWindow.length,
            truncated: inWindow.length > limit,
        },
        metrics: {
            ciGreen: {
                numerator: ciBreakdown.green,
                denominator: prCount,
                rate: rate(ciBreakdown.green, prCount),
                breakdown: ciBreakdown,
            },
            humanIntervention: {
                numerator: interventionCount,
                denominator: prCount,
                rate: rate(interventionCount, prCount),
                humanAuthored: rows.filter((row) => {
                    const pull = selected.find((item) => item.number === row.number)
                    return !isBotActor(pull?.author, bots)
                }).length,
            },
            falseClose: {
                numerator: falseCloseRows.length,
                denominator: prCount,
                rate: rate(falseCloseRows.length, prCount),
                closedUnmerged,
                closureRate: rate(falseCloseRows.length, closedUnmerged),
                reopened: falseCloseRows.filter((row) => row.reopened).length,
                relanded: falseCloseRows.filter((row) => !row.reopened).length,
            },
        },
        pulls: rows,
    }
}

const formatPercent = (value) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`)

/** 渲染 Markdown 报告（含口径说明，便于直接贴发布说明）。 */
export function formatMarkdown(report) {
    const { window: win, metrics } = report
    const lines = [
        '# PR 健康度（G8 产品指标）',
        '',
        `- 仓库：\`${report.repo ?? '(未声明)'}\``,
        `- 窗口：最近 ${win.days} 天（${win.since} → ${win.until}），按创建时间倒序取前 ${win.limit} 个`,
        `- 分母：计入分母的 PR 数 = ${win.prCount}（窗口内共 ${win.available} 个，按创建时间倒序取前 ${win.limit} 个）`,
        '',
        '| 指标 | 分子 | 分母 | 占比 |',
        '|:--|--:|--:|--:|',
        `| CI 绿率 | ${metrics.ciGreen.numerator} | ${metrics.ciGreen.denominator} | ${formatPercent(metrics.ciGreen.rate)} |`,
        `| 人工介入率 | ${metrics.humanIntervention.numerator} | ${metrics.humanIntervention.denominator} | ${formatPercent(metrics.humanIntervention.rate)} |`,
        `| 误关率 | ${metrics.falseClose.numerator} | ${metrics.falseClose.denominator} | ${formatPercent(metrics.falseClose.rate)} |`,
        '',
        '## 口径',
        '',
        `- CI 绿：head 提交的 check run 至少一个 success 且无失败 / 未完成。分档计数 green ${metrics.ciGreen.breakdown.green} / red ${metrics.ciGreen.breakdown.red} / pending ${metrics.ciGreen.breakdown.pending} / neutral ${metrics.ciGreen.breakdown.neutral} / 无 check ${metrics.ciGreen.breakdown.none}（后三档不算绿）。`,
        `- 人工介入：PR 上出现非机器人作者的 commit 或 review（机器人 = actor type \`Bot\` / 登录名 \`[bot]\` 后缀 / 已知名单；未关联到账号的 commit 按人工处理）。由人创建的 PR 通常自带人工 commit 而随之计入；humanAuthored = ${metrics.humanIntervention.humanAuthored} 单独披露（不进分子）。`,
        `- 误关：关闭后被人重开（${metrics.falseClose.reopened}，含重开后仍 open / 随后合入），或关闭未合并后同一 head 分支（base 相同）的新 PR 其后合入（${metrics.falseClose.relanded}）。曾关闭未合并数 = ${metrics.falseClose.closedUnmerged}，其中误关占比 = ${formatPercent(metrics.falseClose.closureRate)}。`,
        '',
        '## 明细',
        '',
        '| PR | 状态 | CI | 人工介入 | 误关 |',
        '|--:|:--|:--|:--|:--|',
        ...report.pulls.map((row) => `| #${row.number} | ${row.merged ? 'merged' : row.state} | ${row.ci} | ${row.intervention ? 'yes' : 'no'} | ${row.falseClose ? 'yes' : 'no'} |`),
        '',
    ]
    return lines.join('\n')
}

const normalizeActor = (actor) => (actor && actor.login
    ? { login: actor.login, type: actor.type ?? null }
    : null)

/** 归一化 GitHub API 的 PR 对象（与 `--source=file` 的快照结构一致；对已归一化输入幂等）。 */
export function normalizePull({ pull, commits = [], reviews = [], checks = [], events = [] }) {
    const reopened = events.some((event) => event?.event === 'reopened')
    return {
        number: pull.number,
        state: pull.state,
        merged: typeof pull.merged === 'boolean' ? pull.merged : Boolean(pull.merged_at),
        createdAt: pull.created_at,
        closedAt: pull.closed_at ?? null,
        mergedAt: pull.merged_at ?? null,
        headSha: pull.head?.sha ?? null,
        headRef: pull.head?.ref ?? null,
        baseRef: pull.base?.ref ?? null,
        author: normalizeActor(pull.user),
        commits: commits.map((commit) => ({
            sha: commit.sha,
            committedAt: commit.committedAt ?? commit.commit?.author?.date ?? null,
            author: normalizeActor(commit.author),
        })),
        reviews: reviews.map((review) => ({
            state: review.state,
            submittedAt: review.submittedAt ?? review.submitted_at ?? null,
            author: normalizeActor(review.author ?? review.user),
        })),
        checks: checks.map((check) => ({ name: check.name, conclusion: check.conclusion })),
        reopened,
    }
}

const defaultSleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms)
})

/** 解析 `Link` 头的 `rel="next"`。 */
export function parseNextLink(linkHeader) {
    if (!linkHeader) {
        return null
    }
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(linkHeader)
    return match ? match[1] : null
}

const githubHeaders = (token) => ({
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'dependfix-pr-health',
    'x-github-api-version': '2022-11-28',
})

/**
 * 单次 API 请求（带重试；401 / 403 / 404 直接失败并保留状态码）。
 *
 * @returns {Promise<{ data: unknown, link: string|null }>}
 */
export async function requestJson(url, { token, fetchImpl = globalThis.fetch, sleep = defaultSleep } = {}) {
    let lastError = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let response
        try {
            response = await fetchImpl(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
        } catch (error) {
            lastError = new Error(`请求失败：${url}（${error instanceof Error ? error.message : String(error)}）`)
            if (attempt < MAX_ATTEMPTS) {
                await sleep(RETRY_DELAY_MS * attempt)
                continue
            }
            throw lastError
        }
        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
            await sleep(RETRY_DELAY_MS * attempt)
            continue
        }
        if (!response.ok) {
            const hint = response.status === 401 || response.status === 403
                ? '（token 无效 / 权限不足 / 触发限流）'
                : ''
            throw new Error(`GitHub API ${response.status} ${response.statusText}：${url}${hint}`)
        }
        return { data: await response.json(), link: response.headers.get('link') }
    }
    throw lastError ?? new Error(`请求失败：${url}`)
}

/** 翻页拉取数组响应（遇到空页 / 无 next 即停）。 */
export async function fetchAllPages(url, { token, fetchImpl, sleep, maxPages = MAX_LIST_PAGES } = {}) {
    const items = []
    let next = url
    for (let page = 0; page < maxPages && next; page += 1) {
        const { data, link } = await requestJson(next, { token, fetchImpl, sleep })
        if (!Array.isArray(data)) {
            throw new Error(`GitHub API 响应非数组：${next}`)
        }
        items.push(...data)
        next = parseNextLink(link)
    }
    return items
}

/**
 * 拉取 head 提交的 check runs。
 *
 * 该端点返回 `{ total_count, check_runs: [...] }` 对象而非数组（与列表端点不同），
 * 形状不符时直接失败——否则会把「没取到 CI 结果」误算成「无 check」。
 */
export async function fetchCheckRuns(url, { token, fetchImpl, sleep } = {}) {
    const { data } = await requestJson(url, { token, fetchImpl, sleep })
    const runs = data?.check_runs
    if (!Array.isArray(runs)) {
        throw new Error(`GitHub API check-runs 响应形状异常（缺少 check_runs 数组）：${url}`)
    }
    return runs
}

/** 从 API 采集快照（PR 列表 + 每 PR 的 commits / reviews / check runs / 事件）。 */
export async function fetchSnapshot({
    repo,
    token,
    days = DEFAULT_WINDOW_DAYS,
    limit = DEFAULT_LIMIT,
    now = new Date(),
    apiBase = DEFAULT_API_BASE,
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
}) {
    if (!token) {
        throw new Error('缺少 GitHub token：--source=api 需要 --token / GITHUB_TOKEN / GH_PAT（无 token 不返回 0 值读数，可改用 --source=file）')
    }
    const since = new Date(now.getTime() - days * DAY_MS)
    const listUrl = `${apiBase}/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=${PER_PAGE}`
    const pulls = []
    let next = listUrl
    for (let page = 0; page < MAX_LIST_PAGES && next; page += 1) {
        const { data, link } = await requestJson(next, { token, fetchImpl, sleep })
        if (!Array.isArray(data)) {
            throw new Error(`GitHub API 响应非数组：${next}`)
        }
        for (const pull of data) {
            const createdAt = Date.parse(pull?.created_at ?? '')
            if (!Number.isFinite(createdAt) || createdAt < since.getTime()) {
                continue
            }
            pulls.push(pull)
            if (pulls.length >= limit) {
                break
            }
        }
        const last = data.at(-1)
        const reachedWindow = last && Date.parse(last.created_at ?? '') < since.getTime()
        next = pulls.length >= limit || reachedWindow ? null : parseNextLink(link)
    }

    const normalized = []
    for (const pull of pulls) {
        const base = `${apiBase}/repos/${repo}`
        const commits = await fetchAllPages(`${base}/pulls/${pull.number}/commits?per_page=${PER_PAGE}`, { token, fetchImpl, sleep })
        const reviews = await fetchAllPages(`${base}/pulls/${pull.number}/reviews?per_page=${PER_PAGE}`, { token, fetchImpl, sleep })
        const checks = pull.head?.sha
            ? await fetchCheckRuns(`${base}/commits/${pull.head.sha}/check-runs?per_page=${PER_PAGE}`, { token, fetchImpl, sleep })
            : []
        const events = await fetchAllPages(`${base}/issues/${pull.number}/events?per_page=${PER_PAGE}`, { token, fetchImpl, sleep, maxPages: MAX_EVENT_PAGES })
        normalized.push(normalizePull({
            pull,
            commits,
            reviews,
            checks: checks.filter((check) => check?.name),
            events,
        }))
    }
    return { repo, generatedAt: now.toISOString(), pulls: normalized }
}

/** 读取本地快照（`--source=file`）。 */
export function loadSnapshot(inputPath, { repo = null } = {}) {
    if (!inputPath) {
        throw new CliUsageError('--source=file 需要 --input=<snapshot.json>')
    }
    let parsed
    try {
        parsed = JSON.parse(readFileSync(inputPath, 'utf8'))
    } catch (error) {
        // 文件不可读 / JSON 非法属于运行期失败（退出码 1），与「参数写错」区分
        throw new Error(`无法读取快照 ${inputPath}：${error instanceof Error ? error.message : String(error)}`)
    }
    if (!parsed || !Array.isArray(parsed.pulls)) {
        throw new CliUsageError(`快照 ${inputPath} 缺少 pulls 数组（应是 pr-health 的 snapshot 结构，而非报告 JSON）`)
    }
    return {
        ...parsed,
        repo: parsed.repo ?? repo,
        pulls: parsed.pulls.map((pull, index) => normalizePull({
            pull: validateSnapshotPull(pull, index, inputPath),
            commits: pull.commits ?? [],
            reviews: pull.reviews ?? [],
            checks: pull.checks ?? [],
            events: pull.reopened === true ? [{ event: 'reopened' }] : [],
        })),
    }
}

/**
 * 校验 `--source=file` 的单个 PR 条目：缺关键字段直接失败，不静默归一为空。
 *
 * `createdAt` 必须可解析（否则窗口会静默变空 → 0 读数）；已关闭的 PR 必须显式给出
 * `merged` 布尔或可解析的 `mergedAt`（否则「已合入」会被读成「关闭未合并」→ 假误关）。
 */
const validateSnapshotPull = (pull, index, inputPath) => {
    const label = `${inputPath} 的 pulls[${index}]`
    if (!pull || typeof pull !== 'object') {
        throw new CliUsageError(`${label} 不是对象`)
    }
    if (!Number.isInteger(pull.number)) {
        throw new CliUsageError(`${label} 缺 number（整数）`)
    }
    if (!Number.isFinite(Date.parse(pull.createdAt ?? ''))) {
        throw new CliUsageError(`${label}（#${pull.number}）的 createdAt 缺失或非法（需 ISO 时间）：${pull.createdAt}`)
    }
    if (pull.state !== 'open' && pull.state !== 'closed') {
        throw new CliUsageError(`${label}（#${pull.number}）的 state 必须为 open / closed，收到：${pull.state}`)
    }
    let merged = pull.merged
    if (typeof merged !== 'boolean') {
        if (Number.isFinite(Date.parse(pull.mergedAt ?? ''))) {
            merged = true
        } else if (pull.state === 'open') {
            merged = false
        } else {
            throw new CliUsageError(`${label}（#${pull.number}）缺 merged 布尔：已关闭的 PR 必须显式给出，或提供 mergedAt`)
        }
    }
    return {
        number: pull.number,
        state: pull.state,
        merged,
        created_at: pull.createdAt,
        closed_at: pull.closedAt ?? null,
        merged_at: pull.mergedAt ?? null,
        head: { sha: pull.headSha ?? null, ref: pull.headRef ?? null },
        base: { ref: pull.baseRef ?? null },
        user: pull.author ?? null,
    }
}


const resolveRepo = ({ repo, env }) => {
    const value = repo ?? env.GITHUB_REPOSITORY
    if (!value) {
        throw new CliUsageError('缺少仓库：用 --repo=owner/name 或设置 GITHUB_REPOSITORY')
    }
    return value
}

const resolveToken = ({ token, env }) => token ?? env.GITHUB_TOKEN ?? env.GH_PAT ?? null

const HELP_TEXT = `
pr-health：G8 产品指标采集（CI 绿率 / 人工介入率 / 误关率）

用法：
  pnpm metrics:pr-health --repo=owner/name [--days=30] [--limit=30] [--out-dir=artifacts/metrics]
  pnpm metrics:pr-health --source=file --input=<snapshot.json> [--json]

参数：
  --repo=<owner/name>  必填（或 GITHUB_REPOSITORY）。目标仓库
  --days=<n>           窗口天数，默认 30
  --limit=<n>          窗口内取最近 n 个 PR，默认 30（即 G8「近 30 个 PR」）
  --source=api|file    取数路径，默认 api
  --input=<path>       --source=file 的快照路径
  --out-dir=<dir>      写出 pr-health-<date>.md / .json / .snapshot.json（快照可回灌 --source=file）
  --token=<token>      GitHub token；优先用 env（GITHUB_TOKEN / GH_PAT），命令行会留在 shell history
  --now=<ISO>          计算窗口的基准时间（默认当前时间）
  --json               在标准输出打印 JSON（写文件时同样写 .json）
  --allow-empty        窗口内 0 个 PR 时仍产出报告（默认失败，避免 0 值读数）
  --help               显示帮助
`.trim()

/**
 * 主流程（可注入依赖，便于单测）。
 *
 * @returns {Promise<number>} 退出码
 */
export async function main(argv = process.argv, { env = process.env, fetchImpl = globalThis.fetch, now = new Date(), log = console.log, error = console.error } = {}) {
    let options
    try {
        options = parseCli(argv)
    } catch (failure) {
        error(`[pr-health] ${failure instanceof Error ? failure.message : String(failure)}`)
        return 2
    }
    if (options.help) {
        log(HELP_TEXT)
        return 0
    }

    try {
        const repo = options.source === 'file' ? (options.repo ?? env.GITHUB_REPOSITORY ?? null) : resolveRepo({ repo: options.repo, env })
        const referenceNow = options.now ? new Date(options.now) : now
        const snapshot = options.source === 'file'
            ? loadSnapshot(options.input, { repo })
            : await fetchSnapshot({
                repo,
                token: resolveToken({ token: options.token, env }),
                days: options.days,
                limit: options.limit,
                now: referenceNow,
                fetchImpl,
            })
        const report = computePrHealth(snapshot, { now: referenceNow, windowDays: options.days, limit: options.limit })
        if (report.window.available === 0 && !options.allowEmpty) {
            // 空窗口多半是 repo / days 取数不对：宁可失败，也不输出「0% 绿率」这种假读数
            throw new Error('窗口内没有 PR（检查 --repo / --days，或数据尚未产生）；确认为空窗口请加 --allow-empty')
        }
        const markdown = formatMarkdown(report)

        if (options.outDir) {
            mkdirSync(options.outDir, { recursive: true })
            const stamp = report.generatedAt.slice(0, 10).replaceAll('-', '')
            const markdownPath = path.join(options.outDir, `pr-health-${stamp}.md`)
            const jsonPath = path.join(options.outDir, `pr-health-${stamp}.json`)
            // 归一化快照同批落盘：真实读数的「离线复算」才成立（报告 JSON 是降维行，不能回灌）
            const snapshotPath = path.join(options.outDir, `pr-health-${stamp}.snapshot.json`)
            writeFileSync(markdownPath, markdown)
            writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
            writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`)
            log(`[pr-health] 已写出 ${markdownPath} / ${jsonPath} / ${snapshotPath}`)
        }
        if (options.json || !options.outDir) {
            log(options.json ? JSON.stringify(report, null, 2) : markdown)
        }
        return 0
    } catch (failure) {
        error(`[pr-health] ${failure instanceof Error ? failure.message : String(failure)}`)
        return failure instanceof CliUsageError ? 2 : 1
    }
}

/* v8 ignore start -- CLI 入口守卫：进程级副作用不可在单测内触发（与其它脚本同惯例） */
if (isDirectExecution(import.meta.url)) {
    main()
        .then((code) => {
            process.exitCode = code
        })
        .catch((failure) => {
            console.error(`[pr-health] 未捕获错误：${failure instanceof Error ? failure.message : String(failure)}`)
            process.exitCode = 1
        })
}
/* v8 ignore stop */
