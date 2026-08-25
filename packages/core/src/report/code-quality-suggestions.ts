import type { RunResult } from './types'

// ---------------------------------------------------------------------------
// Code Quality Findings 报告输出
//
// Code Quality findings 统一归 C 类（report-only），不可自动修复——
// 本模块产出报告段，按严重级别 + 类别（maintainability/reliability/...）展示。
//
// 与 Code Scanning Suggestions 的区别：
// - Code Scanning 有修复动作（templates），可能 noOp / failed，需区分 reason
// - Code Quality 无修复动作，无 fixedKeys / action 关联，统一 "人工审查" 建议
// ---------------------------------------------------------------------------

export interface CodeQualityFindingRow {
    repository: string
    ruleId: string
    /** 规则人类可读名（rule.title） */
    ruleTitle: string
    /** 位置：文件:起始行 */
    location: string
    severity: string
    summary: string
    /** 修复建议（fetcher 注入的 suggestion；缺失兜底） */
    suggestion: string
}

/**
 * 收集 Code Quality findings 为报告行。
 * 首版统一不可修复，建议文本直接采用 fetcher 注入的 `alert.suggestion`
 * （由 `rule.description` 或 fetcher 兜底文本填充）；不区分 reason（与 cs 不同）。
 *
 * 注：Code Quality rule.category（maintainability / reliability / 等）当前未注入
 * NormalizedSecurityAlert（fetcher 暂未扩展字段），报告 markdown 暂不展示 category 列；
 * 后续 fetcher 注入 category 后可在 row 中新增字段并同步 markdown 表头。
 */
export function collectCodeQualityFindings(result: RunResult): CodeQualityFindingRow[] {
    const rows: CodeQualityFindingRow[] = []
    for (const alert of result.alerts) {
        if (alert.source !== 'code-quality') {
            continue
        }
        const location = alert.startLine
            ? `${alert.manifestPath}:${alert.startLine}`
            : (alert.manifestPath || '—')

        rows.push({
            repository: alert.repository,
            ruleId: alert.ruleId || '—',
            ruleTitle: alert.packageName || alert.ruleId || '—',
            location,
            severity: alert.severity,
            summary: alert.summary || '—',
            suggestion: alert.suggestion ?? '人工审查该 Code Quality finding',
        })
    }
    return rows
}
