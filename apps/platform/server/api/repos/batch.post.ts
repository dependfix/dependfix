import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { requireRole } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'
import { batchImportSchema } from '#server/schemas/batch-import'

/**
 * 批量添加仓库：从 GitHub 导入候选（GET /api/repos/importable 结果）中选中多个，
 * 逐个创建 Repository 记录（幂等：已存在的跳过；并发唯一约束冲突同样按跳过处理）。
 * 权限：admin / org_admin（写操作）。
 * body：{ repos: Array<仓库字段> }——项校验复用 repositorySchema（owner/name 正则、
 * github-action→actionWorkflowFile 交叉校验与单个添加入口保持一致）。
 */

export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = batchImportSchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const organizationId = await resolveOrganizationId(ds)

    const results: { owner: string, name: string, imported: boolean, skipped: boolean }[] = []
    for (const item of parsed.data.repos) {
        const existing = await repoRepo.findOne({
            where: { owner: item.owner, name: item.name, platform: 'github' },
        })
        if (existing) {
            results.push({ owner: item.owner, name: item.name, imported: false, skipped: true })
            continue
        }
        const entity = repoRepo.create({
            organizationId,
            owner: item.owner,
            name: item.name,
            platform: 'github',
            defaultBranch: item.defaultBranch,
            packageManager: item.packageManager,
            executorKind: item.executorKind,
            actionWorkflowFile: item.actionWorkflowFile ?? null,
            note: item.note ?? null,
        })
        try {
            await repoRepo.save(entity)
            results.push({ owner: item.owner, name: item.name, imported: true, skipped: false })
        } catch (error) {
            // 并发重复导入：唯一索引（owner+name+platform）冲突视为跳过，不整体失败
            // 方言覆盖：SQLite（UNIQUE constraint failed）/ MySQL（Duplicate entry）/ PostgreSQL（duplicate key value）
            const message = error instanceof Error ? error.message : String(error)
            const isUniqueConflict = message.includes('UNIQUE constraint failed')
                || message.includes('Duplicate entry')
                || message.includes('duplicate key value')
            if (isUniqueConflict) {
                results.push({ owner: item.owner, name: item.name, imported: false, skipped: true })
            } else {
                throw error
            }
        }
    }

    return {
        results,
        imported: results.filter((r) => r.imported).length,
        skipped: results.filter((r) => r.skipped).length,
    }
})
