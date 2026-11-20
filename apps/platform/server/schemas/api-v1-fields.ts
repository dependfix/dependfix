import { z } from 'zod'

/**
 * `/api/v1` 字段白名单与分页契约（设计稿 §6.2 / §6.3）。
 *
 * - 白名单是**契约单测的比对基线**：响应出现清单外字段即失败，拦无意漂移；
 *   同一提交里同时删字段与清单不构成本层的强制力（发布物快照在后续阶段承担）。
 * - 集合响应统一 `{ items, total, page, pageSize }`；单资源返回裸对象，不引入统一信封。
 */

/** 非 runs 集合的分页默认 / 上限（设计稿 §6.2：默认 100 / 最大 500） */
export const API_V1_PAGE_SIZE_DEFAULT = 100
export const API_V1_PAGE_SIZE_MAX = 500

/** 集合分页参数（repos / alerts / pr-checks 共用；runs 沿用 runsPaginationShape） */
export const apiV1PaginationShape = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).default(API_V1_PAGE_SIZE_DEFAULT)
        .transform((value) => Math.min(value, API_V1_PAGE_SIZE_MAX)),
}

/** 集合响应形状（分页参数超上限已在 schema 内静默钳制） */
export const toPage = <T>(items: T[], total: number, page: number, pageSize: number) => ({
    items,
    total,
    page,
    pageSize,
})

/** v1 必须在任何响应中剔除的字段（字段白名单负向断言的单一事实源） */
export const API_V1_FORBIDDEN_FIELDS = [
    'logs',
    'logsText',
    'verifyCommands',
    'credentialId',
    'credentialName',
] as const

/** 各端点允许字段（顺序即响应构造顺序，便于目检） */
export const API_V1_FIELDS = {
    health: ['version', 'commit', 'startedAt', 'schema'],
    repo: [
        'id',
        'owner',
        'name',
        'platform',
        'defaultBranch',
        'packageManager',
        'hasCredential',
        'actionWorkflowFile',
        'executorKind',
        'note',
        'tags',
        'sandboxLimits',
        'sandboxImage',
        'hasCustomVerifyCommands',
        'prCheckFocus',
        'executionTimeoutMs',
        'verifyCommandTimeoutMs',
        'installTimeoutMs',
        'cloneTimeoutMs',
        'allowMajorUpgrade',
        'aiEnabled',
        'aiTrigger',
        'lastScanAt',
        'createdAt',
        'updatedAt',
    ],
    run: [
        'id',
        'repositoryId',
        'owner',
        'name',
        'mode',
        'severityThreshold',
        'executorKind',
        'status',
        'startedAt',
        'finishedAt',
        'runUrl',
        'summary',
        'exitCode',
        'environmentalFailureCount',
        'memoryMaxBytes',
        'peakRssBytes',
        'oomKilled',
        'resource',
        'error',
        'failureCode',
        'failureStage',
        'failureKind',
    ],
    runDetailExtra: ['buildVersion', 'buildCommit', 'retriedFromRunId', 'results'],
    runResult: [
        'id',
        'source',
        'severity',
        'packageName',
        'manifestPath',
        'ruleId',
        'summary',
        'fixable',
        'fixStrategy',
        'recommendedVersion',
        'htmlUrl',
        'fixStatus',
        'errorMessage',
    ],
    alert: [
        'id',
        'runId',
        'repository',
        'source',
        'severity',
        'packageName',
        'manifestPath',
        'ruleId',
        'summary',
        'fixable',
        'fixStrategy',
        'recommendedVersion',
        'htmlUrl',
        'fixStatus',
        'errorMessage',
        'upstreamId',
        'occurrenceCount',
        'firstSeenAt',
        'lastSeenAt',
        'supersededAt',
        'ghsaId',
        'cveIds',
    ],
    prCheck: [
        'id',
        'repositoryId',
        'repository',
        'prNumber',
        'headSha',
        'authorLogin',
        'conclusion',
        'prState',
        'overallStatus',
        'focusConfigured',
        'signals',
        'failureSources',
        'checkRunId',
        'detailsUrl',
        'errorMessage',
        'alertFiring',
        'acknowledgedAt',
        'acknowledgedByUserId',
        'lastPolledAt',
        'createdAt',
        'updatedAt',
    ],
    dashboard: [
        'repositoryCount',
        'alertsTotal',
        'severityCounts',
        'fixedCount',
        'topPackages',
        'latestRun',
    ],
    logGrouped: [
        'view',
        'total',
        'returned',
        'groupCount',
        'truncated',
        'errorTruncated',
        'droppedBefore',
        'groups',
    ],
    logGroup: ['level', 'template', 'count', 'firstAt', 'lastAt', 'sample'],
    logRaw: ['view', 'total', 'returned', 'truncated', 'errorTruncated', 'droppedBefore', 'entries'],
    logEntry: ['timestamp', 'level', 'message'],
} as const
