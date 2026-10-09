import { z } from 'zod'
import { In, type FindOptionsWhere } from 'typeorm'
import { ScanRun, SCAN_RUN_STATUSES, type ScanRunStatus } from '#server/entities/scan-run'
import { RUN_FAILURE_KINDS, RUN_FAILURE_STAGES, type RunFailureKind, type RunFailureStage } from '#server/services/run-failure-classify'

/**
 * runs 列表（GET /api/runs）与日志导出（GET /api/runs/logs-export）共用的筛选解析。
 *
 * 抽出的动机：两处必须使用同一套白名单与多值解析口径，避免「列表能筛、导出不能筛」
 * 或白名单漂移；导出端点不引入分页（见各端点自身）。
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

/**
 * runs 共用筛选参数（`repositoryId` + 失败分类三维度）。
 * 注意：`organizationId` 不暴露为 query 参数——服务端隐式从默认组织注入（单组织模型）。
 */
export const runsFilterSchema = z.object({
    repositoryId: z.string().min(1).max(64).optional(),
    status: multiValueEnum(SCAN_RUN_STATUSES, 'status'),
    failureStage: multiValueEnum(RUN_FAILURE_STAGES, 'failureStage'),
    failureKind: multiValueEnum(RUN_FAILURE_KINDS, 'failureKind'),
})

export type RunsFilterInput = z.infer<typeof runsFilterSchema>

/**
 * 按筛选 + 组织隔离构建 where。
 * `repository.organizationId` 注入组织隔离：跨组织 run 永远不可见。
 */
export const buildRunsWhere = (
    filters: Pick<RunsFilterInput, 'repositoryId' | 'status' | 'failureStage' | 'failureKind'>,
    organizationId: string,
): FindOptionsWhere<ScanRun> => {
    const where: FindOptionsWhere<ScanRun> = { repository: { organizationId } }
    if (filters.repositoryId) {
        where.repositoryId = filters.repositoryId
    }
    // 状态 / 失败阶段 / 处置建议多值过滤（白名单校验已在 schema 完成）
    if (filters.status) {
        where.status = In(filters.status as ScanRunStatus[])
    }
    if (filters.failureStage) {
        where.failureStage = In(filters.failureStage as RunFailureStage[])
    }
    if (filters.failureKind) {
        where.failureKind = In(filters.failureKind as RunFailureKind[])
    }
    return where
}
