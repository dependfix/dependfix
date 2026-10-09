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
    /**
     * 仓库级自定义验证命令（空数组 = 走引擎默认验证链；见 docs/standards/platform.md §3.8）。
     * 安全：等价于远程命令执行面，写入门槛 admin / org_admin，变更登记 audit_event。
     */
    verifyCommands: string[]
    /** AI 研判开关（todo.md §M26.1 + M25.2a 实体扩展；与 POST /api/repos/[id]/ai-config 联动） */
    aiEnabled: boolean
    /** AI 研判触发范围（failure / major / both） */
    aiTrigger: 'failure' | 'major' | 'both'
    lastScanAt: string | null
    createdAt: string
    updatedAt: string
}

/** 凭据视图（server/api/credentials 返回结构，token 永不返回）
 *
 * GitHub App 路径（type='github-app'）下额外包含 appId / installationId / botLogin 公开信息。
 */
export interface CredentialView {
    id: string
    name: string
    type: 'classic-pat' | 'fine-grained-pat' | 'github-app'
    note: string | null
    lastUsedAt: string | null
    createdAt: string
    updatedAt: string
    hasToken: boolean
    /** GitHub App 路径：公开信息（明文） */
    appId?: string
    /** GitHub App 路径：公开信息 */
    installationId?: string
    /** GitHub App 路径：bot 用户名（可选） */
    botLogin?: string | null
}

/** 全局角色（与 server guard.ts Role 对齐；前端只读消费） */
export type Role = 'admin' | 'org_admin' | 'viewer'

/** 用户管理视图（server/api/users 返回结构）
 * _roleRank 是前端排序键派生字段（由 withRoleRank 注入），不入库，
 * 仅供迁移前的 `<Column sortable field="_roleRank">` 业务语义排序使用。 */
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
    _roleRank?: number
}

/** 仓库选择策略（与 server ScheduleSelectorKind 对齐） */
export type ScheduleSelectorKind = 'all' | 'organization' | 'tag' | 'explicit'

/** 计划业务类型（与 server ScheduleKind 对齐：scan=定时批量扫描 / pr-check=PR Check 状态监测） */
export type ScheduleKind = 'scan' | 'pr-check'

/**
 * 手动触发返回（与 server `ScheduleTriggerResult` 判别联合对齐）。
 * 服务端新增 `kind` 时须同步此处——前端 `trigger()` 按此联合分支消费。
 */
export type ScheduleTriggerResult = { kind: 'scan', batchRunId: string, repositoryCount: number }
    | { kind: 'pr-check', processed: number, errors: number, skipped?: boolean }

/** 定时计划视图（server/api/schedules 返回结构） */
export interface ScheduleView {
    id: string
    name: string
    kind: ScheduleKind
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

/** 批量运行视图（server/api/batch-runs 返回结构；列表为存储值，详情为实时聚合值）。
 * updatedAt 用于前端增量 reconcile：仅当服务端 updatedAt 与本地不同时替换行引用，
 * 避免迁移前的 DataTable 整表 reconcile 引发屏闪。
 * _statusRank 是前端排序键派生字段（由 withStatusRank 注入），不入库，
 * 仅供迁移前的 `<Column sortable field="_statusRank">` 业务语义排序使用。 */
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
    updatedAt: string
    _statusRank?: number
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
