import type { AlertClass } from '../alerts'
import {
    type RunResult,
    type FixAction,
    aggregateSeverity,
    groupByRepository,
    formatDuration,
    actionTypeLabel,
    isAlertFixedByActions,
    statusIcon,
} from './types'
import { collectCodeScanningSuggestions } from './suggestions'

/**
 * 生成 Markdown 格式报告字符串。
 *
 * 模板固定 7 节：
 * 1. Header（runId / 时间 / 模式）
 * 2. Summary 表
 * 3. AI Usage（仅 AI 实际调用时渲染）
 * 4. Alerts by Severity 表
 * 5. Repositories 明细
 * 6. Fix Actions 表
 * 7. Errors 节（有错误时才渲染）
 */
export function generateMarkdownReport(result: RunResult): string {
    const { runId, startedAt, finishedAt, config, summary, repositories, alerts, actions, errors } = result

    const sections: string[] = []

    // ---- 1. Header ----
    sections.push(
        '# dependfix Report',
        '',
        `> **Run ID**: \`${runId}\``,
        `> **Date**: ${startedAt} → ${finishedAt}`,
        `> **Mode**: ${config.mode} (Severity ≥ ${config.severityThreshold})`,
        `> **Dry Run**: ${config.dryRun ? 'Yes' : 'No'}`,
        `> **Alert Source**: ${alertSourceLabel(config)}`,
        '',
    )

    // ---- 2. Summary ----
    sections.push(
        '## Summary',
        '',
        '| Metric | Count |',
        '|--------|-------|',
        `| Repositories scanned | ${summary.repositoriesScanned} |`,
        `| Alerts found | ${summary.alertsFound} |`,
        `| Fixable | ${summary.alertsFixable} |`,
        `| Fixed | ${summary.alertsFixed} |`,
        `| Failed | ${summary.alertsFailed} |`,
        `| Skipped | ${summary.alertsSkipped} |`,
        `| Converged (already >= target) | ${summary.alertsConverged} |`,
        `| Truncated (max alerts/repo) | ${summary.alertsTruncated} |`,
        `| Lockfile repairs | ${summary.lockfileRepairs} |`,
        `| Verifications passed | ${summary.verificationsPassed} |`,
        `| Verifications failed | ${summary.verificationsFailed} |`,
        '',
    )

    // ---- 3. AI Usage（仅 --ai 实际调用时渲染；run 级聚合）----
    if (result.aiUsage && result.aiUsage.calls > 0) {
        const u = result.aiUsage
        const costText = u.estimatedCostUsd !== undefined
            ? ` (估算成本 **$${u.estimatedCostUsd.toFixed(4)}**，公开定价推算)`
            : '（模型无单价数据，成本未估算）'
        sections.push(
            '## AI Usage',
            '',
            `> AI 研判调用 **${u.calls}** 次，消耗 **${u.inputTokens.toLocaleString('en-US')}** in / **${u.outputTokens.toLocaleString()}** out tokens（合计 ${u.totalTokens.toLocaleString('en-US')}）${costText}`,
            '',
        )
    }

    // ---- 4. Alerts by Severity ----
    if (alerts.length > 0) {
        const breakdown = aggregateSeverity(alerts, actions)
        sections.push(
            '## Alerts by Severity',
            '',
            '| Severity | Found | Fixable | Fixed | Failed |',
            '|----------|-------|---------|-------|--------|',
            severityRow('Critical', breakdown.critical),
            severityRow('High', breakdown.high),
            severityRow('Medium', breakdown.medium),
            severityRow('Low', breakdown.low),
            '',
        )
    }

    // ---- 5. Repositories ----
    const grouped = groupByRepository(alerts, actions, repositories)
    if (grouped.length > 0) {
        sections.push('## Repositories', '')
        for (const repo of grouped) {
            const repoResult = repositories.find((r) => r.repository === repo.repository)
            const branch = repoResult?.defaultBranch ?? 'main'
            // pnpm-audit 本地兜底仓库显示友好名（内部值 local）
            const header = repo.repository === 'local'
                ? '### Local workspace'
                : `### ${repo.repository} (branch: ${branch})`
            sections.push(header, '')
            if (repo.alerts.length > 0) {
                // 逐条保留每个告警的审计粒度（同包多告警各自成行，靠 Rule/Advisory 列区分）
                // Rule/Advisory 列：Dependabot 显示 GHSA 编号、pnpm-audit 显示 advisory URL、Code Scanning 显示 rule id
                // Class 列：Code Scanning 规则分层（A=自动修复 / B=建议 / C=仅报告），其他源显示 —
                sections.push(
                    '| Package | Rule/Advisory | Class | Severity | From | To | Major | Status |',
                    '|---------|---------------|-------|----------|------|----|-------|--------|',
                )
                for (const alert of repo.alerts) {
                    // 修复状态：版本满足精确判定（isAlertFixedByActions，PR #28 复盘——
                    // 跨线告警不因同包其他线目标被误标 Fixed）
                    const fixed = isAlertFixedByActions(alert, actions)
                    // 展示动作（优先成功 action，避免同包失败 action 先入队时版本错配）
                    const action = actions.find(
                        (a) => a.repository === repo.repository
                            && !a.noOp
                            && a.success
                            && ((a.type === 'dependency-upgrade' && a.target === alert.packageName)
                                || (a.type === 'code-scanning-fix' && a.target === alert.ruleId && a.filePath === alert.manifestPath)),
                    )
                    const failedAction = actions.find(
                        (a) => a.repository === repo.repository
                            && !a.noOp
                            && !a.success
                            && ((a.type === 'dependency-upgrade' && a.target === alert.packageName)
                                || (a.type === 'code-scanning-fix' && a.target === alert.ruleId && a.filePath === alert.manifestPath)),
                    )
                    let fromVer = '—'
                    let toVer = '—'
                    let major = '—'
                    let icon: string
                    if (fixed && action) {
                        icon = '✅ Fixed'
                        fromVer = action.fromVersion ?? '—'
                        toVer = action.toVersion ?? '—'
                        if (action.isMajor === undefined) {
                            major = '—'
                        } else {
                            major = action.isMajor ? 'Yes' : 'No'
                        }
                    } else if (failedAction) {
                        icon = '❌ Failed'
                        fromVer = failedAction.fromVersion ?? '—'
                        toVer = failedAction.toVersion ?? '—'
                    } else {
                        icon = '⏭️ Skipped'
                        toVer = alert.recommendedVersion || '—'
                    }
                    const ruleOrAdvisory = alert.ruleId || '—'
                    const alertClass = alertClassLabel(alert.alertClass)
                    sections.push(`| \`${alert.packageName}\` | ${escapeMd(ruleOrAdvisory)} | ${alertClass} | ${alert.severity.toUpperCase()} | ${fromVer} | ${toVer} | ${major} | ${icon} |`)
                }
                sections.push('')
            } else {
                sections.push('_No alerts for this repository._', '')
            }
        }
    }

    // ---- 5.5 Code Scanning Suggestions（无法自动修复的问题不静默丢失）----
    const suggestions = collectCodeScanningSuggestions(result, config.mode)
    if (suggestions.length > 0) {
        sections.push(
            '## Code Scanning Suggestions',
            '',
            '| Repository | Rule | Location | Severity | Reason | Suggestion |',
            '|------------|------|----------|----------|--------|------------|',
        )
        for (const s of suggestions) {
            sections.push(
                `| ${escapeMd(s.repository)} | \`${escapeMd(s.ruleId)}\` | \`${escapeMd(s.location)}\` | ${s.severity.toUpperCase()} | ${escapeMd(s.reason)} | ${escapeMd(s.suggestion)} |`,
            )
        }
        sections.push('')
    }

    // ---- 6. Fix Actions ----
    sections.push('## Fix Actions', '')
    if (actions.length > 0) {
        sections.push(
            '| Type | Repository | Target | Details | Status | Duration |',
            '|------|------------|--------|---------|--------|----------|',
        )
        for (const action of actions) {
            const details = actionDetails(action, action.error)
            const icon = statusIcon(action.success)
            const duration = action.durationMs !== null && action.durationMs !== undefined ? formatDuration(action.durationMs) : '—'
            sections.push(
                `| ${actionTypeLabel(action.type)} | ${escapeMd(action.repository)} | ${escapeMd(action.target)} | ${details} | ${icon} | ${duration} |`,
            )
        }
    } else {
        sections.push('_No fix actions performed._')
    }
    sections.push('')

    // ---- 7. Errors ----
    if (errors.length > 0) {
        sections.push(
            '## Errors',
            '',
            '| Repository | Stage | Category | Message |',
            '|------------|-------|----------|---------|',
        )
        for (const err of errors) {
            const cat = err.category ?? '—'
            sections.push(`| ${escapeMd(err.repository)} | ${escapeMd(err.stage)} | ${escapeMd(cat)} | ${escapeMd(err.message)} |`)
        }
        sections.push('')
    }

    return sections.join('\n')
}

function severityRow(label: string, row: { found: number, fixable: number, fixed: number, failed: number }): string {
    if (row.found === 0) {
        return `| ${label} | — | — | — | — |`
    }
    return `| ${label} | ${row.found} | ${row.fixable} | ${row.fixed} | ${row.failed} |`
}

/** 报告 Header 的 Alert Source 标签（code-scanning 开启时标注并行源）。 */
function alertSourceLabel(config: RunResult['config']): string {
    if (config.alertSource === 'pnpm-audit') {
        return 'pnpm-audit (local workspace)'
    }
    return config.codeScanningEnabled ? 'GitHub Dependabot + Code Scanning API' : 'GitHub Dependabot API'
}

/** Code Scanning 规则分层标签（A/B/C）；非 Code Scanning 源显示 —。 */
function alertClassLabel(alertClass: AlertClass | undefined): string {
    switch (alertClass) {
        case 'auto-fixable': return 'A 自动修复'
        case 'suggested': return 'B 建议'
        case 'report-only': return 'C 仅报告'
        default: return '—'
    }
}

function actionDetails(action: FixAction, error?: string): string {
    const base = ((): string => {
        switch (action.type) {
            case 'dependency-upgrade':
                // 成员级升级展示目标 manifest，根升级不受影响
                return `${action.fromVersion ?? '?'} → ${action.toVersion ?? '?'}${action.filePath ? ` (${action.filePath})` : ''}`
            case 'lockfile-repair':
                return action.strategy
                    ? `${action.strategy}: ${action.diff ?? ''}`
                    : action.diff ?? '—'
            case 'verification':
                return '—'
            case 'branch-cleanup':
                return action.diff ?? '—'
            case 'code-scanning-fix':
                return action.diff ?? '—'
        }
    })()
    // 失败 action 的原因必须可审计：追加错误信息（转义防表格错乱）
    if (error) {
        return `${base} — ⚠️ ${escapeMd(error)}`
    }
    return base
}

/** 转义 Markdown 表格中的 `|` 与换行（错误消息常含多行，折叠为空格） */
function escapeMd(text: string): string {
    return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}
