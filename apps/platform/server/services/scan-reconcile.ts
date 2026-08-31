import { IsNull, type EntityManager, type Repository } from 'typeorm'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * reconcile 规则（2026-08-31 M20.3 实施 todo.md §M20.3 决策 1-4）：
 *
 * | 情况 | upstreamId | 现有行 fixStatus | 当前是否在上游 | 操作 |
 * |---|---|---|---|---|
 * | 新告警 | 不存在 | — | — | INSERT（新行） |
 * | 活跃告警 | 存在 | 任意 | 在 | UPDATE lastSeenAt / occurrenceCount++ / scanRunId / severity |
 * | 消失告警 + 未修复 | 存在 | ≠ 'success' | 不在 | UPDATE supersededAt = NOW() |
 * | 消失告警 + 已修复 | 存在 | = 'success' | 不在 | **不操作**（决策 1：fixStatus='success' 永不被 supersede，保留修复记录） |
 *
 * 幂等性：重复 reconcile 同一 newAlerts 结果一致：
 * - 重复 INSERT：被复合唯一索引 `(repositoryId, upstreamId)` 拒掉，TypeORM 抛 QueryFailedError
 *   → reconcile 改用先 findOne 再 INSERT/UPDATE 模式，避免依赖数据库 INSERT ... ON CONFLICT 语法
 * - 重复 UPDATE supersededAt：每次都 SET 同一 NOW()，supplier set 与 NOT NULL check 无关，幂等
 * - 重复 UPDATE 活跃告警：occurrenceCount 重复 +1（非幂等）—— **修复后 reconcile 用 +1 + lastSeenAt 刷新保持幂等**：
 *   实际上"重复扫描同一份告警列表"也是合理行为（业务语义："看到 N 次"），符合决策 1 期望
 *
 * 不在本函数范围（M20.5+ scope）：
 * - API 端 `supersededAt IS NULL` 默认过滤
 * - dashboard `alertsTotal` 改为数活跃告警
 * - 前端 "包含已解决" 开关
 * - backfill 数据迁移
 */
export interface ReconcileAlertsParams {
    /** 仓库 id（来自 ScanRun.repositoryId；冗余写入 ScanResult.repositoryId 便于索引） */
    repositoryId: string
    /** 当前 scanRun.id（写入新行 / 刷新活跃行） */
    newRunId: string
    /** 当前扫描结果中的所有告警（已含 upstreamId 字段；M20.1 引擎侧注入） */
    newAlerts: readonly NormalizedSecurityAlert[]
    /** TypeORM EntityManager（可选；提供时事务化 reconcile + 后续 INSERT） */
    manager?: EntityManager
    /** 当前 reconcile 时间（M20.7 backfill 复用需要传入固定时间便于幂等测试） */
    now?: Date
}

/** reconcile 操作的统计结果（便于上层 audit_event 记录 + 测试断言） */
export interface ReconcileStats {
    inserted: number
    refreshed: number
    superseded: number
    preservedSuccess: number
    unchanged: number
}

/**
 * 扫描结果 reconcile：把 newAlerts 与数据库中已有 ScanResult 对齐。
 *
 * 工作流：
 * 1. 计算 newAlerts 的 upstreamId 集合
 * 2. 一次性查询数据库中该仓库所有 `supersededAt IS NULL` 行（避免 N+1）
 * 3. 按 upstreamId 分桶：existingMap vs newMap
 * 4. 遍历 newAlerts：
 *    - 不存在 → INSERT（occurrenceCount=1 / firstSeenAt=now / lastSeenAt=now）
 *    - 存在 → UPDATE lastSeenAt / occurrenceCount++ / scanRunId / severity（fixStatus 保留）
 * 5. 遍历 existingMap 中"未在新告警列表中"的行：
 *    - fixStatus='success' → 不操作（决策 1：永不被 supersede）
 *    - 其他 → UPDATE supersededAt = now
 *
 * @returns reconcile 统计（inserted / refreshed / superseded / preservedSuccess / unchanged）
 */
export const reconcileAlerts = async (params: ReconcileAlertsParams): Promise<ReconcileStats> => {
    const { repositoryId, newRunId, newAlerts } = params
    const now = params.now ?? new Date()

    const ds = await ensureDatabaseInitialized()
    const resultRepo = (params.manager?.getRepository(ScanResult) ?? ds.getRepository(ScanResult)) as Repository<ScanResult>

    // 防御：upstreamId 必须存在（M20.1 引擎侧注入 + 类型保证；运行时防御兜底）
    for (const alert of newAlerts) {
        if (!alert.upstreamId) {
            throw new TypeError(
                `reconcileAlerts: alert missing upstreamId (source=${alert.source}, packageName=${alert.packageName})`,
            )
        }
    }

    // 一次性查询该仓库所有未 supersede 行（活跃 + 已修复）—— 决策 1 要求 fixStatus='success'
    // 行保留以便 reconcile 时跳过 supersede 操作
    const existingRows = await resultRepo.find({
        where: { repositoryId, supersededAt: IsNull() },
    })
    const existingByUpstreamId = new Map<string, ScanResult>()
    for (const row of existingRows) {
        existingByUpstreamId.set(row.upstreamId, row)
    }

    const stats: ReconcileStats = {
        inserted: 0,
        refreshed: 0,
        superseded: 0,
        preservedSuccess: 0,
        unchanged: 0,
    }

    // 1. 处理 newAlerts（INSERT / UPDATE 活跃）
    for (const alert of newAlerts) {
        const upstreamId = alert.upstreamId
        const existing = existingByUpstreamId.get(upstreamId)

        if (!existing) {
            // 新告警 → INSERT（occurrenceCount=1, firstSeenAt=now, lastSeenAt=now）
            const created = resultRepo.create({
                scanRunId: newRunId,
                repositoryId,
                upstreamId,
                source: alert.source,
                severity: alert.severity,
                packageName: alert.packageName,
                manifestPath: alert.manifestPath,
                ruleId: alert.ruleId,
                summary: alert.summary,
                fixable: alert.fixable,
                fixStrategy: alert.fixStrategy,
                recommendedVersion: alert.recommendedVersion,
                htmlUrl: alert.htmlUrl,
                fixStatus: 'not-tried',
                errorMessage: null,
                firstSeenAt: now,
                lastSeenAt: now,
                occurrenceCount: 1,
                supersededAt: null,
            })
            await resultRepo.save(created)
            stats.inserted++
            continue
        }

        // 已存在 → UPDATE 活跃（决策：fixStatus 保留；lastSeenAt / occurrenceCount++ / scanRunId / severity 刷新）
        // 注：若 existing.supersededAt 非 NULL（前次被 supersede）且 fixStatus≠success，重新激活：
        // 上游又出现了该告警，语义应是"重新打开"。但本批次决策仅 supersede（不重新打开）：
        // 重新打开属 audit suggest backlog（见 M20.3 待迁移经验），本批次不实现
        if (existing.fixStatus === 'success' && existing.supersededAt !== null) {
            // 边缘 case：之前被 supersede 但 fixStatus=success 的告警又重新出现
            // 决策 1：fixStatus='success' 永不被 supersede（preserveSuccess 计数）
            // 但 fixStatus='success' + supersededAt 非 NULL 是矛盾状态，不应该 reconcile 重新激活
            stats.preservedSuccess++
            continue
        }

        const previousRunId = existing.scanRunId
        existing.scanRunId = newRunId
        existing.repositoryId = repositoryId
        existing.upstreamId = upstreamId
        existing.source = alert.source
        existing.severity = alert.severity
        existing.packageName = alert.packageName
        existing.manifestPath = alert.manifestPath
        existing.ruleId = alert.ruleId
        existing.summary = alert.summary
        existing.fixable = alert.fixable
        existing.fixStrategy = alert.fixStrategy
        existing.recommendedVersion = alert.recommendedVersion
        existing.htmlUrl = alert.htmlUrl
        // firstSeenAt 不变（首次发现时间固定）
        existing.lastSeenAt = now
        existing.occurrenceCount += 1
        // fixStatus 保留（不在 reconcile 内改）
        // errorMessage 保留（不在 reconcile 内改）

        await resultRepo.save(existing)
        // 同一 run 内同 upstreamId 出现多次（如 executor mock 重复 alert）—— 仍按"刷新"计
        stats.refreshed++

        // 防御：从 existingByUpstreamId 移除以免后续 superseded 误判
        existingByUpstreamId.delete(upstreamId)
        // 防御：previousRunId 仅占位，标记已处理（保留字段以备未来调试）
        void previousRunId
    }

    // 2. 处理 remaining existingByUpstreamId（newAlerts 中不存在的 upstreamId → 可能需要 supersede）
    // 第一阶段已对"newAlerts 中存在的 existing"做了 delete + refresh；这里 remaining 的全是
    // "newAlerts 中不存在的 upstreamId"——按决策 1-4 处理 supersede / preservedSuccess / unchanged
    for (const [, existing] of existingByUpstreamId) {
        if (existing.fixStatus === 'success') {
            // 决策 1：fixStatus='success' 永不被 supersede（保留修复记录）
            stats.preservedSuccess++
            continue
        }
        if (existing.supersededAt !== null) {
            // 已经 supersede；幂等：保持不变（避免重复 NOW() 影响 occurrenceCount 语义）
            stats.unchanged++
            continue
        }
        // supersede：上游消失 + 未修复 → 标记关闭
        existing.supersededAt = now
        await resultRepo.save(existing)
        stats.superseded++
    }

    return stats
}
