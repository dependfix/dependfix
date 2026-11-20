import type { DataSource } from 'typeorm'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'

/**
 * 仪表板统计查询（`GET /api/dashboard/stats` 与后续 `/api/v1/dashboard/stats` 共用）。
 *
 * 口径保持不变：
 * - `alertsTotal` / `severityCounts` 只数活跃告警（`supersededAt IS NULL`）；
 * - `fixedCount` 数 `fixStatus='success'`（success 永不被 supersede，等价于活跃中的 success）；
 * - `topPackages` 保留全量历史语义（含已关闭告警）。
 */
export const loadDashboardStats = async (ds: DataSource, organizationId: string) => {
    const repoRepo = ds.getRepository(Repository)
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    const repositoryCount = await repoRepo.count({
        where: { organizationId },
    })

    const activeQuery = resultRepo.createQueryBuilder('result')
        .leftJoin('result.repository', 'repository')
        .where('result.supersededAt IS NULL')
    activeQuery.andWhere('repository.organizationId = :organizationId', { organizationId })
    const activeResults = await activeQuery.getMany()
    const severityCounts: Record<string, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0,
    }
    let alertsTotal = 0
    // 未识别 severity（如未来扩展 'info' / 'warning'）归入 unknown 段，避免与 alertsTotal 不一致
    const knownSeverities = new Set(['critical', 'high', 'medium', 'low', 'unknown'])
    for (const result of activeResults) {
        alertsTotal += 1
        const bucket = knownSeverities.has(result.severity) ? result.severity : 'unknown'
        severityCounts[bucket] = (severityCounts[bucket] ?? 0) + 1
    }

    const fixedCount = activeResults.filter((result) => result.fixStatus === 'success').length

    // Top-10 包告警（count DESC + packageName ASC 次键，保证确定性）
    const topPackagesQuery = ds
        .createQueryBuilder(ScanResult, 'r')
        .leftJoin('r.repository', 'repository')
        .select('r.packageName', 'packageName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('r.packageName')
        .orderBy('count', 'DESC')
        .addOrderBy('packageName', 'ASC')
        .limit(10)
    topPackagesQuery.andWhere('repository.organizationId = :organizationId', { organizationId })
    const topPackagesRows = await topPackagesQuery.getRawMany<{ packageName: string, count: string | number }>()
    const topPackages: { packageName: string, count: number }[] = topPackagesRows.map((row) => ({
        packageName: row.packageName,
        count: typeof row.count === 'string' ? Number.parseInt(row.count, 10) : row.count,
    }))

    const latestRunQuery = runRepo.createQueryBuilder('run')
        .leftJoinAndSelect('run.repository', 'repository')
        .orderBy('run.createdAt', 'DESC')
        .addOrderBy('run.id', 'DESC')
        .limit(1)
    latestRunQuery.where('repository.organizationId = :organizationId', { organizationId })
    const latestRun = await latestRunQuery.getOne()

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
}
