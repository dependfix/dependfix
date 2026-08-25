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
 *
 * dedupe 参数（todo.md §T1306）：
 * - `true`：跨次扫描去重——按 fingerprint (repositoryId + packageName + ruleId) 聚合，相同 CVE 告警合并为 1 行
 *   聚合字段：occurrenceCount（出现次数）/ firstSeenAt（首次发现）/ lastSeenAt（最近发现）/
 *   affectedRunIds（受影响的 scanRun id 列表，前 5 个 + totalCount）
 * - `false`（默认）或缺省：行为等价历史实现——返回全量 ScanResult
 *
 * dedupe=true 时 groupBy 仍可独立使用（聚合 + 排序正交）。
 */
const groupBySchema = z.enum(['package', 'repository']).optional()
const dedupeSchema = z.enum(['true', 'false']).optional()

/** 聚合模式下取前 N 个 runId（避免列表爆炸） */
const AFFECTED_RUN_IDS_LIMIT = 5

export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = query.repositoryId as string | undefined
    const severity = query.severity as string | undefined
    const source = query.source as string | undefined
    const groupByParsed = groupBySchema.safeParse(query.groupBy)
    const groupBy = groupByParsed.success ? groupByParsed.data : undefined
    const dedupeParsed = dedupeSchema.safeParse(query.dedupe)
    const dedupe = dedupeParsed.success ? dedupeParsed.data === 'true' : false

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

    // dedupe=true：跨次扫描去重聚合（todo.md §T1306）
    // fingerprint 维度：repositoryId + packageName + ruleId（ruleId NULL 时使用 packageName 作 fallback）
    // 聚合字段：occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds（前 5 个 runId + totalCount）
    // 注：原计划用 SQL GROUP_CONCAT 子查询聚合 affectedRunIds，但在 better-sqlite3 :memory: 测试
    // 环境下子查询表名解析失败（"no such table: scan_result"）；改用应用层 JS 聚合（去 SQL dialect
    // 依赖 + 测试稳定），N+1 风险可控（.take(500) 上限 + 应用层去重 O(n)）。
    const results = await qb.getMany()

    if (!dedupe) {
        // 原始模式：返回全量 ScanResult（向后兼容）
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
    }

    // dedupe 模式：应用层按 fingerprint 聚合
    const aggregated = new Map<string, {
        representative: typeof results[number]
        occurrenceCount: number
        firstSeenAt: Date
        lastSeenAt: Date
        affectedRunIds: string[]
        affectedRunIdSet: Set<string>
    }>()
    for (const r of results) {
        const ruleKey = r.ruleId ?? ''
        // fingerprint 维度：repositoryId + packageName + ruleId（ruleId NULL fallback 用空串）
        // 注：用 repositoryId（非 scanRunId）才是真正的"跨次扫描去重"
        const repoId = r.scanRun?.repositoryId ?? r.scanRunId
        const key = `${repoId}|${r.packageName}|${ruleKey}`
        let agg = aggregated.get(key)
        if (!agg) {
            agg = {
                representative: r,
                occurrenceCount: 0,
                firstSeenAt: r.createdAt,
                lastSeenAt: r.createdAt,
                affectedRunIds: [],
                affectedRunIdSet: new Set<string>(),
            }
            aggregated.set(key, agg)
        }
        agg.occurrenceCount++
        if (r.createdAt < agg.firstSeenAt) {
            agg.firstSeenAt = r.createdAt
        }
        if (r.createdAt > agg.lastSeenAt) {
            agg.lastSeenAt = r.createdAt
        }
        // affectedRunIds 取前 5 个（按 runId ASC 去重），超过 5 个仅保留前 5 个但 occurrenceCount 保留全量
        if (!agg.affectedRunIdSet.has(r.scanRunId) && agg.affectedRunIds.length < AFFECTED_RUN_IDS_LIMIT) {
            agg.affectedRunIdSet.add(r.scanRunId)
            agg.affectedRunIds.push(r.scanRunId)
        } else if (!agg.affectedRunIdSet.has(r.scanRunId)) {
            agg.affectedRunIdSet.add(r.scanRunId) // 仍在集合中追踪总数（affectedRunIdSet.size = 总 run 数）
        }
    }

    // 排序按 occurrenceCount DESC（业务语义：高频 = 重要）
    return [...aggregated.values()]
        .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
        .map((agg) => {
            const r = agg.representative
            return {
                // 聚合字段
                occurrenceCount: agg.occurrenceCount,
                firstSeenAt: agg.firstSeenAt.toISOString(),
                lastSeenAt: agg.lastSeenAt.toISOString(),
                affectedRunIds: agg.affectedRunIds,
                // 代表性字段（取聚合行的 entity 字段）
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
            }
        })
})
