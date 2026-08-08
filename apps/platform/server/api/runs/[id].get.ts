import { ScanRun } from '../../entities/scan-run'
import { ScanResult } from '../../entities/scan-result'
import { ensureDatabaseInitialized } from '../../database'
import { requireAuth } from '../../utils/guard'

/** GET /api/runs/[id]：扫描详情（含结果明细） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少运行 id' })
    }

    const ds = await ensureDatabaseInitialized()
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    const run = await runRepo.findOne({
        where: { id },
        relations: { repository: true },
    })
    if (!run) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '扫描记录不存在' })
    }

    const results = await resultRepo.find({
        where: { scanRunId: run.id },
        order: { severity: 'ASC' },
    })

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
        error: run.errorJson ? JSON.parse(run.errorJson) as { code: string, message: string } : null,
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
    }
})
