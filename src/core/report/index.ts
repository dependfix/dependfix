export interface ReportArtifact {
    format: 'markdown' | 'json'
    path: string
}

export interface ExecutionSummary {
    repositories: number
    alerts: number
    fixed: number
    failed: number
}

export function createEmptyExecutionSummary(): ExecutionSummary {
    return {
        repositories: 0,
        alerts: 0,
        fixed: 0,
        failed: 0,
    }
}
