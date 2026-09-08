import 'reflect-metadata'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// mock credential.service 解密路径（避免测试依赖 NUXT_ENCRYPTION_KEY 真实密钥）
vi.mock('./credential.service', () => ({
    decryptToken: (encrypted: string) => `decrypted-${encrypted}`,
    getEncryptionKey: () => 'test-encryption-key',
}))

import { resolveAiConfig } from './ai-config-resolver'
import type { ScanRequest } from './scan-orchestrator.service'
import type { Repository } from '#server/entities/repository'
import type { Organization } from '#server/entities/organization'

const baseRequest: ScanRequest = {
    mode: 'report-only',
    severityThreshold: 'high',
}

const baseRepository = (overrides: Partial<Repository> = {}): Repository => ({
    id: 'repo-1',
    organizationId: 'org-1',
    owner: 'test-owner',
    name: 'test-repo',
    platform: 'github',
    defaultBranch: 'main',
    packageManager: 'pnpm',
    credentialId: null,
    actionWorkflowFile: null,
    executorKind: 'container',
    aiEnabled: false,
    aiTrigger: 'both',
    note: null,
    lastScanAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: null,
    tags: null,
    sandboxLimits: null,
    credential: null,
    ...overrides,
} as Repository)

const baseOrganization = (overrides: Partial<Organization> = {}): Organization => ({
    id: 'org-1',
    name: 'Test Org',
    aiApiKeyEncrypted: null,
    aiProvider: 'openai-compatible',
    aiModel: 'deepseek-v4-flash',
    aiBaseUrl: null,
    aiApiUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
} as Organization)

describe('resolveAiConfig', () => {
    describe('AI 未启用场景', () => {
        it('全部为默认（无 API override + 仓库 aiEnabled=false + Organization 无 Key）→ 返回 enabled=false + snapshot', () => {
            const result = resolveAiConfig(baseRequest, baseRepository(), baseOrganization())
            expect(result.error).toBeUndefined()
            expect(result.ai?.enabled).toBe(false)
            expect(result.ai?.trigger).toBe('both')
            expect(result.snapshot?.hasApiKey).toBe(false)
        })

        it('AI 未启用但 Organization 已配 Key → 仍允许（无 Key 解密需求）', () => {
            const result = resolveAiConfig(baseRequest, baseRepository(), baseOrganization({
                aiApiKeyEncrypted: 'encrypted-key',
            }))
            expect(result.error).toBeUndefined()
            expect(result.ai?.enabled).toBe(false)
            // apiKey 不应出现在 ai 中（未启用场景）
            expect(result.ai?.apiKey).toBeUndefined()
            expect(result.snapshot?.hasApiKey).toBe(false)
        })

        it('Organization.aiProvider=anthropic + aiApiUrl 透传', () => {
            const result = resolveAiConfig(baseRequest, baseRepository(), baseOrganization({
                aiProvider: 'anthropic',
                aiApiUrl: 'https://api.anthropic.com/v1/messages',
            }))
            expect(result.ai?.provider).toBe('anthropic')
            expect(result.ai?.apiUrl).toBe('https://api.anthropic.com/v1/messages')
        })
    })

    describe('AI 启用场景 - 合并优先级', () => {
        it('仓库 aiEnabled=true + Organization 已配 Key → 合并成功（注入 apiKey）', () => {
            const result = resolveAiConfig(baseRequest, baseRepository({
                aiEnabled: true,
            }), baseOrganization({
                aiApiKeyEncrypted: 'encrypted-key',
            }))
            expect(result.error).toBeUndefined()
            expect(result.ai?.enabled).toBe(true)
            // mock decryptToken 返回 decrypted-{encrypted}
            expect(result.ai?.apiKey).toBe('decrypted-encrypted-key')
            expect(result.snapshot?.hasApiKey).toBe(true)
            // apiKey 不写入 snapshot
            expect(JSON.stringify(result.snapshot)).not.toContain('apiKey')
            expect(JSON.stringify(result.snapshot)).not.toContain('encrypted-key')
        })

        it('API 显式 override aiEnabled=true + 仓库 aiEnabled=false → 允许 override（合并优先级 §5.3 API > Repository）', () => {
            // API 显式 override 优先于仓库默认（合并优先级 §5.3）
            const result = resolveAiConfig(
                { ...baseRequest, aiEnabled: true },
                baseRepository({ aiEnabled: false }),
                baseOrganization({ aiApiKeyEncrypted: 'encrypted-key' }),
            )
            expect(result.error).toBeUndefined()
            expect(result.ai?.enabled).toBe(true)
        })

        it('仓库 aiEnabled=true + API 未传 → 允许（沿用仓库默认）', () => {
            const result = resolveAiConfig(
                baseRequest,
                baseRepository({ aiEnabled: true }),
                baseOrganization({ aiApiKeyEncrypted: 'encrypted-key' }),
            )
            expect(result.error).toBeUndefined()
            expect(result.ai?.enabled).toBe(true)
        })

        it('仓库 aiEnabled=true 但 Organization 未配 Key → 拒绝', () => {
            const result = resolveAiConfig(baseRequest, baseRepository({
                aiEnabled: true,
            }), baseOrganization({ aiApiKeyEncrypted: null }))
            expect(result.error).toBeDefined()
            expect(result.error?.statusCode).toBe(400)
            expect(result.error?.message).toContain('Organization 未配置 AI API Key')
        })

        it('仓库 aiEnabled=true + Organization=null → 拒绝', () => {
            const result = resolveAiConfig(baseRequest, baseRepository({
                aiEnabled: true,
            }), null)
            expect(result.error).toBeDefined()
            expect(result.error?.statusCode).toBe(400)
        })

        it('仓库 aiEnabled=true + Organization.aiProvider=anthropic → 注入 apiUrl', () => {
            const result = resolveAiConfig(baseRequest, baseRepository({
                aiEnabled: true,
            }), baseOrganization({
                aiProvider: 'anthropic',
                aiApiUrl: 'https://api.anthropic.com/v1/messages',
                aiApiKeyEncrypted: 'encrypted-key',
            }))
            expect(result.ai?.provider).toBe('anthropic')
            expect(result.ai?.apiUrl).toBe('https://api.anthropic.com/v1/messages')
        })

        it('Organization.aiBaseUrl=null → 兜底 https://api.deepseek.com', () => {
            const result = resolveAiConfig(baseRequest, baseRepository({
                aiEnabled: true,
            }), baseOrganization({
                aiBaseUrl: null,
                aiApiKeyEncrypted: 'encrypted-key',
            }))
            expect(result.ai?.baseUrl).toBe('https://api.deepseek.com')
        })
    })

    describe('aiTrigger 合并优先级', () => {
        beforeEach(() => {
            // 各 case 独立设置 request.aiTrigger
        })

        it('仓库 aiTrigger=failure + API 未传 → 合并为 failure', () => {
            const result = resolveAiConfig(baseRequest, baseRepository({
                aiEnabled: true,
                aiTrigger: 'failure',
            }), baseOrganization({ aiApiKeyEncrypted: 'k' }))
            expect(result.ai?.trigger).toBe('failure')
        })

        it('仓库 aiTrigger=failure + API 显式传 trigger=major → API 胜出', () => {
            const result = resolveAiConfig(
                { ...baseRequest, aiTrigger: 'major' },
                baseRepository({ aiEnabled: true, aiTrigger: 'failure' }),
                baseOrganization({ aiApiKeyEncrypted: 'k' }),
            )
            expect(result.ai?.trigger).toBe('major')
        })

        it('仓库 aiTrigger=both + API 未传 + 未配 Key → 默认 both', () => {
            const result = resolveAiConfig(baseRequest, baseRepository(), baseOrganization())
            expect(result.ai?.trigger).toBe('both')
        })
    })
})
