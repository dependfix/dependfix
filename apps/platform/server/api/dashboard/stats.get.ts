import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/** GET /api/dashboard/stats：仪表板统计（仓库数/告警数按严重级别/已修复数/最近扫描/Top-10 包告警） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    // 仓库数
    const repositoryCount = await repoRepo.count()

    // 告警总数 + 按严重级别分组
    const allResults = await resultRepo.find()
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
    for (const r of allResults) {
        alertsTotal += 1
        const bucket = KNOWN_SEVERITIES.has(r.severity) ? r.severity : 'unknown'
        severityCounts[bucket] = (severityCounts[bucket] ?? 0) + 1
    }

    // 已修复数（fixStatus 计数：success 视为已修复）
    const fixedCount = allResults.filter((r) => r.fixStatus === 'success').length

    // Top-10 包告警（按 packageName 聚合 count DESC + packageName ASC tie-break LIMIT 10）—— 见 docs/plan/todo.md §C61 仪表板图表用
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
