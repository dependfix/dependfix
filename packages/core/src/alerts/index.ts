export type AlertSource = 'dependabot' | 'code-scanning' | 'pnpm-audit'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export type FixStrategy = 'upgrade' | 'lock' | 'wait-upstream' | 'manual' | 'override'

/** Code Scanning 规则分类（A=自动修复白名单 / B=建议修复 / C=仅报告） */
export type AlertClass = 'auto-fixable' | 'suggested' | 'report-only'

/** Dependabot 报告中的依赖类型 */
export type DependencyType = 'direct' | 'transitive'

export interface NormalizedSecurityAlert {
    id: number
    source: AlertSource
    repository: string
    defaultBranch: string
    severity: AlertSeverity
    packageEcosystem: string
    packageName: string
    manifestPath: string
    ruleId: string
    summary: string
    htmlUrl: string
    fixable: boolean
    fixStrategy: FixStrategy | null
    recommendedVersion: string
    /** 依赖类型：`'direct'`（直接依赖）或 `'transitive'`（间接依赖），缺少数据时为 `undefined` */
    dependencyType?: DependencyType
    /**
     * Code Scanning 规则分类（A/B/C）；Dependabot / pnpm-audit 源无此概念，缺省为空。
     * 分类结果用于报告可见性与修复路由。
     */
    alertClass?: AlertClass
    /**
     * Code Scanning 告警起始行（most_recent_instance.location.start_line）；
     * 报告建议区块展示位置（文件:行）。
     */
    startLine?: number
    /** Code Scanning 告警结束行 */
    endLine?: number
    /**
     * Code Scanning 修复建议方向（rule-classifier.suggestionFor 生成，cli 侧填充）；
     * 报告/PR body 建议区块展示。
     */
    suggestion?: string
}

export const SEVERITY_MAP = {
    dependabot: {
        critical: 'critical' as const,
        high: 'high' as const,
        medium: 'medium' as const,
        low: 'low' as const,
    },
    'code-scanning': {
        error: 'high' as const,
        warning: 'medium' as const,
        note: 'low' as const,
    },
    'pnpm-audit': {
        critical: 'critical' as const,
        high: 'high' as const,
        error: 'high' as const,
        moderate: 'medium' as const,
        medium: 'medium' as const,
        warning: 'medium' as const,
        low: 'low' as const,
        info: 'low' as const,
        note: 'low' as const,
    },
} as const

/**
 * pnpm audit severity 归一化（对齐 security-alert-remediator 的 SEVERITY_RANK 口径）。
 * 未识别值 → 'unknown'（不抛异常，报告模型有 unknown 位）。
 */
export function normalizeAuditSeverity(value: string | null | undefined): AlertSeverity {
    const normalized = (value ?? '').trim().toLowerCase()
    if (!normalized) {
        return 'unknown'
    }
    return (SEVERITY_MAP['pnpm-audit'] as Record<string, AlertSeverity>)[normalized] ?? 'unknown'
}

export function mapCodeScanningSeverity(
    ruleSeverity: 'error' | 'warning' | 'note' | 'none',
): AlertSeverity {
    if (ruleSeverity === 'none') {
        return 'unknown'
    }
    return SEVERITY_MAP['code-scanning'][ruleSeverity]
}

export function isFixable(alert: Pick<NormalizedSecurityAlert, 'fixable' | 'fixStrategy'>): boolean {
    return alert.fixable && alert.fixStrategy !== null
}

export function createNormalizedAlert(input: NormalizedSecurityAlert): NormalizedSecurityAlert {
    return input
}

// Backward-compatible simplified reference, kept for lightweight filter/chaining contexts
export interface AlertReference {
    id: number
    source: AlertSource
    repository: string
    severity: AlertSeverity
}
