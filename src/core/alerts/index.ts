export type AlertSource = 'dependabot' | 'code-scanning'

export type AlertSeverity = 'unknown' | 'low' | 'medium' | 'high' | 'critical'

export interface AlertReference {
    id: string
    source: AlertSource
    repository: string
    severity: AlertSeverity
}

export function createAlertReference(input: AlertReference): AlertReference {
    return input
}
