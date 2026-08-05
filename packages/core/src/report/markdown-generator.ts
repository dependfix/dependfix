import type { AlertClass } from '../alerts'
import {
    type RunResult,
    type FixAction,
    aggregateSeverity,
    groupByRepository,
    formatDuration,
    actionTypeLabel,
    statusIcon,
} from './types'

/**
 * 生成 Markdown 格式报告字符串。
 *
 * 模板固定 6 节：
 * 1. Header（runId / 时间 / 模式）
 * 2. Summary 表
 * 3. Alerts by Severity 表
 * 4. Repositories 明细
 * 5. Fix Actions 表
 * 6. Errors 节（有错误时才渲染）
 */
export function generateMarkdownReport(result: RunResult): string {
    const { runId, startedAt, finishedAt, config, summary, repositories, alerts, actions, errors } = result
    const fixedKeys = new Set(actions.filter((a) => a.success && a.type === 'dependency-upgrade').map((a) => `${a.repository}/${a.target}`))

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
        `| Lockfile repairs | ${summary.lockfileRepairs} |`,
        `| Verifications passed | ${summary.verificationsPassed} |`,
        `| Verifications failed | ${summary.verificationsFailed} |`,
        '',
    )

    // ---- 3. Alerts by Severity ----
    if (alerts.length > 0) {
        const breakdown = aggregateSeverity(alerts, fixedKeys)
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

    // ---- 4. Repositories ----
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
                    const action = actions.find(
                        (a) => a.type === 'dependency-upgrade' && a.repository === repo.repository && a.target === alert.packageName,
                    )
                    // Skipped（无 action）：当前版本未知 → From 显示 —，To 显示推荐修复版本
                    const fromVer = action?.fromVersion ?? '—'
                    let toVer = action?.toVersion ?? '—'
                    let major = '—'
                    if (!action) {
                        toVer = alert.recommendedVersion || '—'
                    } else if (action.isMajor === undefined) {
                        major = '—'
                    } else {
                        major = action.isMajor ? 'Yes' : 'No'
                    }
                    const ruleOrAdvisory = alert.ruleId || '—'
                    const alertClass = alertClassLabel(alert.alertClass)
                    let icon: string
                    if (action) {
                        icon = action.success ? '✅ Fixed' : '❌ Failed'
                    } else {
                        icon = '⏭️ Skipped'
                    }
                    sections.push(`| \`${alert.packageName}\` | ${escapeMd(ruleOrAdvisory)} | ${alertClass} | ${alert.severity.toUpperCase()} | ${fromVer} | ${toVer} | ${major} | ${icon} |`)
                }
                sections.push('')
            } else {
                sections.push('_No alerts for this repository._', '')
            }
        }
    }

    // ---- 5. Fix Actions ----
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

    // ---- 6. Errors ----
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
                return `${action.fromVersion ?? '?'} → ${action.toVersion ?? '?'}`
            case 'lockfile-repair':
                return action.strategy
                    ? `${action.strategy}: ${action.diff ?? ''}`
                    : action.diff ?? '—'
            case 'verification':
                return '—'
            case 'branch-cleanup':
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
