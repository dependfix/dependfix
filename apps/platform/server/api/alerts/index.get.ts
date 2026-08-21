import { z } from 'zod'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/**
 * GET /api/alerts：告警视图（按仓库/严重级别/来源筛选）。
 * 查询 ScanResult 表（扫描结果明细即告警数据），支持 repositoryId/severity/source 过滤。
 *
 * groupBy 参数（todo.md §C65-D3）：
 * - `package`：按 packageName 排序，前端 DataTable rowGroupMode="subheader" 按包分组
 *   （PrimeVue 4 要求数据按 groupRowsBy 字段预排序，相邻行字段值变化触发 subheader）
 * - `repository`：按关联 Repository owner + name 排序，前端按项目分组
 * - 不传 / 其他值：原始列表，按 createdAt DESC（默认）
 *
 * rowGroup 语义：用户切换其他列排序时，PrimeVue 多列排序模式会自动把 groupRowsBy 保留为第一排序键，
 * 避免 group 顺序被破坏（参考 primefaces/primevue DataTable.vue sortSingle/sortMultiple 实现）。
 */
const groupBySchema = z.enum(['package', 'repository']).optional()

export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = query.repositoryId as string | undefined
    const severity = query.severity as string | undefined
    const source = query.source as string | undefined
    const groupByParsed = groupBySchema.safeParse(query.groupBy)
    const groupBy = groupByParsed.success ? groupByParsed.data : undefined

    const ds = await ensureDatabaseInitialized()
    const resultRepo = ds.getRepository(ScanResult)

    // rowGroup 模式按 groupBy 字段排序（保证相邻行字段值变化触发 subheader）；
    // 未传 / 非法值走 createdAt DESC 默认顺序。repository 排序需 join Repository 表的 owner + name。
    // TypeORM 1.x find options order 不支持嵌套路径（scanRun.repository.owner），repository 模式必须用 QueryBuilder；
    // 为统一代码路径（不与既有 package 模式 split），全部走 QueryBuilder 实现。
    const qb = resultRepo.createQueryBuilder('result')
        .leftJoinAndSelect('result.scanRun', 'scanRun')
        .leftJoinAndSelect('scanRun.repository', 'repository')
        .take(500)
    if (repositoryId && repositoryId !== 'all') {
        // ScanResult 无 repositoryId 列：通过关联 ScanRun 过滤
        qb.andWhere('scanRun.repositoryId = :repositoryId', { repositoryId })
    }
    if (severity && severity !== 'all') {
        qb.andWhere('result.severity = :severity', { severity })
    }
    if (source && source !== 'all') {
        qb.andWhere('result.source = :source', { source })
    }

    if (groupBy === 'package') {
        qb.orderBy('result.packageName', 'ASC')
    } else if (groupBy === 'repository') {
        // repository 模式：跨 repo 排序 + 同一 repo 内按 packageName ASC（保证 PrimeVue rowGroup subheader 相邻行字段值变化）
        qb.orderBy('repository.owner', 'ASC').addOrderBy('repository.name', 'ASC').addOrderBy('result.packageName', 'ASC')
    } else {
        qb.orderBy('result.createdAt', 'DESC')
    }

    const results = await qb.getMany()

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
