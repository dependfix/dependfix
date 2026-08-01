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
            sections.push(`### ${repo.repository} (branch: ${branch})`, '')
            if (repo.alerts.length > 0) {
                sections.push(
                    '| Package | Severity | From | To | Major | Status |',
                    '|---------|----------|------|----|-------|--------|',
                )
                for (const alert of repo.alerts) {
                    const action = actions.find(
                        (a) => a.type === 'dependency-upgrade' && a.repository === repo.repository && a.target === alert.packageName,
                    )
                    const fromVer = action?.fromVersion ?? alert.recommendedVersion
                    const toVer = action?.toVersion ?? alert.recommendedVersion
                    const major = action?.isMajor ? 'Yes' : 'No'
                    let icon: string
                    if (action) {
                        icon = action.success ? '✅ Fixed' : '❌ Failed'
                    } else {
                        icon = '⏭️ Skipped'
                    }
                    sections.push(`| \`${alert.packageName}\` | ${alert.severity.toUpperCase()} | ${fromVer} | ${toVer} | ${major} | ${icon} |`)
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
            const details = actionDetails(action)
            const icon = statusIcon(action.success)
            const duration = action.durationMs !== null && action.durationMs !== undefined ? formatDuration(action.durationMs) : '—'
            sections.push(
                `| ${actionTypeLabel(action.type)} | ${action.repository} | ${escapeMd(action.target)} | ${details} | ${icon} | ${duration} |`,
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
            sections.push(`| ${err.repository} | ${err.stage} | ${cat} | ${escapeMd(err.message)} |`)
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

function actionDetails(action: FixAction): string {
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
}

/** 转义 Markdown 表格中的 `|` 字符 */
function escapeMd(text: string): string {
    return text.replace(/\|/g, '\\|')
}
