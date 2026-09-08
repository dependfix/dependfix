import {
    Column,
    Entity,
} from 'typeorm'
import { BaseEntity } from './base-entity'

/**
 * 组织实体（单组织最小形态：id / name / createdAt）。
 * 当前为单组织模型：默认组织 `dependfix-default`（启动幂等创建），
 * Repository / Credential 通过 organizationId 归属到组织；
 * 多租户（多组织 + 成员关系）登记 backlog，届时再扩展。
 *
 * AI 研判配置字段（todo.md §M25.2a + [platform-ai-integration.md §5.1](../design/governance/platform-ai-integration.md)）：
 * - aiApiKeyEncrypted：AES-256-GCM 加密的 AI API Key（复用 Credential.encryptedToken 同源加密）
 * - 其他字段：与 engine 层 AiOptions.provider/model/baseUrl/apiUrl 字段对齐
 * - 运行时由 scan-orchestrator.service 解密 aiApiKeyEncrypted 并注入 RuntimeConfig.ai.apiKey
 */
@Entity('organization')
export class Organization extends BaseEntity {
    @Column({ type: 'varchar', length: 100 })
    name!: string

    /**
     * AI API Key（加密存储）
     * - AES-256-GCM，与 Credential.encryptedToken 同源加密
     * - 仅在 runScanInternal 内存中解密，用后即弃；不回显到 API 响应
     */
    @Column({ type: 'text', nullable: true, name: 'ai_api_key_encrypted' })
    aiApiKeyEncrypted!: string | null

    /**
     * AI 提供商（默认 openai-compatible）
     */
    @Column({ type: 'varchar', length: 32, default: 'openai-compatible', name: 'ai_provider' })
    aiProvider!: 'openai-compatible' | 'anthropic'

    /**
     * AI 模型名（默认 deepseek-v4-flash）
     */
    @Column({ type: 'varchar', length: 100, default: 'deepseek-v4-flash', name: 'ai_model' })
    aiModel!: string

    /**
     * OpenAI 兼容端点基地址（可选，覆盖 engine 层默认 https://api.deepseek.com）
     */
    @Column({ type: 'varchar', length: 255, nullable: true, name: 'ai_base_url' })
    aiBaseUrl!: string | null

    /**
     * Anthropic 端点（可选，仅 provider=anthropic 生效）
     */
    @Column({ type: 'varchar', length: 255, nullable: true, name: 'ai_api_url' })
    aiApiUrl!: string | null
}
