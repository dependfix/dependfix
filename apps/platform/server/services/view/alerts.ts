import type { ScanResult } from '#server/entities/scan-result'

/**
 * 告警视图映射（`GET /api/alerts` 与后续 `/api/v1/alerts` 共用）。
 *
 * per-alert 模型下每行已是独立告警；`cveIds` 为 JSON 列，解析失败按空数组降级。
 */
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
