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

/**
 * 失败阶段下拉选项顺序（与 `server/services/run-failure-classify.ts` 的 `RUN_FAILURE_STAGES` 同序；
 * 分类口径单一事实源在服务端，前端仅复制枚举词汇用于筛选控件）。
 */
export const RUN_FAILURE_STAGE_OPTIONS = [
    'source',
    'clone',
    'install',
    'fix',
    'verify',
    'deliver',
    'runtime',
    'cleanup',
    'unknown',
] as const

/** 处置建议下拉选项顺序（同上） */
export const RUN_FAILURE_KIND_OPTIONS = ['transient', 'deterministic', 'unknown'] as const

/** 失败阶段 i18n 标签（null → null；未知阶段原样返回） */
export const failureStageLabel = (stage: string | null | undefined, t: Translator): string | null => {
    if (!stage) {
        return null
    }
    return ({
        source: t('runs.failureStage.source'),
        clone: t('runs.failureStage.clone'),
        install: t('runs.failureStage.install'),
        fix: t('runs.failureStage.fix'),
        verify: t('runs.failureStage.verify'),
        deliver: t('runs.failureStage.deliver'),
        runtime: t('runs.failureStage.runtime'),
        cleanup: t('runs.failureStage.cleanup'),
        unknown: t('runs.failureStage.unknown'),
    } as Record<string, string>)[stage] ?? stage
}

/** 处置建议 i18n 标签（null → null；未知值原样返回） */
export const failureKindLabel = (kind: string | null | undefined, t: Translator): string | null => {
    if (!kind) {
        return null
    }
    return ({
        transient: t('runs.failureKind.transient'),
        deterministic: t('runs.failureKind.deterministic'),
        unknown: t('runs.failureKind.unknown'),
    } as Record<string, string>)[kind] ?? kind
}

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
