import type { AlertClass } from '../alerts'
import {
    type RunResult,
    type FixAction,
    type RepeatedAttemptStatus,
    type DeliverySkipCarrier,
    type SkipReason,
    aggregateSeverity,
    groupByRepository,
    formatDuration,
    SKIP_REASONS,
    actionTypeLabel,
    isAlertFixedByActions,
    statusIcon,
    formatVerificationSkipReason,
} from './types'
import { collectCodeScanningSuggestions } from './suggestions'
import { collectCodeQualityFindings } from './code-quality-suggestions'
import { groupCheckAttributions } from './check-attribution'
import { describeCiAlignment } from './ci-alignment'
import { collectFamilySummaries } from './family'
import { countUnfixedAlerts, formatSeverity, formatSkipReason, skippedBreakdown, truncatedBreakdown } from './summary-counters'
import { summarizeSkippedByPackage } from './skipped-packages'
import { redactNetworkTarget } from './network-audit-target'

/**
 * 生成 Markdown 格式报告字符串。
 *
 * 模板固定节（3/3.5 为条件渲染）：
 * 1. Header（runId / 时间 / 模式）
 * 2. Summary 表
 * 2.5 Skipped & Truncated（有跳过 / 截断 / 失败残差时渲染）
 * 2.6 Repeated Failure Attempts（有同告警尝试记录时渲染）
 * 3. AI Usage（仅 AI 实际调用时渲染）
 * 3.5. Supply Chain Warnings（有警示时才渲染）
 * 4. Alerts by Severity 表
 * 5. Repositories 明细
 * 5.4. Family Lockstep（有家族锁步记录时才渲染）
 * 5.5. Code Scanning Suggestions（有建议时才渲染）
 * 5.6. Code Quality Findings（有 findings 时才渲染）
 * 5.7. Verification Alignment（有验证链口径记录时才渲染）
 * 3.6. Alerts Disabled（有未启用记录时才渲染）
 * 6. Fix Actions 表
 * 7. Errors 节（有错误时才渲染）
 */
export function generateMarkdownReport(result: RunResult): string {
    const { runId, startedAt, finishedAt, config, summary, repositories, alerts, actions, errors } = result
    const unfixed = countUnfixedAlerts(summary)

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
        `| Unfixed | ${unfixed} |`,
        `| Skipped | ${summary.alertsSkipped} |`,
        `| Converged (already >= target) | ${summary.alertsConverged} |`,
        `| Truncated (max alerts/repo) | ${summary.alertsTruncated} |`,
        `| Alerts disabled (repos) | ${summary.reposWithAlertsDisabled} |`,
        `| Lockfile repairs | ${summary.lockfileRepairs} |`,
        `| Verifications passed | ${summary.verificationsPassed} |`,
        `| Verifications failed | ${summary.verificationsFailed} |`,
        `| Verifications skipped | ${summary.verificationsSkipped} |`,
        '',
    )

    // ---- 2.5 Skipped & Truncated（有分组信息或失败残差时才渲染，避免空区块）----
    const skippedRows = skippedBreakdown(summary)
    const truncatedRows = truncatedBreakdown(summary)
    const skippedTotal = skippedRows.reduce((sum, row) => sum + row.count, 0)
    const failedResidual = Math.max(0, unfixed - skippedTotal)
    if (skippedRows.length > 0 || truncatedRows.length > 0 || failedResidual > 0) {
        sections.push(
            '## Skipped & Truncated',
            '',
            `> **Unfixed**: ${unfixed} / ${summary.alertsFound} evaluated alerts; ${summary.alertsTruncated} truncated before analysis (not evaluated).`,
            '',
            '| Category | Count |',
            '|----------|-------|',
        )
        for (const row of truncatedRows) {
            sections.push(`| Truncated: ${formatSeverity(row.key)} | ${row.count} |`)
        }
        for (const row of skippedRows) {
            sections.push(`| Skipped: ${formatSkipReason(row.key)} | ${row.count} |`)
        }
        if (failedResidual > 0) {
            sections.push(`| Failed / other not fixed | ${failedResidual} |`)
        }
        sections.push('')
    }

    // ---- 2.5.1 Skipped by Package（同一包多条告警收敛为一行；有汇总时渲染）----
    // 运行级结论的「无写入」只说明未验证，不解释告警被拦的构成；
    // 此处按包给出条数与原因，避免 12 条同包告警在报告里看起来像 12 个包。
    const skippedPackages = summarizeSkippedByPackage(alerts, result.alertOutcomes)
    if (skippedPackages.length > 0) {
        sections.push(
            '## Skipped by Package',
            '',
            '> 同一包的多条告警合并为一行；`Highest target` 为该包被告警要求升级到的最高版本。',
            '',
            '| Repository | Package | Alerts | Highest target | Reasons |',
            '|------------|---------|--------|----------------|---------|',
        )
        for (const row of skippedPackages) {
            // 未知原因原样输出（不渲染 undefined）
            const reasons = row.reasons.length > 0
                ? row.reasons.map((reason) => (SKIP_REASONS as readonly string[]).includes(reason)
                    ? formatSkipReason(reason as SkipReason)
                    : reason).join(', ')
                : '—'
            sections.push(
                `| ${escapeMd(row.repository)} | \`${escapeMd(row.packageName)}\` | ${row.count} `
                + `| ${row.highestTarget ? `\`${escapeMd(row.highestTarget)}\`` : '—'} | ${reasons} |`,
            )
        }
        sections.push('')
    }

    // ---- 2.5.2 Network Violations（deny-by-default 拦截的非白名单外联）----
    const networkViolations = result.networkViolations ?? []
    if (networkViolations.length > 0) {
        sections.push(
            '## Network Violations',
            '',
            '> 非白名单外联已被本地审计代理拦截（502）；运行不得因此判定为「验证通过」。',
            '',
            '| Source | Method | Target |',
            '|--------|--------|--------|',
        )
        for (const violation of networkViolations.slice(0, 50)) {
            sections.push(
                `| ${escapeMd(violation.source)} | ${escapeMd(violation.method)} | \`${escapeMd(redactNetworkTarget(violation.target))}\` |`,
            )
        }
        if (networkViolations.length > 50) {
            sections.push('', `> 其余 ${networkViolations.length - 50} 条见 JSON 报告。`)
        }
        sections.push('')
    }

    // ---- 2.6 Repeated Failure Attempts（同告警尝试记录；仅记录存在时渲染）----
    const attemptRecords = result.attemptTracking ?? []
    if (attemptRecords.length > 0) {
        sections.push(
            '## Repeated Failure Attempts',
            '',
            '> 尝试序号 = 同键（source / package / target version / plan strategy）已关闭 PR 数 + 1；',
            '> 第 3 次起跳过并计入 `Skipped: Repeated failure`，`--retry-failed` 可强制再试（标注「人工强制」）。',
            '',
            '| Repository | Package | Attempt Key | Attempt | Status |',
            '|------------|---------|-------------|---------|--------|',
        )
        for (const record of attemptRecords) {
            sections.push(
                `| ${escapeMd(record.repository)} | \`${escapeMd(record.packageName)}\` | \`${escapeMd(record.key)}\` | ${record.attempt} | ${attemptStatusLabel(record.status)} |`,
            )
        }
        sections.push('')
    }

    // ---- 2.7 Delivery Skipped（基线红的交付降级；有记录时渲染）----
    const deliverySkips = result.deliverySkips ?? []
    if (deliverySkips.length > 0) {
        sections.push(
            '## Delivery Skipped',
            '',
            '> 修复后安装验证仍为**既有失败**（本次改动前即为红）→ 修复未被交付；',
            '> exit code 不受影响（`PRE_EXISTING_FAILURE` 在跳过类白名单内）。',
            '',
            '| Repository | Failing command | Carrier |',
            '|------------|-----------------|---------|',
        )
        for (const record of deliverySkips) {
            const carrier = describeDeliveryCarrier(record.carrier)
            const repos = record.repositories.length > 0
                ? record.repositories.map((repo) => `\`${escapeMd(repo)}\``).join('<br>')
                : '—'
            const commands = record.failingCommands.length > 0
                ? record.failingCommands.map((command) => `\`${escapeMd(command)}\``).join('<br>')
                : '—'
            sections.push(`| ${repos} | ${commands} | ${carrier} |`)
        }
        sections.push('')
    }

    // ---- 2.8 Verification Skipped（预算 / 0 写入；不计失败、不回滚）----
    const verificationSkipped = repositories.filter((repo) => repo.verificationSkipped !== undefined)
    if (verificationSkipped.length > 0) {
        sections.push(
            '## Verification Skipped',
            '',
            '> 验证未执行（运行预算不足 / 本次无写入）：不得视为验证通过，也不计入失败；'
            + '预算跳过阻断交付，本次无写入则无交付内容。',
            '',
            '| Repository | Reason |',
            '|------------|--------|',
        )
        for (const repo of verificationSkipped) {
            sections.push(
                `| \`${escapeMd(repo.repository)}\` | ${formatVerificationSkipReason(repo.verificationSkipped!)} |`,
            )
        }
        sections.push('')
    }

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

    // ---- 3.5 Supply Chain Warnings（路径 A 投毒合入前人工确认依据）----
    if (result.supplyChainWarnings && result.supplyChainWarnings.length > 0) {
        sections.push(
            '## ⚠️ Supply Chain Warnings',
            '',
            '> 以下本次新增/升级的包带 lifecycle scripts 且已被目标仓库 `allowBuilds` 批准——安装时脚本将真实执行，是投毒扩散面（event-stream 模式）。合入 PR 前请人工确认。',
            '',
            '| Package | Version | Scripts | Repository |',
            '|---------|---------|---------|------------|',
        )
        for (const w of result.supplyChainWarnings) {
            sections.push(
                `| \`${escapeMd(w.packageName)}\` | \`${escapeMd(w.version)}\` | ${w.scriptTypes.map((t) => `\`${escapeMd(t)}\``).join(', ')} | ${escapeMd(w.repository)} |`,
            )
        }
        sections.push('')
    }

    // ---- 3.6 Alerts Disabled（方案 A：未启用 ≠ 失败，单列展示）----
    if (result.alertsDisabled && result.alertsDisabled.length > 0) {
        sections.push(
            '## Alerts Disabled',
            '',
            '> 以下仓库**未启用**对应 alerts 功能（预期状态，非获取失败；不影响退出码）。',
            '> 开启方式：仓库 Settings → Code security 中启用对应功能（Dependabot alerts / GitHub Advanced Security 下的 Code Scanning、Code Quality）。',
            '',
            '| Repository | Source | Message |',
            '|------------|--------|---------|',
        )
        for (const d of result.alertsDisabled) {
            sections.push(`| ${escapeMd(d.repository)} | ${escapeMd(d.source)} | ${escapeMd(d.message)} |`)
        }
        sections.push('')
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
                        fromVer = action.fromVersion || '—'
                        toVer = action.toVersion || '—'
                        if (action.isMajor === undefined) {
                            major = '—'
                        } else {
                            major = action.isMajor ? 'Yes' : 'No'
                        }
                    } else if (failedAction) {
                        icon = '❌ Failed'
                        fromVer = failedAction.fromVersion || '—'
                        toVer = failedAction.toVersion || '—'
                    } else {
                        icon = '⏭️ Skipped'
                        toVer = alert.recommendedVersion || '—'
                    }
                    const ruleOrAdvisory = alert.ruleId || '—'
                    const alertClass = alertClassLabel(alert.alertClass)
                    sections.push(`| \`${alert.packageName}\` | ${escapeMd(ruleOrAdvisory)} | ${alertClass} | ${alert.severity.toUpperCase()} | ${fromVer} | ${toVer} | ${major} | ${icon} |`)
                }
                // 依赖链展示（pnpm-audit 源有 dependencyPath 时）
                const alertsPaths = repo.alerts.filter((a) => a.dependencyPath && a.dependencyPath.length > 0)
                if (alertsPaths.length > 0) {
                    sections.push('', '**Dependency paths:**', '')
                    for (const a of alertsPaths) {
                        for (const p of a.dependencyPath ?? []) {
                            sections.push(`- \`${escapeMd(a.packageName)}\`: \`${escapeMd(p)}\``)
                        }
                    }
                }
                sections.push('')
            } else {
                sections.push('_No alerts for this repository._', '')
            }
        }
    }

    // ---- 5.4 Family Lockstep（家族锁步摘要：命中家族 / 成员 / 跳过成员）----
    const familySummaries = collectFamilySummaries(actions)
    if (familySummaries.length > 0) {
        const multiRepo = new Set(familySummaries.map((familySummary) => familySummary.repository)).size > 1
        const headers = multiRepo
            ? ['Repository', 'Family', 'Members', 'Skipped']
            : ['Family', 'Members', 'Skipped']
        sections.push('## Family Lockstep', '')
        sections.push(`| ${headers.join(' | ')} |`)
        sections.push(`|${headers.map(() => '---').join('|')}|`)
        for (const familySummary of familySummaries) {
            const members = familySummary.members.map((member) => `\`${escapeMd(member)}\``).join(', ')
            const skipped = familySummary.skipped.length > 0
                ? familySummary.skipped.map((member) => `\`${escapeMd(member)}\``).join(', ')
                : '—'
            const cells = multiRepo
                ? [escapeMd(familySummary.repository), `\`${escapeMd(familySummary.family)}\``, members, skipped]
                : [`\`${escapeMd(familySummary.family)}\``, members, skipped]
            sections.push(`| ${cells.join(' | ')} |`)
        }
        sections.push('')
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

    // ---- 5.6 Code Quality Findings（静态分析类 findings 报告段）----
    // 独立于 Code Scanning 段：cq 全部归 C 类，无修复动作、无 fixedKeys 关联；
    // 报告仅展示 + 给人工审查建议（fetcher 注入的 rule.description）
    const cqFindings = collectCodeQualityFindings(result)
    if (cqFindings.length > 0) {
        sections.push(
            '## Code Quality Findings',
            '',
            '> Code Quality findings 由 GitHub CodeQL maintainability / reliability 规则生成；本工具首版仅做报告接入（不可自动修复）。',
            '',
            '| Repository | Rule | Location | Severity | Summary | Suggestion |',
            '|------------|------|----------|----------|---------|------------|',
        )
        for (const f of cqFindings) {
            sections.push(
                `| ${escapeMd(f.repository)} | \`${escapeMd(f.ruleId)}\` | \`${escapeMd(f.location)}\` | ${f.severity.toUpperCase()} | ${escapeMd(f.summary)} | ${escapeMd(f.suggestion)} |`,
            )
        }
        sections.push('')
    }

    // ---- 5.7 Verification Alignment（验证链与目标仓库 CI 口径；仅执行过验证链时渲染）----
    if (result.ciAlignment && result.ciAlignment.length > 0) {
        sections.push(
            '## Verification Alignment',
            '',
            '> 本次验证链与目标仓库默认分支 CI 的**可识别命令类别**比对（只比对命令口径，不预测 CI 结果）。',
            '',
            '| Repository | Status | Commands | Notes |',
            '|------------|--------|----------|-------|',
        )
        for (const record of result.ciAlignment) {
            const description = describeCiAlignment(record)
            const commands = record.commands.length > 0
                ? record.commands.map((c) => `\`${escapeMd(c)}\``).join('<br>')
                : '—'
            const notes = [description.headline, ...description.notes].join('<br>')
            sections.push(
                `| ${escapeMd(record.repository)} | ${description.statusLabel} | ${commands} | ${escapeMd(notes)} |`,
            )
        }
        sections.push('')
    }

    // ---- 5.8 Check Attribution（PR check 回环归因；全部通过时不渲染，避免空表噪音）----
    const watchAttempts = result.prCheckWatch?.attempts ?? []
    const failedChecks = watchAttempts.flatMap((attempt) => attempt.failedChecks ?? [])
    const hasNonPassedAttempt = watchAttempts.some((attempt) => attempt.state !== 'passed')
    if (failedChecks.length > 0 || hasNonPassedAttempt) {
        const groups = groupCheckAttributions(failedChecks)
        const counts = groups
            .map((group) => `\`${group.attribution}\` ${group.items.length}`)
            .join(' · ')
        sections.push(
            '## Check Attribution',
            '',
            '> PR check 回环的失败项按同一归因纯函数分组：归因只解释失败来源，**不豁免** mergify 的 `check-success` 门禁；仅 `self_caused` 可能在显式 `--close-failed-pr` 下关闭 PR。',
            '',
        )
        if (counts) {
            sections.push(`归因计数：${counts}`, '')
        }
        sections.push(
            '| PR | State | Attribution | Failed Jobs |',
            '|----|-------|-------------|-------------|',
        )
        for (const attempt of watchAttempts) {
            const jobs = attempt.failedChecks && attempt.failedChecks.length > 0
                ? attempt.failedChecks
                    .map((check) => `\`${escapeCodeName(check.name)}\` (${check.attribution})`)
                    .join('<br>')
                : '—'
            const attribution = attempt.attribution ? `\`${attempt.attribution}\`` : '—'
            sections.push(`| #${attempt.pr.number} | \`${attempt.state}\` | ${attribution} | ${jobs} |`)
        }
        if (result.prCheckWatch?.runBudgetExhausted) {
            sections.push('', '> 本次运行的 check 等待总预算已耗尽：其余 PR 未等待，交给后续运行 / 平台 PR Check。')
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

/** 报告 Header 的 Alert Source 标签（多源并行时组合展示）。 */
function alertSourceLabel(config: RunResult['config']): string {
    if (config.alertSource === 'pnpm-audit') {
        return 'pnpm-audit (local workspace)'
    }
    const extras: string[] = []
    if (config.codeScanningEnabled) {
        extras.push('Code Scanning API')
    }
    if (config.codeQualityEnabled) {
        extras.push('Code Quality API')
    }
    if (extras.length === 0) {
        return 'GitHub Dependabot API'
    }
    return `GitHub Dependabot + ${extras.join(' + ')}`
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

/** 同告警尝试处置标签（报告专用措辞；PR 正文只写 HTML 注释，不渲染状态标签）。 */
function attemptStatusLabel(status: RepeatedAttemptStatus): string {
    switch (status) {
        case 'attempt': return 'attempt'
        case 'forced': return 'forced (manual retry)'
        case 'skipped': return 'skipped (attempt limit)'
        default: return String(status)
    }
}

function actionDetails(action: FixAction, error?: string): string {
    const base = ((): string => {
        switch (action.type) {
            case 'dependency-upgrade':
                // 成员级升级展示目标 manifest，根升级不受影响
                return `${action.fromVersion || '—'} → ${action.toVersion || '—'}${action.filePath ? ` (${action.filePath})` : ''}`
            case 'lockfile-repair':
                return action.strategy
                    ? `${action.strategy}: ${action.diff ?? ''}`
                    : action.diff ?? '—'
            case 'verification': {
                // 既有失败（修复前即红）不归因本次改动，必须在报告层可与「本次引入的失败」区分；
                // source 逐条标注命令来源（默认链 / 仓库自定义链 / CI 镜像脚本）
                const parts: string[] = []
                if (action.preExisting) {
                    parts.push('既有失败（修复前即红，未归因本次改动）')
                }
                if (action.commandSource) {
                    parts.push(`source=${action.commandSource}`)
                }
                return parts.length > 0 ? parts.join('；') : '—'
            }
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

/** 转义 Markdown 表格中的 `\` 与 `|`（先转义反斜杠避免已有转义双重处理）与换行（错误消息常含多行，折叠为空格） */
function escapeMd(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * 交付降级载体的人类可读描述（报告表格用）。
 *
 * `mode === 'draft'` 且没有 `draftPr` 表示本次**没有新建**草稿 PR（同指纹既有 PR / 无改动 / 创建失败），
 * 不能写成「本 PR」——PR 正文里的「本 PR」语义由 `buildDraftDeliveryNotice` 单独表达。
 */
function describeDeliveryCarrier(carrier: DeliverySkipCarrier): string {
    if (carrier.issue) {
        return `issue #${carrier.issue.number} (${carrier.issue.created ? 'created' : 'already exists'})`
    }
    if (carrier.draftPr) {
        return `draft PR #${carrier.draftPr.number}`
    }
    return carrier.mode === 'draft' ? 'draft (no new PR)' : 'report only (skip)'
}

/** 行内代码片段转义：在 `escapeMd` 基础上剥离反引号（名称来自目标仓库，反引号会提前闭合代码段）。 */
function escapeCodeName(text: string): string {
    return escapeMd(text).replace(/`/g, '')
}
