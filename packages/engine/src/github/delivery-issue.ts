// delivery-issue.ts — 基线红（修复后安装仍为既有失败）的交付降级载体：失败指纹 + issue 创建与去重。
//
// 语义（口径见 [pr-delivery-closure-history.md §16](../../../../docs/design/governance/pr-delivery-closure-history.md#_16-m51-4-基线红-安装失败的交付降级-2026-10-30)）：
// - 指纹只由「受影响仓库集 + 失败命令集」决定（不含错误文本 / 时间 / run id），
//   同一根因跨多次运行稳定命中，避免 CI 日志抖动导致重复开 issue
// - 去重按 issue 正文头部 HTML marker 判定，查询 `state: 'all'`——**关闭后不重开**
// - 载体创建失败只 warn，不改变交付跳过结论与 exit code
import { createHash } from 'node:crypto'
import type { Octokit } from '@octokit/rest'
import type { RunResult } from '@dependfix/core'
import { escapeTableCell } from './markdown-table'

/** 交付跳过 issue 的推荐标签（仅用于检索；仓库未建该标签时可能被静默丢弃，去重不依赖它）。 */
export const DELIVERY_SKIP_LABEL = 'dependfix'

/** 交付跳过 issue 的 HTML 标记前缀（正文首位；去重判定用）。 */
export const DELIVERY_SKIP_MARKER_PREFIX = '<!-- dependfix:delivery-skip'

/**
 * 计算交付失败指纹（sha256 前 16 位）。
 *
 * 输入顺序无关（仓库集 / 命令集分别排序后拼接），刻意不含错误文本与时间戳：
 * 同仓库、同失败命令即视为同一失败，issue 关闭后不再重开。
 */
export function computeDeliverySkipFingerprint(input: {
    repositories: readonly string[]
    failingCommands: readonly string[]
}): string {
    const repositories = [...new Set(input.repositories)].sort().join('\u0000')
    const commands = [...new Set(input.failingCommands)].sort().join('\u0000')
    return createHash('sha256').update(`${repositories}\u0001${commands}`).digest('hex').slice(0, 16)
}

/** 生成 issue 正文头部的去重标记。 */
export function formatDeliverySkipMarker(fingerprint: string): string {
    return `${DELIVERY_SKIP_MARKER_PREFIX} fp=${fingerprint} -->`
}

/** 正文是否携带指定指纹的交付跳过标记。 */
export function hasDeliverySkipMarker(body: string | null | undefined, fingerprint: string): boolean {
    if (!body) {
        return false
    }
    return body.includes(formatDeliverySkipMarker(fingerprint))
}

/** issue 正文（marker 在首位，便于去重判定）。 */
export function buildDeliverySkipIssueBody(input: {
    fingerprint: string
    runId: string
    repositories: readonly string[]
    failingCommands: readonly string[]
}): string {
    const repos = input.repositories.length > 0
        ? input.repositories.map((repo) => `\`${repo}\``).join('、')
        : '—'
    const commands = input.failingCommands.length > 0
        ? input.failingCommands.map((command) => `\`${command}\``).join('、')
        : '—'
    return [
        formatDeliverySkipMarker(input.fingerprint),
        '## dependfix 交付被跳过',
        '',
        '修复后安装验证仍为**既有失败**（本次改动前即为红），因此本次修复未被交付：改动已回滚，未推送、未创建 PR。',
        '',
        '| 项 | 值 |',
        '|----|----|',
        `| 运行 | \`${input.runId}\` |`,
        `| 仓库 | ${repos} |`,
        `| 失败命令 | ${commands} |`,
        '',
        '### 需要做什么',
        '',
        '1. 先让目标仓库的安装链恢复（lockfile 与 manifest 一致、registry 可达、依赖脚本完整等），',
        '   使上述失败命令在干净工作区通过。',
        '2. 重新运行 dependfix（`fix-and-pr`）——同一失败指纹不会重复开 issue。',
        '',
        '> 本 issue 由 dependfix 自动创建，按「仓库集 + 失败命令集」指纹去重；关闭后不会自动重开。',
    ].join('\n')
}

/** issue 标题（仓库集稳定，便于人工按仓库检索）。 */
export function buildDeliverySkipIssueTitle(repositories: readonly string[]): string {
    const repos = repositories.length > 0 ? repositories.join(', ') : 'target repository'
    return `dependfix 交付跳过：${repos} 安装验证仍有既有失败`
}

/** 命中的既有交付跳过 issue。 */
export interface ExistingDeliverySkipIssue {
    number: number
    htmlUrl: string
}

/**
 * 按指纹查找既有交付跳过 issue（含**已关闭**）。
 *
 * 只读取最近 100 条 issue（与尝试索引同口径：失败指纹命中即复用，无需全量翻页）；
 * 查询失败抛错由调用方降级（缺省按未命中处理，最多多开一个 issue）。
 */
export async function findDeliverySkipIssue(
    octokit: Octokit,
    owner: string,
    repo: string,
    fingerprint: string,
): Promise<ExistingDeliverySkipIssue | null> {
    const { data } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: 'all',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
    })
    const hit = data.find((issue) => (
        // PR 也由 issues API 返回；交付跳过 issue 不会是 PR，排除以免误命中
        !('pull_request' in issue) && hasDeliverySkipMarker(issue.body, fingerprint)
    ))
    return hit ? { number: hit.number, htmlUrl: hit.html_url } : null
}

/** 创建交付跳过 issue（权限面：`issues: write`）。 */
export async function createDeliverySkipIssue(
    octokit: Octokit,
    owner: string,
    repo: string,
    params: { title: string, body: string, labels?: readonly string[] },
): Promise<ExistingDeliverySkipIssue> {
    const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title: params.title,
        body: params.body,
        ...(params.labels && params.labels.length > 0 ? { labels: [...params.labels] } : {}),
    })
    return { number: data.number, htmlUrl: data.html_url }
}

/**
 * 草稿交付的 PR 正文说明（仅 `draft` 档渲染；放在正文最前，避免被读成「CI 会绿」）。
 *
 * 返回空数组表示本次运行没有草稿交付（既有 PR 正文逐字不变）。
 */
export function buildDraftDeliveryNotice(result: RunResult): string[] {
    const skips = (result.deliverySkips ?? []).filter((record) => record.carrier.mode === 'draft')
    if (skips.length === 0) {
        return []
    }
    const repos = [...new Set(skips.flatMap((record) => record.repositories))]
    const commands = [...new Set(skips.flatMap((record) => record.failingCommands))]
    return [
        '> [!WARNING]',
        '> **草稿交付**：修复后安装验证仍为既有失败（本次改动前即为红），本 PR 以草稿创建。',
        `> 仓库：${repos.length > 0 ? repos.map((repo) => `\`${escapeTableCell(repo)}\``).join('、') : '—'}`,
        `> 失败命令：${commands.length > 0 ? commands.map((command) => `\`${escapeTableCell(command)}\``).join('、') : '—'}`,
        '> CI 会以同一既有失败为红；请先修复目标仓库的安装链，再把本 PR 转正。',
        '',
    ]
}
