import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/** GET /api/dashboard/stats：仪表板统计（仓库数/告警数按严重级别/已修复数/最近扫描） */
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
    for (const r of allResults) {
        alertsTotal += 1
        severityCounts[r.severity] = (severityCounts[r.severity] ?? 0) + 1
    }

    // 已修复数（fixStatus 计数：success 视为已修复）
    const fixedCount = allResults.filter((r) => r.fixStatus === 'success').length

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
