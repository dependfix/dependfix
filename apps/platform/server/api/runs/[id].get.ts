import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { parseLogEntries, formatLogEntries } from '#server/utils/memory-logger'
import { parseRunResource } from '#server/utils/run-resource'

/** GET /api/runs/[id]：扫描详情（含结果明细 + 执行日志） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    const run = await runRepo.findOne({
        where: { id },
        relations: { repository: true },
    })
    if (!run) {
        throw createLocalizedError(event, { statusCode: 404, code: 'SCAN_RUN_NOT_FOUND' })
    }

    const results = await resultRepo.find({
        where: { scanRunId: run.id },
        // 同 severity 并列时按主键 DESC 兜底（api.md §4 排序确定性），避免结果明细行序抖动
        order: { severity: 'ASC', id: 'DESC' },
    })

    // 解析执行日志
    const logEntries = parseLogEntries(run.logsJson)
    const logsText = logEntries.length > 0 ? formatLogEntries(logEntries) : null

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
        summary: run.summaryJson ? JSON.parse(run.summaryJson) as Record<string, unknown> : null,
        // 运行结果可信度：与列表同一口径；旧数据 exitCode 为 null，B 模式不传递 exitCode
        exitCode: run.exitCode,
        environmentalFailureCount: run.environmentalFailureCount,
        // 构建版本回执：本次 run 由哪个部署产物执行（未注入为 unknown，存量行为 null）
        buildVersion: run.buildVersion ?? null,
        buildCommit: run.buildCommit ?? null,
        memoryMaxBytes: run.memoryMaxBytes,
        peakRssBytes: run.peakRssBytes,
        oomKilled: run.oomKilled,
        resource: parseRunResource(run.resourceJson),
        error: run.errorJson ? JSON.parse(run.errorJson) as { code: string, message: string } : null,
        // 失败分类三列 + 重试来源：详情视图据此展示失败归因与「重试入口 / 来源链」
        // （口径见 docs/design/governance/run-failure-taxonomy.md §5.5）
        failureCode: run.failureCode,
        failureStage: run.failureStage,
        failureKind: run.failureKind,
        retriedFromRunId: run.retriedFromRunId ?? null,
        results: results.map((r) => ({
            id: r.id,
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
        })),
        logs: logEntries,
        logsText,
    }
})
