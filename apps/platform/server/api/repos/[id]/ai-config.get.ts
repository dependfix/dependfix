import type { RepositoryAiConfigResponse } from '#server/schemas/ai-config'
import { createLocalizedError } from '#server/utils/localized-error'
import { requireOrgResource } from '#server/utils/guard'
import { Repository } from '#server/entities/repository'
import { Organization } from '#server/entities/organization'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * GET /api/repos/[id]/ai-config —— todo.md §M26.1 应用层 / [platform-ai-integration.md §6.3](../design/governance/platform-ai-integration.md)。
 *
 * 权限：viewable（任何组织成员可读）。
 * 响应：Repository + Organization + effective（合并后实际生效配置）。
 * effective 计算：复用 [ai-config-resolver.ts:resolveAiConfig](../services/ai-config-resolver.ts) 合并优先级，但本次请求无 aiEnabled/aiTrigger override，
 * 所以 effective.aiEnabled = repository.aiEnabled，effective.aiTrigger = repository.aiTrigger。
 *
 * 凭据最小化：响应不返回 aiApiKeyEncrypted / aiApiKey 明文，仅返回 hasAiApiKey 布尔。
 */
export default defineEventHandler(async (event): Promise<RepositoryAiConfigResponse> => {
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'REPO_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const orgRepo = ds.getRepository(Organization)

    const repo = await repoRepo.findOne({ where: { id } })
    if (!repo) {
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
    }
    // 凭据归属校验
    await requireOrgResource(event, repo.organizationId)

    if (!repo.organizationId) {
        throw createLocalizedError(event, { statusCode: 500, code: 'ORG_NOT_FOUND' })
    }
    const org = await orgRepo.findOne({ where: { id: repo.organizationId } })
    if (!org) {
        throw createLocalizedError(event, { statusCode: 500, code: 'ORG_NOT_FOUND' })
    }

    const hasAiApiKey = !!org.aiApiKeyEncrypted

    return {
        repository: {
            aiEnabled: repo.aiEnabled,
            aiTrigger: repo.aiTrigger,
        },
        organization: {
            hasAiApiKey,
            aiProvider: org.aiProvider,
            aiModel: org.aiModel,
            aiBaseUrl: org.aiBaseUrl,
            aiApiUrl: org.aiApiUrl,
        },
        effective: {
            aiEnabled: repo.aiEnabled,
            aiTrigger: repo.aiTrigger,
            aiProvider: org.aiProvider,
            hasApiKey: hasAiApiKey,
        },
    }
})
