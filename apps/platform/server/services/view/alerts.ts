import type { SelectQueryBuilder } from 'typeorm'
import { sanitizeV1Text } from './text'
import type { ScanResult } from '#server/entities/scan-result'

/**
 * 告警视图映射（`GET /api/alerts` 与后续 `/api/v1/alerts` 共用）。
 *
 * per-alert 模型下每行已是独立告警；`cveIds` 为 JSON 列，解析失败按空数组降级。
 */
export interface AlertFilters {
    repositoryId?: string
    severity?: string
    source?: string
    includeSuperseded: boolean
}

/** 告警筛选条件（内部与 v1 共用；`all` 视为不过滤） */
export const applyAlertFilters = <T extends SelectQueryBuilder<ScanResult>>(
    qb: T,
    filters: AlertFilters,
): T => {
    if (filters.repositoryId && filters.repositoryId !== 'all') {
        qb.andWhere('result.repositoryId = :repositoryId', { repositoryId: filters.repositoryId })
    }
    if (filters.severity && filters.severity !== 'all') {
        qb.andWhere('result.severity = :severity', { severity: filters.severity })
    }
    if (filters.source && filters.source !== 'all') {
        qb.andWhere('result.source = :source', { source: filters.source })
    }
    if (!filters.includeSuperseded) {
        qb.andWhere('result.supersededAt IS NULL')
    }
    return qb
}

/** 告警排序（分组模式保证相邻行字段值变化；并列按主键 DESC 兜底） */
export const applyAlertOrder = <T extends SelectQueryBuilder<ScanResult>>(
    qb: T,
    groupBy: 'package' | 'repository' | undefined,
): T => {
    if (groupBy === 'package') {
        qb.orderBy('result.packageName', 'ASC')
    } else if (groupBy === 'repository') {
        qb.orderBy('repository.owner', 'ASC').addOrderBy('repository.name', 'ASC').addOrderBy('result.packageName', 'ASC')
    } else {
        qb.orderBy('result.createdAt', 'DESC')
    }
    return qb.addOrderBy('result.id', 'DESC')
}

/** v1 告警视图：自由文本清洗（summary / errorMessage） */
export const toAlertV1View = (result: ScanResult) => {
    const view = toAlertView(result)
    return {
        ...view,
        summary: view.summary ? sanitizeV1Text(view.summary) : null,
        errorMessage: view.errorMessage ? sanitizeV1Text(view.errorMessage) : null,
    }
}

export const toAlertView = (result: ScanResult) => ({
    id: result.id,
    runId: result.scanRunId,
    repository: result.scanRun?.repository
        ? `${result.scanRun.repository.owner}/${result.scanRun.repository.name}`
        : null,
    source: result.source,
    severity: result.severity,
    packageName: result.packageName,
    manifestPath: result.manifestPath,
    ruleId: result.ruleId,
    summary: result.summary,
    fixable: result.fixable,
    fixStrategy: result.fixStrategy,
    recommendedVersion: result.recommendedVersion,
    htmlUrl: result.htmlUrl,
    fixStatus: result.fixStatus,
    errorMessage: result.errorMessage,
    upstreamId: result.upstreamId,
    occurrenceCount: result.occurrenceCount,
    firstSeenAt: result.firstSeenAt.toISOString(),
    lastSeenAt: result.lastSeenAt.toISOString(),
    supersededAt: result.supersededAt?.toISOString() ?? null,
    // 漏洞唯一标识透传：依赖类告警携带 GHSA + CVE 列表，code-scanning / code-quality 源无此概念
    ghsaId: result.ghsaId,
    cveIds: result.cveIds ? JSON.parse(result.cveIds) as string[] : [],
})
