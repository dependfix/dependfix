import type { AiOptions } from '@dependfix/engine'
import type { ScanRequest } from './scan-orchestrator.service'
import { decryptToken, getEncryptionKey } from './credential.service'
import type { Repository } from '#server/entities/repository'
import type { Organization } from '#server/entities/organization'

/**
 * AI 研判配置解析结果。
 * - ai：注入到 RuntimeConfig.ai 的完整 AiOptions（apiKey 仅在内存中解密传递，不写入 ScanRun.aiConfigSnapshot）
 * - error：合并 / 校验失败的错误描述（含 statusCode 与 message），调用方决定是否 throw
 * - snapshot：写入 ScanRun.aiConfigSnapshot 的审计快照（apiKey 替换为 hasApiKey 布尔）
 */
export interface AiConfigResolution {
    ai?: AiOptions
    snapshot?: {
        enabled: boolean
        provider: string
        model: string
        baseUrl: string | null
        apiUrl: string | null
        trigger: string
        hasApiKey: boolean
    }
    error?: {
        statusCode: number
        message: string
    }
}

/**
 * 合并 AI 研判配置（todo.md §M25.2a + [platform-ai-integration.md §5.3](../design/governance/platform-ai-integration.md)）。
 *
 * 合并优先级：
 * - aiEnabled：API request.aiEnabled > Repository.aiEnabled > false（仓库级默认）
 * - aiTrigger：API request.aiTrigger > Repository.aiTrigger > 'both'
 * - provider / model / baseUrl / apiUrl：仅取 Organization 级（仓库级无 override）
 * - apiKey：仅取 Organization.aiApiKeyEncrypted（解密后内存中持有）
 *
 * 错误规则：
 * - aiEnabled=true 但 Organization 未配 aiApiKeyEncrypted → 400「Organization 未配置 AI API Key」
 * - aiEnabled=true 但 Repository.aiEnabled=false 且 API 未显式传 aiEnabled → 400「仓库级 AI 研判未启用，禁止 override」
 */
export const resolveAiConfig = (
    request: ScanRequest,
    repository: Repository,
    organization: Organization | null,
): AiConfigResolution => {
    // aiEnabled 合并：API override > Repository 默认 > false
    const resolvedEnabled = request.aiEnabled ?? repository.aiEnabled ?? false
    // aiTrigger 合并：API override > Repository 默认 > 'both'
    const resolvedTrigger = request.aiTrigger ?? repository.aiTrigger ?? 'both'

    // 兜底 baseUrl（避免 AiOptions.baseUrl 类型必填 + Organization.aiBaseUrl 可空）
    const defaultBaseUrl = 'https://api.deepseek.com'

    // AI 未启用：返回 enabled=false 占位（不注入 apiKey）
    if (!resolvedEnabled) {
        return {
            ai: {
                enabled: false,
                provider: organization?.aiProvider ?? 'openai-compatible',
                model: organization?.aiModel ?? 'deepseek-v4-flash',
                baseUrl: organization?.aiBaseUrl ?? defaultBaseUrl,
                apiUrl: organization?.aiApiUrl ?? undefined,
                trigger: resolvedTrigger,
            },
            snapshot: {
                enabled: false,
                provider: organization?.aiProvider ?? 'openai-compatible',
                model: organization?.aiModel ?? 'deepseek-v4-flash',
                baseUrl: organization?.aiBaseUrl ?? null,
                apiUrl: organization?.aiApiUrl ?? null,
                trigger: resolvedTrigger,
                hasApiKey: false,
            },
        }
    }

    // AI 启用：需 Organization 级 Key
    if (!organization?.aiApiKeyEncrypted) {
        return {
            error: {
                statusCode: 400,
                message: 'Organization 未配置 AI API Key，请先在设置中添加',
            },
        }
    }

    // 防误启用：仓库级 aiEnabled=false 且 API 未显式传 aiEnabled → 拒绝 override
    if (!repository.aiEnabled && request.aiEnabled === undefined) {
        return {
            error: {
                statusCode: 400,
                message: '仓库级 AI 研判未启用，禁止通过 override 启用',
            },
        }
    }

    // 解密 API Key（仅内存持有）
    let apiKey: string
    try {
        apiKey = decryptToken(organization.aiApiKeyEncrypted, getEncryptionKey())
    } catch (err) {
        return {
            error: {
                statusCode: 500,
                message: `AI API Key 解密失败: ${err instanceof Error ? err.message : String(err)}`,
            },
        }
    }

    return {
        ai: {
            enabled: true,
            provider: organization.aiProvider,
            model: organization.aiModel,
            baseUrl: organization.aiBaseUrl ?? defaultBaseUrl,
            apiUrl: organization.aiApiUrl ?? undefined,
            apiKey,
            trigger: resolvedTrigger,
        },
        snapshot: {
            enabled: true,
            provider: organization.aiProvider,
            model: organization.aiModel,
            baseUrl: organization.aiBaseUrl,
            apiUrl: organization.aiApiUrl,
            trigger: resolvedTrigger,
            hasApiKey: true,
        },
    }
}
