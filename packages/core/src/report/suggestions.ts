import type { RunResult } from './types'

// ---------------------------------------------------------------------------
// Code Scanning 建议型输出（T304）
//
// 无法自动修复的 Code Scanning 告警必须可见且带原因：
// - B 类建议规则（需人工判断）
// - C 类仅报告（未列入列表）
// - A 类但修复 noOp（文件已合规 / 陈旧告警 / 无模板 / 歧义回退，error 说明）
// - A 类但修复失败（真实失败，error 说明）
//
// 报告 §Code Scanning Suggestions 与 PR body 共用本函数。
// ---------------------------------------------------------------------------

export interface CodeScanningSuggestionRow {
    repository: string
    ruleId: string
    /** 位置：文件:起始行（行号缺省时仅文件） */
    location: string
    severity: string
    summary: string
    /** 未自动修复原因（区分 B/C 类 / noOp / 修复失败） */
    reason: string
    /** 建议修复方向（fetcher 注入的 alert.suggestion） */
    suggestion: string
}

/**
 * 收集未自动修复的 Code Scanning 告警为建议行。
 * 已修复判定与报告 fixedKeys 口径一致（code-scanning 键 repo/ruleId@filePath）。
 */
export function collectCodeScanningSuggestions(result: RunResult): CodeScanningSuggestionRow[] {
    const { alerts, actions } = result

    const fixedKeys = new Set(
        actions
            .filter((a) => a.success && !a.noOp && a.type === 'code-scanning-fix')
            .map((a) => a.filePath
                ? `${a.repository}/${a.target}@${a.filePath}`
                : `${a.repository}/${a.target}`),
    )

    const rows: CodeScanningSuggestionRow[] = []
    for (const alert of alerts) {
        if (alert.source !== 'code-scanning') {
            continue
        }
        const alertKey = `${alert.repository}/${alert.ruleId}@${alert.manifestPath}`
        if (fixedKeys.has(alertKey)) {
            continue // 已自动修复
        }

        const action = actions.find(
            (a) => a.type === 'code-scanning-fix'
                && a.repository === alert.repository
                && a.target === alert.ruleId
                && a.filePath === alert.manifestPath,
        )

        let reason: string
        if (action?.noOp) {
            reason = action.error ?? '无需修改（文件已合规）'
        } else if (action && !action.success) {
            reason = `修复失败：${action.error ?? 'unknown error'}`
        } else if (alert.alertClass === 'suggested') {
            reason = 'B 类建议规则（需人工判断）'
        } else if (alert.alertClass === 'auto-fixable') {
            reason = 'A 类规则未产生修复动作（异常路径，请人工检查）'
        } else {
            reason = 'C 类仅报告（未列入自动修复/建议列表）'
        }

        const location = alert.startLine
            ? `${alert.manifestPath}:${alert.startLine}`
            : (alert.manifestPath || '—')

        rows.push({
            repository: alert.repository,
            ruleId: alert.ruleId || '—',
            location,
            severity: alert.severity,
            summary: alert.summary || '—',
            reason,
            // suggestion 由 fetcher 注入（suggestionFor 保证非空；此处兜底防旧数据）
            suggestion: alert.suggestion ?? '人工审查该 Code Scanning 告警',
        })
    }
    return rows
}
