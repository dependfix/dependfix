import type { H3Event } from 'h3'
import { z } from 'zod'
import { PRCheck, PR_CHECK_CONCLUSIONS } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { parseOptional } from '#server/utils/zod-helpers'
import { toPRCheckView } from '#server/utils/pr-check-view'

/**
 * GET /api/pr-checks：依赖更新 PR check 状态监测列表（详见 docs/plan/todo.md §M24.1）。
 *
 * 业务定位：监测 dependfix 自身 PR（author 含 `dependfix[bot]`）+ dependabot PR
 * （author=`dependabot[bot]`）最新 `Test` check 状态，让"发出去"的修复 PR 在 CI
 * 跑挂时通过 alerts 系统 firing 并提供 ack UI。Phase 3 仅暴露 API 层；UI 在 Phase 4。
 *
 * 数据模型：PRCheck 是 per-PR-head 模型（同一 PR HEAD 只存最新一行；service polling
 * INSERT/UPDATE 时按 (repositoryId, prNumber, headSha) 复合唯一索引幂等）。
 *
 * 过滤参数：
 * - `repositoryId`（可选）：限定仓库 id
 * - `conclusion`（可选）：限定 check 结论（success / failure / pending 等）；**非法枚举值返回 400**
 * - `alertFiring`（可选）：true = 仅 alert firing 的失败 PR；false = 仅 ack 后的 / 其他
 * - 不传：返回当前组织全部 PRCheck（默认按 createdAt DESC 排序）
 *
 * 注意：PRCheck 表已天然 per-PR-head 去重（复合唯一索引），无需应用层 fingerprint 聚合。
 * 与 ScanResult 的查询路径互不影响——两条链路共用 alerts-rowgroup UI 视觉但不共享数据源。
 */
const conclusionSchema = z.enum(PR_CHECK_CONCLUSIONS as unknown as [string, ...string[]]).optional()
const alertFiringSchema = z.enum(['true', 'false']).optional()


const listHandler = async (event: H3Event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = typeof query.repositoryId === 'string' ? query.repositoryId : undefined
    const conclusionParsed = conclusionSchema.safeParse(query.conclusion)
    // 严格枚举：非法结论不再静默退回全量——前端筛选与 URL 复现必须给出同一语义
    if (query.conclusion !== undefined && !conclusionParsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'PR_CHECK_VALIDATION_FAILED',
            data: { issues: conclusionParsed.error.issues },
        })
    }
    // zod .optional() 接受 undefined 为合法值（data=undefined）；下方 if (conclusion) 已过滤 falsy
    const conclusion = conclusionParsed.success ? conclusionParsed.data : undefined
    // alertFiring 三态：未传 → undefined / 'true' → true / 'false' → false / 非法 → undefined
    // parseOptional 强制 isProvided + success 语义区分（§五十六 M24.1 Phase 3 W2 follow-up）
    const { success: alertFiringSuccess, value: alertFiringValue, isProvided: alertFiringProvided } = parseOptional(
        alertFiringSchema,
        query.alertFiring,
    )
    const alertFiring = alertFiringSuccess && alertFiringProvided
        ? alertFiringValue === 'true'
        : undefined

    const ds = await ensureDatabaseInitialized()
    // leftJoinAndSelect：查询内解析 repository 关系，供 toView 输出 `owner/name` 标签
    // （ManyToOne 不产生行倍增，与 take(500) 上限语义兼容）
    const qb = ds.getRepository(PRCheck).createQueryBuilder('prCheck')
        .leftJoinAndSelect('prCheck.repository', 'repository')
        .orderBy('prCheck.createdAt', 'DESC')
        // 同毫秒并列时按主键 DESC 兜底，保证 take(500) 截断集合稳定（api.md §4）
        .addOrderBy('prCheck.id', 'DESC')
        .take(500)

    if (repositoryId && repositoryId !== 'all') {
        qb.andWhere('prCheck.repositoryId = :repositoryId', { repositoryId })
    }
    if (conclusion) {
        qb.andWhere('prCheck.conclusion = :conclusion', { conclusion })
    }
    if (alertFiring !== undefined) {
        qb.andWhere('prCheck.alertFiring = :alertFiring', { alertFiring })
    }

    const rows = await qb.getMany()
    return rows.map(toPRCheckView)
}

export default defineEventHandler(listHandler)
