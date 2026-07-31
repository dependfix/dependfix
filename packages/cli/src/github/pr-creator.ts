import { execSync } from 'node:child_process'
import type { Octokit } from '@octokit/rest'
import type { RunResult } from '@dependfix/core'

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOT_NAME = 'dependfix[bot]'
const BOT_EMAIL = 'dependfix[bot]@users.noreply.github.com'

// ---------------------------------------------------------------------------
// Git Operations
// ---------------------------------------------------------------------------

/**
 * 在工作目录创建修复分支。
 *
 * - 分支命名: `dependfix/auto-fix-{runId尾段}`（取 runId 最后一个 `-` 分隔段，
 *   与报告文件名后缀保持一致，避免固定前缀 `dependfix-` 截断后导致分支名恒定）
 * - 如果分支已存在（如重跑），切换到该分支
 *
 * @returns 分支名和是否为新创建
 */
export function createFixBranch(runId: string, workDir: string): FixBranchResult {
    const branchName = `dependfix/auto-fix-${extractRunSuffix(runId)}`

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
 */
export function generatePRBody(result: RunResult): string {
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

    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 提取分支名后缀（最多 8 字符）：
 * 优先取 runId 最后一个 `-` 分隔段（如 `dependfix-<ts>-<rand>` 中的随机段），
 * 无有效分隔段（无 `-` 或尾段为空）时取整个 runId 前 8 字符兜底。
 * 注意：`packages/core/src/report/writer.ts` 中 `extractRunSuffix` 与此逻辑保持一致，
 * 修改时需同步，避免分支名与报告文件名后缀再次不一致。
 */
function extractRunSuffix(runId: string): string {
    const idx = runId.lastIndexOf('-')
    const tail = idx >= 0 && idx < runId.length - 1 ? runId.slice(idx + 1) : runId
    return tail.slice(0, 8)
}

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
