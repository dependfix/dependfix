/**
 * 平台前后端共享类型（app 侧视图类型，与 server/api 返回结构对齐）。
 */

/** 仓库视图（server/api/repos 返回结构；日期经 Nuxt 序列化为 ISO 字符串） */
export interface RepoView {
    id: string
    owner: string
    name: string
    platform: string
    defaultBranch: string
    packageManager: string
    credentialId: string | null
    credentialName: string | null
    actionWorkflowFile: string | null
    executorKind: string
    note: string | null
    tags: string[]
    lastScanAt: string | null
    createdAt: string
    updatedAt: string
}

/** 凭据视图（server/api/credentials 返回结构，token 永不返回） */
export interface CredentialView {
    id: string
    name: string
    type: 'classic-pat' | 'fine-grained-pat' | 'github-app'
    note: string | null
    lastUsedAt: string | null
    createdAt: string
    updatedAt: string
    hasToken: boolean
}

/** 全局角色（与 server guard.ts Role 对齐；前端只读消费） */
export type Role = 'admin' | 'org_admin' | 'viewer'

/** 用户管理视图（server/api/users 返回结构） */
export interface UserView {
    id: string
    email: string
    name: string | null
    image: string | null
    role: Role | null
    banned: boolean
    banReason: string | null
    emailVerified: boolean
    createdAt: string
    updatedAt: string
}

/** 仓库选择策略（与 server ScheduleSelectorKind 对齐） */
export type ScheduleSelectorKind = 'all' | 'organization' | 'tag' | 'explicit'

/** 定时计划视图（server/api/schedules 返回结构） */
export interface ScheduleView {
    id: string
    name: string
    cron: string
    timezone: string | null
    selectorKind: ScheduleSelectorKind
    selectorJson: string | null
    mode: string
    severityThreshold: string
    enabled: boolean
    lastTriggeredAt: string | null
    lastBatchRunId: string | null
    createdAt: string
    updatedAt: string
}

/** 批量运行状态（与 server BatchRunStatus 对齐） */
export type BatchRunStatus = 'running' | 'completed' | 'failed'

/** 跨仓库聚合统计（BatchRun.summaryJson 形状） */
export interface BatchRunSummary {
    alertsTotal: number
    severityCounts: Record<string, number>
    fixedCount: number
}

/** 批量运行视图（server/api/batch-runs 返回结构；列表为存储值，详情为实时聚合值） */
export interface BatchRunView {
    id: string
    source: 'scheduled' | 'manual'
    scheduleId: string | null
    mode: string
    severityThreshold: string
    repositoryCount: number
    finishedCount: number
    completedCount: number
    failedCount: number
    pendingCount: number
    summary: BatchRunSummary | null
    status: BatchRunStatus
    finishedAt: string | null
    createdAt: string
}

/** 批量运行下属 ScanRun（详情 runs 数组元素，与 /api/runs 视图同构） */
export interface BatchRunRun {
    id: string
    repositoryId: string
    owner: string | null
    name: string | null
    mode: string
    severityThreshold: string
    executorKind: string
    status: string
    startedAt: string | null
    finishedAt: string | null
    runUrl: string | null
    summary: Record<string, unknown> | null
    error: { code: string, message: string } | null
}
