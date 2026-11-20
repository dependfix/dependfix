import { sanitizeV1Payload, sanitizeV1Text } from './text'
import type { ScanResult } from '#server/entities/scan-result'
import type { ScanRun } from '#server/entities/scan-run'
import type { LogEntry } from '#server/utils/memory-logger'
import { parseRunResource } from '#server/utils/run-resource'

/**
 * 运行（ScanRun）视图映射：内部端点与 `/api/v1` 共用的单一事实源。
 *
 * - 内部列表 / 详情字段保持既有形状（浏览器零回归）
 * - v1 只暴露 `API_V1_FIELDS.run` / `runDetail` 白名单字段，并额外清洗自由文本
 */

/** 内部运行列表视图（GET /api/runs 既有形状） */
export const toRunListView = (run: ScanRun) => ({
    id: run.id,
    repositoryId: run.repositoryId,
    owner: run.repository?.owner ?? null,
    name: run.repository?.name ?? null,
    mode: run.mode,
    severityThreshold: run.severityThreshold,
    executorKind: run.executorKind,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    runUrl: run.runUrl,
    summary: run.summaryJson ? JSON.parse(run.summaryJson) as Record<string, unknown> : null,
    // 运行结果可信度：exitCode 为进程级事实；环境性失败计数与 summary 同源落库。
    // 旧数据 exitCode 为 null；B 模式执行器不传递 exitCode（触发受理哨兵），环境性失败计数仍可落库。
    // 消费方须按 null 降级，不得把 null 推断为 0 成功。
    exitCode: run.exitCode,
    environmentalFailureCount: run.environmentalFailureCount,
    // 资源 / OOM 归因：列与 resourceJson 同源；null = 不可采集（原因在 resource.degradedReason）
    memoryMaxBytes: run.memoryMaxBytes,
    peakRssBytes: run.peakRssBytes,
    oomKilled: run.oomKilled,
    resource: parseRunResource(run.resourceJson),
    error: run.errorJson ? JSON.parse(run.errorJson) as { code: string, message: string } | null : null,
    // 失败分类（非失败终态为 null；落库口径见 run-failure-classify.ts）
    failureCode: run.failureCode,
    failureStage: run.failureStage,
    failureKind: run.failureKind,
})

/** 内部运行详情视图（GET /api/runs/{id} 既有形状，含结果明细与日志） */
export const toRunDetailView = (input: {
    run: ScanRun
    results: ScanResult[]
    logs: LogEntry[]
    logsText: string | null
}) => {
    const { run, results, logs, logsText } = input
    return {
        ...toRunListView(run),
        buildVersion: run.buildVersion ?? null,
        buildCommit: run.buildCommit ?? null,
        retriedFromRunId: run.retriedFromRunId ?? null,
        results: results.map((result) => ({
            id: result.id,
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
        })),
        logs,
        logsText,
        // 采集侧丢弃数（三态：NULL / 0 / >0），客户端聚合视图据此提示「日志非完整执行过程」
        logsDropped: run.logsDropped ?? null,
    }
}

/** v1 运行列表视图（白名单 + 自由文本清洗） */
export const toRunV1View = (run: ScanRun) => {
    const summary = run.summaryJson ? JSON.parse(run.summaryJson) as Record<string, unknown> : null
    const error = run.errorJson ? JSON.parse(run.errorJson) as { code?: string, message?: string } : null
    return {
        id: run.id,
        repositoryId: run.repositoryId,
        owner: run.repository?.owner ?? null,
        name: run.repository?.name ?? null,
        mode: run.mode,
        severityThreshold: run.severityThreshold,
        executorKind: run.executorKind,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        runUrl: run.runUrl,
        summary: summary ? sanitizeV1Payload(summary) as Record<string, unknown> : null,
        exitCode: run.exitCode,
        environmentalFailureCount: run.environmentalFailureCount,
        memoryMaxBytes: run.memoryMaxBytes,
        peakRssBytes: run.peakRssBytes,
        oomKilled: run.oomKilled,
        resource: parseRunResource(run.resourceJson),
        error: error
            ? {
                code: error.code ?? 'UNKNOWN',
                message: sanitizeV1Text(error.message ?? ''),
            }
            : null,
        failureCode: run.failureCode,
        failureStage: run.failureStage,
        failureKind: run.failureKind,
    }
}

/** v1 运行详情的结果行（不含内部凭据 / 路径字段，自由文本清洗） */
export const toRunResultV1View = (result: ScanResult) => ({
    id: result.id,
    source: result.source,
    severity: result.severity,
    packageName: result.packageName,
    manifestPath: result.manifestPath,
    ruleId: result.ruleId,
    summary: sanitizeV1Text(result.summary ?? ''),
    fixable: result.fixable,
    fixStrategy: result.fixStrategy,
    recommendedVersion: result.recommendedVersion,
    htmlUrl: result.htmlUrl,
    fixStatus: result.fixStatus,
    errorMessage: result.errorMessage ? sanitizeV1Text(result.errorMessage) : null,
})

/** v1 运行详情（**不含** logs / logsText；日志由后续 `/runs/{id}/logs` 契约提供） */
export const toRunV1DetailView = (run: ScanRun, results: ScanResult[]) => ({
    ...toRunV1View(run),
    buildVersion: run.buildVersion ?? null,
    buildCommit: run.buildCommit ?? null,
    retriedFromRunId: run.retriedFromRunId ?? null,
    results: results.map(toRunResultV1View),
})
