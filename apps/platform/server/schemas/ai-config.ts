import { z } from 'zod'

/**
 * AI 研判配置 Zod schema（共用）—— todo.md §M26.1 应用层 / [platform-ai-integration.md §6.2/§6.3/§6.4](../design/governance/platform-ai-integration.md)。
 *
 * 三段式（Organization 级 / Repository 级 / 运行时 override）：
 * - Organization 级：Provider + Model + API Key + Base URL + Anthropic URL（[§6.2](../design/governance/platform-ai-integration.md)）
 * - Repository 级：单仓库 aiEnabled 开关 + trigger 范围（[§6.4](../design/governance/platform-ai-integration.md)）
 * - 运行时 override：API request.aiEnabled / aiTrigger（已由 [scan.ts](./scan.ts) M25.2a 定义）
 *
 * API Key 加密落库：复用 [credential.service.ts:encryptToken](../services/credential.service.ts)（与 Credential.encryptedToken 同源 AES-256-GCM）；
 * 响应不回显 apiKey 明文（仅返回 `hasAiApiKey: boolean`）。
 *
 * 注意：
 * - aiApiKey 落库前调用 encryptToken(plaintext, getEncryptionKey())；读取时由 [ai-config-resolver.ts](../services/ai-config-resolver.ts) 解密注入 RuntimeConfig.ai.apiKey
 * - baseUrl / apiUrl nullable（null = 走 AiOptions 默认端点）
 * - aiApiKey 字段为空字符串视为清空（PATCH 时若传空字符串则置 null）
 */

/** Organization 级 AI 配置 PATCH 请求体 —— §6.2 */
export const organizationAiConfigSchema = z.object({
    aiApiKey: z.string().optional()
        .refine(
            (v) => v === undefined || v.length === 0 || v.length >= 8,
            'AI API Key 长度至少 8 字符',
        ),
    aiProvider: z.enum(['openai-compatible', 'anthropic']).optional(),
    aiModel: z.string().min(1).max(100).optional(),
    aiBaseUrl: z.url().nullable().optional(),
    aiApiUrl: z.url().nullable().optional(),
})

export type OrganizationAiConfigInput = z.infer<typeof organizationAiConfigSchema>

/** Repository 级 AI 配置 POST 请求体 —— §6.4 */
export const repositoryAiConfigSchema = z.object({
    aiEnabled: z.boolean().optional(),
    aiTrigger: z.enum(['failure', 'major', 'both']).optional(),
})

export type RepositoryAiConfigInput = z.infer<typeof repositoryAiConfigSchema>

/**
 * GET /api/repos/[id]/ai-config 响应结构 —— §6.3
 * - repository：仓库级配置
 * - organization：组织级配置（不返回 apiKey 明文）
 * - effective：合并后实际生效配置（用于 UI 显示）
 */
export interface RepositoryAiConfigResponse {
    repository: {
        aiEnabled: boolean
        aiTrigger: 'failure' | 'major' | 'both'
    }
    organization: {
        hasAiApiKey: boolean
        aiProvider: 'openai-compatible' | 'anthropic'
        aiModel: string
        aiBaseUrl: string | null
        aiApiUrl: string | null
    }
    effective: {
        aiEnabled: boolean
        aiTrigger: 'failure' | 'major' | 'both'
        aiProvider: 'openai-compatible' | 'anthropic'
        hasApiKey: boolean
    }
}
