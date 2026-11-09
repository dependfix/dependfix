import { z } from 'zod'
import type { SelectQueryBuilder } from 'typeorm'
import { ScanRun, SCAN_RUN_STATUSES } from '#server/entities/scan-run'
import { RUN_FAILURE_KINDS, RUN_FAILURE_STAGES } from '#server/services/run-failure-classify'

/**
 * runs 列表（GET /api/runs）与日志导出（GET /api/runs/logs-export）共用的筛选与分页解析。
 *
 * 抽出的动机：两处必须使用同一套白名单与多值解析口径，避免「列表能筛、导出不能筛」
 * 或白名单漂移；分页参数由 `runsPaginationShape` 共用（导出侧仅在**显式传入**时按窗口取数，
 * 判定见各端点自身）。
 */

/**
 * 逗号分隔多值 query（`status=failed,dispatched`）→ 去空后的数组。
 * 空串 / 仅分隔符 / 缺省 → `undefined`（不应用该维度过滤）。
 */
const parseMultiValue = (raw: string | undefined): string[] | undefined => {
    if (!raw || raw.length === 0) {
        return undefined
    }
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return list.length > 0 ? list : undefined
}

/** 多值 query 字段：逗号分隔 + 取值必须落在白名单内（非法值 400，不静默丢弃）；原始串限长防异常输入 */
const multiValueEnum = (allowed: readonly string[], field: string) =>
    z.string().max(500).optional()
        .transform((v) => parseMultiValue(v))
        .refine((v) => v === undefined || v.every((item) => allowed.includes(item)), {
            message: `invalid ${field} value`,
        })

/** ISO 8601 时间（必须带时区；前端统一 `toISOString()` 提交） */
const isoDateTime = z.iso.datetime({ offset: true })

/**
 * runs 共用筛选参数（`repositoryId` + 失败分类三维度 + 开始时间区间）。
 * 注意：`organizationId` 不暴露为 query 参数——服务端隐式从默认组织注入（单组织模型）。
 *
 * `from` / `to` 是 **startedAt** 的闭区间；`startedAt` 为 NULL 的行在区间过滤时被排除
 * （NULL 无法与时间点比较）。区间校验（`from <= to`）由端点对最终 schema 追加 refine，
 * 见 `isValidRunsRange`——`z.object(...).refine()` 会变成 ZodEffects，无法再 `.extend`。
 */
export const runsFilterShape = {
    repositoryId: z.string().min(1).max(64).optional(),
    status: multiValueEnum(SCAN_RUN_STATUSES, 'status'),
    failureStage: multiValueEnum(RUN_FAILURE_STAGES, 'failureStage'),
    failureKind: multiValueEnum(RUN_FAILURE_KINDS, 'failureKind'),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
}

/** 仅用于类型推断的 filter 基础 schema；端点必须使用带区间 refine 的完整 schema，禁止单独把它接上 handler。 */
export const runsFilterBaseSchema = z.object(runsFilterShape)

export type RunsFilterInput = z.infer<typeof runsFilterBaseSchema>

/** 区间合法性（两端都缺省视为合法；Date.parse 失败已被 schema 拦截） */
export const isValidRunsRange = (filters: { from?: string, to?: string }): boolean =>
    !filters.from || !filters.to || Date.parse(filters.from) <= Date.parse(filters.to)

/** runs 可排序字段（白名单；缺省 createdAt） */
export const RUNS_SORT_FIELDS = ['createdAt', 'startedAt'] as const
export type RunsSortField = typeof RUNS_SORT_FIELDS[number]
export type RunsSortOrder = 'asc' | 'desc'

/**
 * 排序参数（列表与导出共用）。
 *
 * - `sortBy` 缺省 → 既有 `createdAt DESC`（`sortOrder` 被忽略，保持向后兼容）
 * - `sortBy` 显式传入（`createdAt` / `startedAt`）→ 按 `sortOrder` 排序
 * - `sortOrder` 缺省 `desc`（与既有默认序方向一致）
 */
export const runsSortShape = {
    sortBy: z.enum(RUNS_SORT_FIELDS).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
}

export interface RunsSortInput {
    sortBy?: RunsSortField
    sortOrder: RunsSortOrder
}

/**
 * 应用 runs 排序（列表 / 导出同源，禁止端点各自拼 order）。
 *
 * `startedAt` 排序的 NULL 语义：**NULL 行固定排在末尾**（与方向无关）。用
 * `CASE WHEN startedAt IS NULL THEN 1 ELSE 0 END ASC` 实现，避免 PostgreSQL（DESC 默认
 * NULLS FIRST）与 SQLite / MySQL 的差异；并列时按 `createdAt DESC, id DESC` 保证翻页稳定。
 */
export const applyRunsOrder = <T extends SelectQueryBuilder<ScanRun>>(
    qb: T,
    sort: RunsSortInput,
): T => {
    if (sort.sortBy === 'startedAt') {
        // 计算列必须 addSelect 后再按别名排序：TypeORM 会把以 `CASE WHEN run` 开头的表达式
        // 误判为实体别名（`"CASE WHEN run" alias was not found`）。
        qb.addSelect('CASE WHEN run.startedAt IS NULL THEN 1 ELSE 0 END', 'startedAtNullRank')
            .orderBy('startedAtNullRank', 'ASC')
            .addOrderBy('run.startedAt', sort.sortOrder === 'asc' ? 'ASC' : 'DESC')
            .addOrderBy('run.createdAt', 'DESC')
            .addOrderBy('run.id', 'DESC')
        return qb
    }
    // `sortBy` 缺省 → 既有默认序（忽略 sortOrder）；显式 `createdAt` → 按 sortOrder
    const createdAtOrder = sort.sortBy === 'createdAt' && sort.sortOrder === 'asc' ? 'ASC' : 'DESC'
    qb.orderBy('run.createdAt', createdAtOrder).addOrderBy('run.id', 'DESC')
    return qb
}

/**
 * runs 分页参数（列表 `GET /api/runs` 与日志导出共用，单一事实源）。
 *
 * - `page`：默认 1，最小 1
 * - `pageSize`：默认 `RUNS_PAGE_SIZE_DEFAULT`，上限 `RUNS_PAGE_SIZE_MAX`（超出静默钳制，不抛错）
 *
 * **必须同源**：窗口导出的 `skip` / `take` 与列表页宽取自同一常量——任一侧单独改，会让
 * 「导出当前页」与屏幕所见**取数错位**（不止是提示不一致）。故两侧共用本片段，禁止在端点内
 * 各自复制一份。
 */
export const RUNS_PAGE_SIZE_DEFAULT = 100
export const RUNS_PAGE_SIZE_MAX = 200

/** 分页参数 schema 片段（端点 `.extend({ ...runsPaginationShape })` 复用） */
export const runsPaginationShape = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).default(RUNS_PAGE_SIZE_DEFAULT)
        .transform((v) => Math.min(v, RUNS_PAGE_SIZE_MAX)),
}

/**
 * 按筛选 + 组织隔离向 QueryBuilder 追加条件（列表 / 导出共用，禁止端点各自拼 where）。
 *
 * 必须使用 **QueryBuilder 属性路径**（`run.repositoryId` / `repository.organizationId`）而非
 * FindOptionsWhere 对象：排序需要 `CASE WHEN startedAt IS NULL` 与稳定次键，列表 / 导出已统一走
 * QueryBuilder，同一份对象 where 在自定义 join 别名下会与自动 join 冲突（实测返回空集）。
 *
 * `from` / `to` 是 **startedAt** 的闭区间；NULL startedAt 行在区间过滤时被排除。
 *
 * 用 `andWhere` 起手（而非 `where`）：调用方可继续追加条件，不会被重置 WHERE。
 */
export const applyRunsWhere = <T extends SelectQueryBuilder<ScanRun>>(
    qb: T,
    filters: Pick<RunsFilterInput, 'repositoryId' | 'status' | 'failureStage' | 'failureKind' | 'from' | 'to'>,
    organizationId: string,
): T => {
    qb.andWhere('repository.organizationId = :organizationId', { organizationId })
    if (filters.repositoryId) {
        qb.andWhere('run.repositoryId = :repositoryId', { repositoryId: filters.repositoryId })
    }
    if (filters.status) {
        qb.andWhere('run.status IN (:...status)', { status: filters.status })
    }
    if (filters.failureStage) {
        qb.andWhere('run.failureStage IN (:...failureStage)', { failureStage: filters.failureStage })
    }
    if (filters.failureKind) {
        qb.andWhere('run.failureKind IN (:...failureKind)', { failureKind: filters.failureKind })
    }
    if (filters.from) {
        qb.andWhere('run.startedAt >= :from', { from: new Date(filters.from) })
    }
    if (filters.to) {
        qb.andWhere('run.startedAt <= :to', { to: new Date(filters.to) })
    }
    return qb
}

