import { z } from 'zod'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/**
 * GET /api/alerts：告警视图（按仓库/严重级别/来源筛选）。
 * 查询 ScanResult 表（M20.3 per-alert 模型：每行 = 一个独立告警），支持 repositoryId/severity/source 过滤。
 *
 * 默认 supersededAt IS NULL 过滤（M20.5 todo.md §M20.5）：
 * - alerts 视图默认只显示活跃告警；supersede 的告警（上游已关闭）不再出现在 alerts 列表
 * - M20.3 reconcile 函数 supersede 逻辑：上游消失 + fixStatus≠success → UPDATE supersededAt=NOW()
 * - 决策 1：fixStatus='success' 永不被 supersede（保留修复记录），所以"已修复"告警永远活跃
 *
 * includeSuperseded 参数（M20.5）：
 * - 不传 / `false`：默认 supersededAt IS NULL（仅活跃告警）
 * - `true`：返回全量（含已关闭告警，前端"显示已解决"开关使用——M20.6 scope）
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
 * dedupe 参数（M20.5 移除）：
 * - 旧实现（[archive/todo-archive-phases-m13.md §M13.2 / T1306](../archive/todo-archive-phases-m13.md#m132-网络治理--告警去重-)）按 fingerprint (repositoryId + packageName + ruleId) 应用层聚合
 * - M20.3 per-alert 模型下 ScanResult 已天然 deduped（每行独立，occurrenceCount 字段直接计数）；
 *   dedupe=true 的应用层聚合已无意义。参数处理移除（静默忽略传入值，避免破坏前端的旧请求）
 * - 前端 dedupeOptions 切换 UI 在 M20.6 移除（todo.md §M20.6）
 */
const groupBySchema = z.enum(['package', 'repository']).optional()
const includeSupersededSchema = z.enum(['true', 'false']).optional()

export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = query.repositoryId as string | undefined
    const severity = query.severity as string | undefined
    const source = query.source as string | undefined
    const groupByParsed = groupBySchema.safeParse(query.groupBy)
    const groupBy = groupByParsed.success ? groupByParsed.data : undefined
    const includeSupersededParsed = includeSupersededSchema.safeParse(query.includeSuperseded)
    const includeSuperseded = includeSupersededParsed.success ? includeSupersededParsed.data === 'true' : false

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
        // M20.3 新增 repositoryId 列后直接走 result.repositoryId 过滤（无需再 JOIN scanRun 推断）
        qb.andWhere('result.repositoryId = :repositoryId', { repositoryId })
    }
    if (severity && severity !== 'all') {
        qb.andWhere('result.severity = :severity', { severity })
    }
    if (source && source !== 'all') {
        qb.andWhere('result.source = :source', { source })
    }
    // 默认 supersededAt IS NULL（M20.5）：alerts 视图只显示活跃告警
    // includeSuperseded=true 时不过滤（前端"显示已解决"开关使用——M20.6）
    if (!includeSuperseded) {
        qb.andWhere('result.supersededAt IS NULL')
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

    // M20.3 per-alert 模型：每行已是独立告警，occurrenceCount/firstSeenAt/lastSeenAt 字段直接来自 ScanResult，
    // 无需应用层 fingerprint 聚合（旧 M13.2 跨次扫描去重逻辑由 M20.3 per-alert 模型替代）
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
        // M20.3 新增字段（直接来自 ScanResult）
        upstreamId: r.upstreamId,
        occurrenceCount: r.occurrenceCount,
        firstSeenAt: r.firstSeenAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
        supersededAt: r.supersededAt?.toISOString() ?? null,
    }))
})
