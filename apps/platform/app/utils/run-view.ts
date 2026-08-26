type Translator = (key: string, params?: Record<string, string | number>) => string

export const shortRunId = (id: string) => id.slice(0, 8)

export const alertsFound = (summary: Record<string, unknown> | null) => {
    const value = summary?.alertsFound
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export const runModeLabel = (mode: string, t: Translator) => ({
    'report-only': t('common.scanMode.reportOnly'),
    fix: t('common.scanMode.fix'),
    'fix-and-pr': t('common.scanMode.fixAndPr'),
})[mode] ?? mode

export const runExecutorLabel = (executorKind: string, t: Translator) => {
    switch (executorKind) {
        case 'github-action':
            return t('repos.githubAction')
        case 'sandbox':
            return t('repos.sandboxContainer')
        default:
            return t('repos.platformContainer')
    }
}

export const runThresholdLabel = (severityThreshold: string, t: Translator) => (
    severityThreshold === 'all' ? t('common.severity.all') : severityThreshold
)

export const formatRunDuration = (
    startedAt: string | null,
    finishedAt: string | null,
    t: Translator,
) => {
    if (!startedAt || !finishedAt) {
        return '—'
    }
    const started = new Date(startedAt).getTime()
    const finished = new Date(finishedAt).getTime()
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
        return '—'
    }
    const seconds = (finished - started) / 1000
    const formattedSeconds = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(seconds)
    return t('alerts.runDurationSeconds', { seconds: formattedSeconds })
}
