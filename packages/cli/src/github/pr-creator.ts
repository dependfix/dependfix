import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { Octokit } from '@octokit/rest'
import type { FixAction, RunResult } from '@dependfix/core'

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

/** 自动修复分支统一前缀（T210 起分支名 = 前缀 + 内容指纹 8 位） */
const BRANCH_PREFIX = 'dependfix/auto-fix-'

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * 计算修复内容指纹（sha256 前 8 位）。
 *
 * 指纹基于**结构化修复结果**而非 git diff：
 * - 成功升级集：`pkg@toVersion`（排序拼接）
 * - 修复失败集：失败包名（排序拼接）
 * - lockfile 修复状态（成功/失败）
 *
 * 同告警集 → 同修复结果 → 同指纹 → 幂等跳过；
 * 内容变化（升级集/失败集/锁文件修复变化）→ 指纹变化 → 关旧开新。
 * 不用 diff hash 是因为 pnpm 版本等非确定性因素会使锁文件内容漂移，
 * 导致"告警没变但指纹变"。
 */
export function computeFixFingerprint(actions: FixAction[]): string {
    // 排除 PR 记录 action（target 为 "PR #N"），它们不代表修复内容本身
    const isUpgrade = (a: FixAction): boolean => a.type === 'dependency-upgrade' && !!a.target && !a.target.startsWith('PR #')

    const upgrades = actions
        .filter((a) => isUpgrade(a) && a.success && a.toVersion)
        .map((a) => `${a.target}@${a.toVersion}`)
        .sort()

    const failures = actions
        .filter((a) => isUpgrade(a) && !a.success)
        .map((a) => a.target)
        .sort()

    const repairs = actions
        .filter((a) => a.type === 'lockfile-repair')
        .map((a) => `${a.target}:${a.success}`)
        .sort()

    const payload = JSON.stringify([upgrades, failures, repairs])
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
 * - 分支名由调用方传入（T210 起为 `dependfix/auto-fix-{内容指纹}`，不再依赖 runId）
 * - 如果分支已存在（如重跑），切换到该分支
 *
 * @returns 分支名和是否为新创建
 */
export function createFixBranch(branchName: string, workDir: string): FixBranchResult {
    const exists = branchExists(branchName, workDir)
    if (exists) {
        execSync(`git checkout ${branchName}`, { cwd: workDir, stdio: 'pipe' })
        return { branchName, created: false }
    }

    execSync(`git checkout -b ${branchName}`, { cwd: workDir, stdio: 'pipe' })
    return { branchName, created: true }
}

/**
 * 暂存所有变更并提交。
 * 自动设置 git user.name / user.email（如未设置）。
 */
export function stageAndCommit(message: string, workDir: string): void {
    ensureGitConfig(workDir)
    execSync('git add .', { cwd: workDir, stdio: 'pipe' })
    execSync(`git commit -m "${escapeShell(message)}"`, { cwd: workDir, stdio: 'pipe' })
}

/**
 * 推送分支到远程 origin。
 */
export function pushBranch(branchName: string, workDir: string): void {
    execSync(`git push origin ${branchName}`, { cwd: workDir, stdio: 'pipe' })
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

/**
 * 查找目标仓库中所有 open 状态的 dependfix 自动修复 PR。
 *
 * GitHub 的 `pulls.list` 的 `head` 参数不支持通配符，因此拉取 open PR 列表后
 * 按 head 分支前缀 `dependfix/auto-fix-` 过滤。假设 PR 数量不多（单页 100 足够），
 * 未来 PR 数量增大时可引入 label 索引（见 backlog B1）。
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
// Report Helpers
// ---------------------------------------------------------------------------

/**
 * 从 RunResult 生成 PR body（Markdown）。
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
        `| Lockfile repairs | ${summary.lockfileRepairs} |`,
        `| Verifications passed | ${summary.verificationsPassed} |`,
        `| Verifications failed | ${summary.verificationsFailed} |`,
        '',
    ]

    // Upgrade actions
    const upgrades = actions.filter((a) => a.type === 'dependency-upgrade' && a.success)
    if (upgrades.length > 0) {
        lines.push('### 📦 Upgraded Dependencies', '')
        lines.push('| Package | From | To | Major |')
        lines.push('|---------|------|----|-------|')
        for (const a of upgrades) {
            const major = a.isMajor ? '⚠️ Yes' : 'No'
            lines.push(`| \`${a.target}\` | ${a.fromVersion ?? '-'} | ${a.toVersion ?? '-'} | ${major} |`)
        }
        lines.push('')
    }

    // Failed upgrades
    const failures = actions.filter((a) => a.type === 'dependency-upgrade' && !a.success)
    if (failures.length > 0) {
        lines.push('### ⚠️ Failed Upgrades', '')
        for (const a of failures) {
            lines.push(`- **\`${a.target}\`**: ${a.error ?? 'unknown error'}`)
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

    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function branchExists(branchName: string, workDir: string): boolean {
    try {
        execSync(`git rev-parse --verify ${branchName}`, {
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

function escapeShell(str: string): string {
    return str.replace(/"/g, '\\"')
}
