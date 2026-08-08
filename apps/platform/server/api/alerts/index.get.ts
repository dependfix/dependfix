import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/**
 * GET /api/alerts：告警视图（按仓库/严重级别/来源筛选）。
 * 查询 ScanResult 表（扫描结果明细即告警数据），支持 repositoryId/severity/source 过滤。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = query.repositoryId as string | undefined
    const severity = query.severity as string | undefined
    const source = query.source as string | undefined

    const ds = await ensureDatabaseInitialized()
    const resultRepo = ds.getRepository(ScanResult)

    const where: Record<string, unknown> = {}
    if (repositoryId && repositoryId !== 'all') {
        // ScanResult 无 repositoryId 列：通过关联 ScanRun 过滤
        where.scanRun = { repositoryId }
    }
    if (severity && severity !== 'all') {
        where.severity = severity
    }
    if (source && source !== 'all') {
        where.source = source
    }

    const results = await resultRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: 500,
        relations: { scanRun: { repository: true } },
    })

    return results.map((r) => ({
        id: r.id,
        runId: r.scanRunId,
        repository: r.scanRun?.repository ? `${r.scanRun.repository.owner}/${r.scanRun.repository.name}` : null,
        source: r.source,
        severity: r.severity,
        packageName: r.packageName,
        manifestPath: r.manifestPath,
        ruleId: r.ruleId,
        summary: r.summary,
        fixable: r.fixable,
        fixStrategy: r.fixStrategy,
        recommendedVersion: r.recommendedVersion,
        htmlUrl: r.htmlUrl,
        fixStatus: r.fixStatus,
        errorMessage: r.errorMessage,
    }))
})
