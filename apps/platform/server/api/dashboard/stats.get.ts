import { IsNull } from 'typeorm'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/** GET / getDashboardStats：仪表板统计（仓库数/告警数按严重级别/已修复数/最近扫描/Top-10 包告警）
 *
 * M20.5 调整（todo.md §M20.5）：
 * - `alertsTotal` 数活跃告警（`supersededAt IS NULL`）—— 不再统计已关闭告警
 * - `severityCounts` 数活跃告警的严重级别分布
 * - `fixedCount` 数 `fixStatus='success'`（决策 1：fixStatus='success' 永不被 supersede，
 *   所以"已修复"行 supersededAt 永远是 NULL，等价于数活跃告警中 success 的数量）
 *
 * 设计要点：
 * - topPackages 仍统计全量（不区分活跃 vs superseded）—— 历史语义保留：
 *   "Top 10 包告警"展示仓库整体告警热点，含已关闭告警反映仓库历史风险
 * - 业务上若要 topPackages 也数活跃，需 M20.7 backfill 阶段统一处理
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    // 仓库数（统计所有仓库；M20.5 不变）
    const repositoryCount = await repoRepo.count()

    // M20.5：alertsTotal + severityCounts 仅数活跃告警（supersededAt IS NULL）
    // 用 QueryBuilder + 一次查询避免 N+1（fetchAll 后应用层过滤也可行，但 SQL 层过滤更高效）
    const activeResults = await resultRepo.find({
        where: { supersededAt: IsNull() },
    })
    const severityCounts: Record<string, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0,
    }
    let alertsTotal = 0
    // RG-W02 修复：未识别 severity（如未来扩展 'info'/'warning'）归入 unknown 段，
    // 避免 alertsTotal 与 severityCounts 总和不一致
    const KNOWN_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'unknown'])
    for (const r of activeResults) {
        alertsTotal += 1
        const bucket = KNOWN_SEVERITIES.has(r.severity) ? r.severity : 'unknown'
        severityCounts[bucket] = (severityCounts[bucket] ?? 0) + 1
    }

    // 已修复数（fixStatus 计数：success 视为已修复）
    // 决策 1：fixStatus='success' 永不被 supersede，所以"已修复"行 supersededAt 永远是 NULL
    // 数全表 fixStatus='success' 等价于数活跃告警中的 success 行（M20.3 后语义统一）
    const fixedCount = activeResults.filter((r) => r.fixStatus === 'success').length

    // Top-10 包告警（按 packageName 聚合 count DESC + packageName ASC tie-break LIMIT 10）
    // 历史语义保留：全量统计（含已关闭告警，反映仓库整体告警热点）
    // 见 docs/plan/todo.md §C61 仪表板图表用
    // 二级排序保证测试与生产确定性（count 相同时按 packageName 字典序稳定输出）
    const topPackagesRows = await ds
        .createQueryBuilder(ScanResult, 'r')
        .select('r.packageName', 'packageName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('r.packageName')
        .orderBy('count', 'DESC')
        .addOrderBy('packageName', 'ASC')
        .limit(10)
        .getRawMany<{ packageName: string, count: string | number }>()
    const topPackages: { packageName: string, count: number }[] = topPackagesRows.map((row) => ({
        packageName: row.packageName,
        count: typeof row.count === 'string' ? Number.parseInt(row.count, 10) : row.count,
    }))

    // 最近扫描（TypeORM 1.x findOne 必须提供 where，空对象表示无条件取最新一条）
    const latestRun = await runRepo.findOne({
        where: {},
        order: { createdAt: 'DESC' },
        relations: { repository: true },
    })

    return {
        repositoryCount,
        alertsTotal,
        severityCounts,
        fixedCount,
        topPackages,
        latestRun: latestRun
            ? {
                id: latestRun.id,
                repository: latestRun.repository ? `${latestRun.repository.owner}/${latestRun.repository.name}` : null,
                status: latestRun.status,
                startedAt: latestRun.startedAt,
                finishedAt: latestRun.finishedAt,
            }
            : null,
    }
})
