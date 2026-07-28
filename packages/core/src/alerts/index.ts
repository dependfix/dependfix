export type AlertSource = 'dependabot' | 'code-scanning'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export type FixStrategy = 'upgrade' | 'lock' | 'wait-upstream' | 'manual'

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
} as const

export function mapCodeScanningSeverity(
    ruleSeverity: 'error' | 'warning' | 'note' | 'none',
): AlertSeverity {
    if (ruleSeverity === 'none') { return 'unknown' }
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
