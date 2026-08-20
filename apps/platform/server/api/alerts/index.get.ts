import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/**
 * GET /api/alerts：告警视图（按仓库/严重级别/来源筛选）。
 * 查询 ScanResult 表（扫描结果明细即告警数据），支持 repositoryId/severity/source 过滤。
 *
 * 新增 groupBy 参数：
 * - `package`：按 packageName 排序返回，前端 DataTable rowGroupMode="subheader" 渲染分组 subheader
 *   （PrimeVue 4 要求数据按 groupRowsBy 字段预排序，相邻行字段值变化触发 subheader）
 * - 不传 / 其他值：保持原顺序（createdAt DESC）
 *
 * rowGroup 语义：用户切换其他列排序时，PrimeVue 多列排序模式会自动把 groupRowsBy 保留为第一排序键，
 * 避免 group 顺序被破坏（参考 primefaces/primevue DataTable.vue sortSingle/sortMultiple 实现）。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = query.repositoryId as string | undefined
    const severity = query.severity as string | undefined
    const source = query.source as string | undefined
    const groupBy = query.groupBy as string | undefined

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

    // rowGroup 模式按 packageName 排序（保证相邻行字段值变化触发 subheader）
    const order = groupBy === 'package' ? { packageName: 'ASC' as const } : { createdAt: 'DESC' as const }

    const results = await resultRepo.find({
        where,
        order,
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
