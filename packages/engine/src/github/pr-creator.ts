import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { Octokit } from '@octokit/rest'
import {
    type FixAction,
    type RunResult,
    collectCodeScanningSuggestions,
    isAlertFixedByActions,
} from '@dependfix/core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreatePullRequestParams {
    /** 已认证的 Octokit 实例 */
    octokit: Octokit
    /** 仓库 owner */
    owner: string
    /** 仓库名 */
    repo: string
    /** 修复分支名 */
    headBranch: string
    /** 目标分支（默认 master/main，从 API 获取） */
    baseBranch: string
    /** PR 标题 */
    title: string
    /** PR 内容（Markdown） */
    body: string
}

export interface PullRequestResult {
    /** PR 编号 */
    number: number
    /** PR HTML URL */
    htmlUrl: string
}

export interface FixBranchResult {
    /** 分支名 */
    branchName: string
    /** 是否为新创建 */
    created: boolean
}

/** dependfix 自动修复 PR 的公开信息（用于查重/取代判定） */
export interface DependfixOpenPR {
    /** PR 编号 */
    number: number
    /** PR HTML URL */
    htmlUrl: string
    /** PR head 分支名 */
    headRef: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOT_NAME = 'dependfix[bot]'
const BOT_EMAIL = 'dependfix[bot]@users.noreply.github.com'

/** 自动修复分支统一前缀（分支名 = 前缀 + 内容指纹 8 位） */
const BRANCH_PREFIX = 'dependfix/auto-fix-'

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * 计算修复内容指纹（sha256 前 8 位）。
 *
 * 指纹基于**结构化修复结果**而非 git diff：
 * - 成功升级集：`pkg@toVersion@manifest`（排序拼接；manifest 区分根升级与
 *   成员升级——成员级修复后，同包根/成员升级是不同修复内容，
 *   若指纹不含 manifest 维度，根升级 PR 会错误 skip 后续成员升级）
 * - 修复失败集：失败包名@manifest（排序拼接）
 * - lockfile 修复状态（成功/失败）
 *
 * 同告警集 → 同修复结果 → 同指纹 → 幂等跳过；
 * 内容变化（升级集/失败集/锁文件修复变化）→ 指纹变化 → 关旧开新。
 * 不用 diff hash 是因为 pnpm 版本等非确定性因素会使锁文件内容漂移，
 * 导致"告警没变但指纹变"。
 */
export function computeFixFingerprint(actions: FixAction[]): string {
    // 排除 PR 记录 action（target 为 "PR #N"）与 AI 建议类 noOp（建议非真实升级，计入指纹会
    // 造成"开关切换/建议交替"时指纹漂移与关旧开新噪音；口径与 isPackageUpgradeAction 一致）
    const isUpgrade = (a: FixAction): boolean => a.type === 'dependency-upgrade'
        && !!a.target
        && !a.target.startsWith('PR #')
        && !a.noOp

    const upgrades = actions
        .filter((a) => isUpgrade(a) && a.success && a.toVersion)
        .map((a) => `${a.target}@${a.toVersion}@${a.filePath ?? 'root'}`)
        .sort()

    const failures = actions
        .filter((a) => isUpgrade(a) && !a.success)
        .map((a) => `${a.target}@${a.filePath ?? 'root'}`)
        .sort()

    const repairs = actions
        .filter((a) => a.type === 'lockfile-repair')
        .map((a) => `${a.target}:${a.success}`)
        .sort()

    // code-scanning 模板修复：target(ruleId)+success+diff（diff 含文件路径，内容变化 → 指纹变化）
    const codeScanningFixes = actions
        .filter((a) => a.type === 'code-scanning-fix')
        .map((a) => `${a.target}:${a.success}:${a.diff ?? ''}`)
        .sort()

    const payload = JSON.stringify([upgrades, failures, repairs, codeScanningFixes])
    return createHash('sha256').update(payload).digest('hex').slice(0, 8)
}

/**
 * 从分支名提取内容指纹（`dependfix/auto-fix-{fp8}` → `{fp8}`）。
 * 指纹格式为 8 位 hex；分支名不含 `-` 后的内容、前缀不匹配或格式不合法时返回 null
 * （如旧版 runId 分支，会被 supersede）。
 */
export function extractFingerprintFromBranch(branchName: string): string | null {
    if (!branchName.startsWith(BRANCH_PREFIX)) {
        return null
    }
    const fingerprint = branchName.slice(BRANCH_PREFIX.length)
    return /^[0-9a-f]{8}$/.test(fingerprint) ? fingerprint : null
}

/** fix-and-pr 去重决策结果 */
export interface FixAndPrPlan {
    /** skip = 已有同内容 PR，不重复提交；create = 需要新建 PR */
    action: 'skip' | 'create'
    /** action=skip 时命中的同内容 PR */
    sameContentPR?: DependfixOpenPR
    /** 内容不同、需要关闭（supersede）的旧 PR 列表 */
    supersedePRs: DependfixOpenPR[]
}

/**
 * 计算 fix-and-pr 去重决策：
 * - 存在同指纹 open PR → skip（仅需关闭其余异指纹 PR）
 * - 否则 → create（关闭全部旧 PR，先建新后关旧由调用方保证）
 */
export function computeFixAndPrPlan(existingPRs: DependfixOpenPR[], fingerprint: string): FixAndPrPlan {
    const sameContentPR = existingPRs.find(
        (pr) => extractFingerprintFromBranch(pr.headRef) === fingerprint,
    )

    if (sameContentPR) {
        return {
            action: 'skip',
            sameContentPR,
            supersedePRs: existingPRs.filter((pr) => pr !== sameContentPR),
        }
    }

    return { action: 'create', supersedePRs: existingPRs }
}

// ---------------------------------------------------------------------------
// Git Operations
// ---------------------------------------------------------------------------

/**
 * 在工作目录创建修复分支。
 *
 * - 分支名由调用方传入（分支名为 `dependfix/auto-fix-{内容指纹}`，不再依赖 runId）
 * - 如果分支已存在（如重跑），切换到该分支
 *
 * @returns 分支名和是否为新创建
 */
export function createFixBranch(branchName: string, workDir: string): FixBranchResult {
    const exists = branchExists(branchName, workDir)
    if (exists) {
        execFileSync('git', ['checkout', branchName], { cwd: workDir, stdio: 'pipe' })
        return { branchName, created: false }
    }

    execFileSync('git', ['checkout', '-b', branchName], { cwd: workDir, stdio: 'pipe' })
    return { branchName, created: true }
}

/**
 * 暂存所有变更并提交。
 * 自动设置 git user.name / user.email（如未设置）。
 * 使用 `execFileSync` 参数数组形式（不经 shell），保证多行 commit message
 * 与 UTF-8 字符（如 →）在 Windows/Linux 双平台传递一致。
 */
export function stageAndCommit(message: string, workDir: string): void {
    ensureGitConfig(workDir)
    execSync('git add .', { cwd: workDir, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', message], { cwd: workDir, stdio: 'pipe' })
}

/**
 * 推送分支到远程 origin。
 */
export function pushBranch(branchName: string, workDir: string): void {
    execFileSync('git', ['push', 'origin', branchName], { cwd: workDir, stdio: 'pipe' })
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

/**
 * 查找目标仓库中所有 open 状态的 dependfix 自动修复 PR。
 *
 * GitHub 的 `pulls.list` 的 `head` 参数不支持通配符，因此拉取 open PR 列表后
 * 按 head 分支前缀 `dependfix/auto-fix-` 过滤。假设 PR 数量不多（单页 100 足够），
 * 未来 PR 数量增大时可引入 label 索引（backlog 已登记演进项）。
 */
export async function findDependfixOpenPR(
    octokit: Octokit,
    owner: string,
    repo: string,
): Promise<DependfixOpenPR[]> {
    const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 100,
    })

    return data
        .filter((pr) => pr.head.ref.startsWith(BRANCH_PREFIX))
        .map((pr) => ({
            number: pr.number,
            htmlUrl: pr.html_url,
            headRef: pr.head.ref,
        }))
}

/**
 * 关闭 Pull Request（用于 supersede 旧 PR）。
 */
export async function closePullRequest(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number,
): Promise<void> {
    await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pullNumber,
        state: 'closed',
    })
}

/**
 * 通过 GitHub API 创建 Pull Request。
 */
export async function createPullRequest(params: CreatePullRequestParams): Promise<PullRequestResult> {
    const { octokit, owner, repo, headBranch, baseBranch, title, body } = params

    const { data } = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head: headBranch,
        base: baseBranch,
    })

    return {
        number: data.number,
        htmlUrl: data.html_url,
    }
}

// ---------------------------------------------------------------------------
// Branch cleanup API
// ---------------------------------------------------------------------------

/** 分支清理状态（用于 cleanup-branches 清单分类） */
export interface DependfixBranchStatus {
    /** 分支名 */
    branch: string
    /** 关联 PR 编号（无 PR 记录时为 null） */
    prNumber: number | null
    /** PR 是否已合并 */
    merged: boolean
    /** PR 是否已关闭（含合并） */
    closed: boolean
}

/**
 * 列出远端所有 `dependfix/` 前缀分支（git.listMatchingRefs 精确前缀匹配）。
 */
export async function listDependfixBranches(
    octokit: Octokit,
    owner: string,
    repo: string,
): Promise<string[]> {
    const { data } = await octokit.rest.git.listMatchingRefs({
        owner,
        repo,
        ref: 'heads/dependfix',
        per_page: 100,
    })

    return data
        .map((ref) => ref.ref.replace(/^refs\/heads\//, ''))
        .filter((name) => name.startsWith('dependfix/'))
}

/**
 * 查询分支对应的最近 PR 状态（pulls.list head 精确匹配，按最近更新取 1 条）。
 */
export async function getBranchPrStatus(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
): Promise<DependfixBranchStatus> {
    const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${branch}`,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 1,
    })

    const pr = data[0]
    if (!pr) {
        return { branch, prNumber: null, merged: false, closed: false }
    }

    // pulls.list 摘要不含 `merged` 字段，用 `state=closed + merged_at 非空` 判定已合并
    return {
        branch,
        prNumber: pr.number,
        merged: pr.state === 'closed' && pr.merged_at !== null,
        closed: pr.state === 'closed',
    }
}

/**
 * 删除远端分支（git ref delete）。失败（分支保护、不存在）由调用方捕获处理。
 */
export async function deleteRemoteBranch(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
): Promise<void> {
    await octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branch}`,
    })
}

/**
 * 判定交互确认回答是否为"是"（y/yes，大小写不敏感；空输入默认拒绝）。
 */
export function isConfirmAnswer(answer: string): boolean {
    return /^y(es)?$/i.test(answer.trim())
}

// ---------------------------------------------------------------------------
// Report Helpers
// ---------------------------------------------------------------------------

/** 判定 action 是否代表真实的包升级（排除 skip 路径的 `PR #N` 伪 action 与 AI 建议类 noOp，口径与 computeFixFingerprint 一致） */
function isPackageUpgradeAction(action: FixAction): boolean {
    return action.type === 'dependency-upgrade'
        && typeof action.target === 'string'
        && !/^PR #\d+/.test(action.target)
        && !action.noOp
}

/** 转义 Markdown 表格单元格：`\` 先转义再转义 `|`（避免已有转义双重处理），换行折叠为空格（错误消息常含多行） */
function escapeTableCell(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * 依赖升级 action 的聚合键（仓库 + 包名 + 目标 manifest；跨仓库同包不合并；
 * 同包根升级与成员升级各自成行，避免成员 filePath 丢失）。
 */
function upgradeKey(action: FixAction): string {
    return `${action.repository}\u0000${action.target}\u0000${action.filePath ?? ''}`
}

/** 按 (仓库, 包名) 聚合依赖升级 action。 */
interface AggregatedUpgrade {
    repository: string
    packageName: string
    fromVersion?: string
    toVersion?: string
    isMajor: boolean
    strategy?: string
    error?: string
    /** 成员级升级目标 manifest（相对路径，如 `packages/web/package.json`）；根升级缺省 */
    filePath?: string
}

function aggregateUpgradeActions(
    actions: FixAction[],
    predicate: (a: FixAction) => boolean,
): AggregatedUpgrade[] {
    const byKey = new Map<string, AggregatedUpgrade>()

    for (const action of actions) {
        if (!isPackageUpgradeAction(action) || !predicate(action)) {
            continue
        }
        const key = upgradeKey(action)
        const current = byKey.get(key)
        if (!current) {
            byKey.set(key, {
                repository: action.repository,
                packageName: action.target,
                fromVersion: action.fromVersion,
                toVersion: action.toVersion,
                isMajor: action.isMajor === true,
                strategy: action.strategy,
                error: action.error,
                filePath: action.filePath,
            })
            continue
        }
        // 同包多条 action（同包多告警 / 重试路径）合并：
        // from 取最早的起点，to 取最新的终点，任一 major 即标 ⚠️，strategy 优先 override
        current.toVersion = action.toVersion ?? current.toVersion
        current.isMajor = current.isMajor || action.isMajor === true
        current.strategy = action.strategy === 'override' ? action.strategy : current.strategy
        if (action.error) {
            current.error = action.error
        }
    }

    return [...byKey.values()]
}

/** GitHub PR body 上限（64KB 保守取 60KB，为 UTF-8 多字节字符与尾部内容留余量） */
const MAX_PR_BODY_BYTES = 60 * 1024

/**
 * 从 RunResult 生成 PR body（Markdown）。
 *
 * 升级/失败列表按 (仓库, 包名) 聚合：同一包多次出现合并为一行
 * （from 取最早起点、to 取最新终点），避免一个包出现多次。
 *
 * body 超出 GitHub 64KB 上限时从**尾部**逐行截断（保留头部摘要与升级明细，
 * 明细表在尾部被截断），并附加截断说明——避免大仓库 PR 创建 422。
 *
 * @param supersededNumbers 被本 PR 取代并已关闭的旧 PR 编号列表（用于 Supersedes 声明）
 */
export function generatePRBody(result: RunResult, supersededNumbers?: number[]): string {
    const { summary, actions, errors } = result

    const lines: string[] = [
        '## 🔒 Dependfix Auto Fix',
        '',
        `**Run ID**: \`${result.runId}\``,
        `**Mode**: ${result.config.mode}`,
        `**Time**: ${result.startedAt}`,
        '',
        '### 📊 Summary',
        '',
        '| Metric | Value |',
        '|--------|-------|',
        `| Repositories scanned | ${summary.repositoriesScanned} |`,
        `| Alerts found | ${summary.alertsFound} |`,
        `| Alerts fixable | ${summary.alertsFixable} |`,
        `| Dependencies upgraded | ${summary.alertsFixed} |`,
        `| Upgrades failed | ${summary.alertsFailed} |`,
        `| Converged (already >= target) | ${summary.alertsConverged} |`,
        `| Lockfile repairs | ${summary.lockfileRepairs} |`,
        `| Verifications passed | ${summary.verificationsPassed} |`,
        `| Verifications failed | ${summary.verificationsFailed} |`,
        '',
    ]

    // Upgraded dependencies（按包聚合，每包一行）
    const upgrades = aggregateUpgradeActions(actions, (a) => a.success)
    if (upgrades.length > 0) {
        const multiRepo = new Set(upgrades.map((u) => u.repository)).size > 1
        lines.push('### 📦 Upgraded Dependencies', '')
        const headers = multiRepo
            ? ['Repository', 'Package', 'From', 'To', 'Strategy', 'Major']
            : ['Package', 'From', 'To', 'Strategy', 'Major']
        lines.push(`| ${headers.join(' | ')} |`)
        lines.push(`|${headers.map(() => '---').join('|')}|`)
        for (const u of upgrades) {
            const major = u.isMajor ? '⚠️ Yes' : 'No'
            let strategy = 'direct'
            if (u.strategy === 'override') {
                strategy = 'pnpm overrides'
            } else if (u.strategy === 'major-upgrade') {
                strategy = 'major-upgrade'
            } else if (u.strategy === 'member-upgrade') {
                strategy = 'member upgrade'
            }
            const packageCell = u.filePath ? `\`${u.packageName}\` (${u.filePath})` : `\`${u.packageName}\``
            const cells = multiRepo
                ? [u.repository, packageCell, u.fromVersion ?? '-', u.toVersion ?? '-', strategy, major]
                : [packageCell, u.fromVersion ?? '-', u.toVersion ?? '-', strategy, major]
            lines.push(`| ${cells.join(' | ')} |`)
        }
        lines.push('')
    }

    // Fixed Alerts（告警级明细：GHSA/规则 + 包 + 严重级 + 修复版本）
    // 依赖升级：按**版本满足**精确判定（isAlertFixedByActions）——同包多 GHSA 推荐版本
    // 各异时，仅推荐版本被实际升级目标满足的告警计入（2026-08-06 复盘 PR #28：
    // 5.x 实例推荐 6.4.3 只升到 5.4.21 的跨线告警不再误标 fixed）；
    // Code Scanning：repo/ruleId@filePath（success && !noOp）
    const fixedAlerts = result.alerts.filter((alert) => isAlertFixedByActions(alert, actions))
    if (fixedAlerts.length > 0) {
        const multiRepo = new Set(fixedAlerts.map((a) => a.repository)).size > 1
        lines.push('### ✅ Fixed Alerts', '')
        const headers = multiRepo
            ? ['Repository', 'Package', 'Rule/Advisory', 'Severity', 'Fixed']
            : ['Package', 'Rule/Advisory', 'Severity', 'Fixed']
        lines.push(`| ${headers.join(' | ')} |`)
        lines.push(`|${headers.map(() => '---').join('|')}|`)
        for (const alert of fixedAlerts) {
            // 依赖升级 → 推荐修复版本；Code Scanning → ruleId 本身
            const fixedTo = alert.source === 'code-scanning' ? 'template applied' : (alert.recommendedVersion ?? '—')
            const cells = multiRepo
                ? [alert.repository, `\`${alert.packageName}\``, `\`${escapeTableCell(alert.ruleId)}\``, alert.severity.toUpperCase(), fixedTo]
                : [`\`${alert.packageName}\``, `\`${escapeTableCell(alert.ruleId)}\``, alert.severity.toUpperCase(), fixedTo]
            lines.push(`| ${cells.join(' | ')} |`)
        }
        lines.push('')
    }

    // Failed upgrades（按包聚合，附目标版本与失败原因）
    const failures = aggregateUpgradeActions(actions, (a) => !a.success)
    if (failures.length > 0) {
        const multiRepo = new Set(failures.map((f) => f.repository)).size > 1
        lines.push('### ⚠️ Failed Upgrades', '')
        const headers = multiRepo
            ? ['Repository', 'Package', 'Target', 'Error']
            : ['Package', 'Target', 'Error']
        lines.push(`| ${headers.join(' | ')} |`)
        lines.push(`|${headers.map(() => '---').join('|')}|`)
        for (const f of failures) {
            const target = f.toVersion ?? '-'
            const error = escapeTableCell(f.error ?? 'unknown error')
            const packageCell = f.filePath ? `\`${f.packageName}\` (${f.filePath})` : `\`${f.packageName}\``
            const cells = multiRepo
                ? [f.repository, packageCell, target, error]
                : [packageCell, target, error]
            lines.push(`| ${cells.join(' | ')} |`)
        }
        lines.push('')
    }

    // Verification
    const verifications = actions.filter((a) => a.type === 'verification')
    if (verifications.length > 0) {
        lines.push('### ✅ Verification', '')
        for (const v of verifications) {
            const icon = v.success ? '✅' : '❌'
            lines.push(`- ${icon} \`${v.target}\` ${v.error ? `(${v.error})` : ''}`)
        }
        lines.push('')
    }

    // Code Scanning 建议（无法自动修复的问题不静默丢失）
    const suggestions = collectCodeScanningSuggestions(result, result.config.mode)
    if (suggestions.length > 0) {
        const multiRepo = new Set(suggestions.map((s) => s.repository)).size > 1
        lines.push('### 🧰 Code Scanning Suggestions', '')
        const headers = multiRepo
            ? ['Repository', 'Rule', 'Location', 'Reason', 'Suggestion']
            : ['Rule', 'Location', 'Reason', 'Suggestion']
        lines.push(`| ${headers.join(' | ')} |`)
        lines.push(`|${headers.map(() => '---').join('|')}|`)
        for (const s of suggestions) {
            const cells = multiRepo
                ? [s.repository, `\`${escapeTableCell(s.ruleId)}\``, `\`${escapeTableCell(s.location)}\``, escapeTableCell(s.reason), escapeTableCell(s.suggestion)]
                : [`\`${escapeTableCell(s.ruleId)}\``, `\`${escapeTableCell(s.location)}\``, escapeTableCell(s.reason), escapeTableCell(s.suggestion)]
            lines.push(`| ${cells.join(' | ')} |`)
        }
        lines.push('')
    }

    // Errors
    if (errors.length > 0) {
        lines.push('### 🚨 Errors', '')
        for (const e of errors) {
            lines.push(`- **${e.stage}**: ${e.message}`)
        }
        lines.push('')
    }

    lines.push('---', '', '*This PR was automatically created by [dependfix](https://github.com/dependfix/dependfix).*')

    if (supersededNumbers && supersededNumbers.length > 0) {
        lines.push('', `> **Supersedes**: ${supersededNumbers.map((n) => `#${n}`).join(', ')}（内容已更新，将取代旧 PR）`)
    }

    return truncatePRBody(lines)
}

function truncatePRBody(lines: string[]): string {
    const body = lines.join('\n')
    if (Buffer.byteLength(body, 'utf-8') <= MAX_PR_BODY_BYTES) {
        return body
    }

    const truncationNote = '\n\n> ⚠️ **Body truncated**（超出 GitHub 64KB 上限）— 完整明细见本次运行报告 artifact。\n'
    const kept: string[] = []
    let bytes = Buffer.byteLength(truncationNote, 'utf-8')
    for (const line of lines) {
        const lineBytes = Buffer.byteLength(`${line}\n`, 'utf-8')
        if (bytes + lineBytes > MAX_PR_BODY_BYTES) {
            break
        }
        kept.push(line)
        bytes += lineBytes
    }
    return `${kept.join('\n')}${truncationNote}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function branchExists(branchName: string, workDir: string): boolean {
    try {
        execFileSync('git', ['rev-parse', '--verify', branchName], {
            cwd: workDir,
            stdio: 'pipe',
        })
        return true
    } catch {
        return false
    }
}

function ensureGitConfig(workDir: string): void {
    const hasName = gitConfigExists('user.name', workDir)
    const hasEmail = gitConfigExists('user.email', workDir)

    if (!hasName) {
        execSync(`git config user.name "${BOT_NAME}"`, { cwd: workDir, stdio: 'pipe' })
    }
    if (!hasEmail) {
        execSync(`git config user.email "${BOT_EMAIL}"`, { cwd: workDir, stdio: 'pipe' })
    }
}

function gitConfigExists(key: string, workDir: string): boolean {
    try {
        execSync(`git config ${key}`, { cwd: workDir, stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}
