/**
 * 表格排序辅助工具：枚举字段业务语义排序键 + map helper。
 *
 * 背景：PrimeVue DataTable `<Column sortable field="x">` 默认按字段值字符串字典序比较；
 * 但 severity / status / role / fixStatus 等枚举字段按字典序排序不符合用户直觉
 * （如字典序会把 unknown 排第一，但用户期望 critical 排第一）。
 *
 * 设计：fetchData 后调用 `withXxxRank(items)` 给每个对象增加派生字段（带下划线前缀
 * `_severityRank` / `_statusRank` / `_roleRank` / `_fixStatusRank`），column `field`
 * 指向派生字段即可实现业务语义排序。派生字段**不入库**，仅前端内存使用。
 *
 * 相关文档：[docs/plan/todo.md §C60 平台表格排序（2026-08-20 启动）](../../plan/todo.md)
 */

/** 严重级别排序键：critical 优先于其他（critical > high > medium > low > unknown）。
 * 未在表中的字符串落到 0（最低），避免空值意外排到最前。 */
export const SEVERITY_RANK: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    unknown: 1,
}

/** 运行状态排序键：running 排前（用户更关心进行中的）。 */
export const STATUS_RANK: Record<string, number> = {
    running: 3,
    completed: 2,
    failed: 1,
}

/** 单次运行（runs.vue）排序键：覆盖 pending / dispatched / running / completed / failed 全集。
 * RG-W03 修复：runs.vue 状态全集比 batch-runs 多（pending/dispatched），共享 STATUS_RANK 会
 * 让 runs 页面 pending 落到 0、与其他状态无序。独立常量确保业务语义。 */
export const RUN_STATUS_RANK: Record<string, number> = {
    pending: 0,
    dispatched: 1,
    failed: 1,
    completed: 2,
    running: 3,
}

/** 修复状态排序键（告警 fixStatus）：success 排前（已修复的优先看）。 */
export const FIX_STATUS_RANK: Record<string, number> = {
    success: 5,
    converged: 4,
    skipped: 3,
    pending: 2,
    failed: 1,
}

/** 角色排序键：admin 排前。null/undefined 视为 0（最低）。 */
export const ROLE_RANK: Record<string, number> = {
    admin: 3,
    org_admin: 2,
    viewer: 1,
}

/** 给数据集每个对象补 `_severityRank` 派生字段。 */
export function withSeverityRank<T extends { severity: string }>(items: T[]): (T & { _severityRank: number })[] {
    return items.map((item) => ({
        ...item,
        _severityRank: SEVERITY_RANK[item.severity] ?? 0,
    }))
}

/** 给数据集每个对象补 `_statusRank` 派生字段（用于运行状态：running / completed / failed）。 */
export function withStatusRank<T extends { status: string }>(items: T[]): Array<T & { _statusRank: number }> {
    return items.map((item) => ({
        ...item,
        _statusRank: STATUS_RANK[item.status] ?? 0,
    }))
}

/** 给数据集每个对象补 `_statusRank` 派生字段（用于 runs.vue 状态全集：pending/dispatched/...）。 */
export function withRunStatusRank<T extends { status: string }>(items: T[]): Array<T & { _statusRank: number }> {
    return items.map((item) => ({
        ...item,
        _statusRank: RUN_STATUS_RANK[item.status] ?? 0,
    }))
}

/** 给数据集每个对象补 `_fixStatusRank` 派生字段（用于告警 fixStatus：success / failed / ...）。 */
export function withFixStatusRank<T extends { fixStatus: string }>(items: T[]): (T & { _fixStatusRank: number })[] {
    return items.map((item) => ({
        ...item,
        _fixStatusRank: FIX_STATUS_RANK[item.fixStatus] ?? 0,
    }))
}

/** 给数据集每个对象补 `_roleRank` 派生字段。role 可为 null/undefined（视为 0）。 */
export function withRoleRank<T extends { role: string | null | undefined }>(items: T[]): Array<T & { _roleRank: number }> {
    return items.map((item) => ({
        ...item,
        _roleRank: item.role ? (ROLE_RANK[item.role] ?? 0) : 0,
    }))
}

/**
 * 更新单个对象的 status + _statusRank（用于 fetchDetail 等运行时状态变更路径）。
 * RG-B07 修复：batch-runs 详情同步 status 时必须同步派生 _statusRank，否则 DataTable
 * sortable 排序引用陈旧 rank 导致业务语义错位。
 */
export function updateStatusRank<T extends { status: string }>(item: T & { _statusRank?: number }, status: string): T & { _statusRank: number } {
    item.status = status as T['status']
    item._statusRank = STATUS_RANK[status] ?? 0
    return item as T & { _statusRank: number }
}

/**
 更新单个对象的 run status + _statusRank（runs.vue 专用，覆盖 pending/dispatched 等全集）。
 */
export function updateRunStatusRank<T extends { status: string }>(item: T & { _statusRank?: number }, status: string): T & { _statusRank: number } {
    item.status = status as T['status']
    item._statusRank = RUN_STATUS_RANK[status] ?? 0
    return item as T & { _statusRank: number }
}

/**
 * 更新单个对象的 role + _roleRank（用于 setRole 等运行时角色变更路径）。
 * RG-B07 修复：users.vue setRole 修改 user.role 时必须同步派生 _roleRank。
 */
export function updateRoleRank<T extends { role: string | null | undefined }>(item: T & { _roleRank?: number }, role: string | null): T & { _roleRank: number } {
    item.role = role
    item._roleRank = role ? (ROLE_RANK[role] ?? 0) : 0
    return item as T & { _roleRank: number }
}
