import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Octokit } from '@octokit/rest'
import type { AiOptions } from '@dependfix/engine'
import type { AppContext } from '../app/helpers'
import { runAiIntegration } from './app-integration'

// ---------------------------------------------------------------------------
// AI 研判 app 集成单元测试（分流逻辑）
// ---------------------------------------------------------------------------

const { mockAssess, mockFetchChangelog, mockVerifyProject, mockApplyChanges, mockValidate } = vi.hoisted(() => ({
    mockAssess: vi.fn(),
    mockFetchChangelog: vi.fn(),
    mockVerifyProject: vi.fn(),
    mockApplyChanges: vi.fn(),
    mockValidate: vi.fn(),
}))

vi.mock('./index', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./index')>()
    return {
        ...actual,
        assessBreakingChange: mockAssess,
    }
})

vi.mock('./changelog-fetcher', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./changelog-fetcher')>()
    return {
        ...actual,
        createChangelogFetcher: () => ({ fetchChangelog: mockFetchChangelog }),
    }
})

vi.mock('../app/helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../app/helpers')>()
    return {
        ...actual,
        verifyProject: mockVerifyProject,
    }
})

vi.mock('./patch-applier', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./patch-applier')>()
    return {
        ...actual,
        applyChanges: mockApplyChanges,
    }
})

vi.mock('./safety-gate', () => ({
    validateAiChanges: mockValidate,
}))

const ai: AiOptions = {
    enabled: true,
    provider: 'openai-compatible',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-test-key-1234567890',
    trigger: 'both',
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as AppContext['logger']

function makeDeps(overrides: Partial<Parameters<typeof runAiIntegration>[0]> = {}) {
    return {
        ai,
        client: {} as Octokit,
        ctx: {
            config: {},
            customCommands: undefined,
            logger,
            workDir: '/tmp/work',
            allErrors: [],
        } as unknown as Parameters<typeof runAiIntegration>[0]['ctx'],
        repo: 'foo/bar',
        dryRun: false,
        ...overrides,
    }
}

const request = {
    packageName: 'vite',
    fromVersion: '5.4.14',
    toVersion: '6.4.3',
}

function assessment(overrides: Partial<import('./schema').AiAssessment> = {}): import('./schema').AiAssessment {
    return {
        classification: 'manual',
        summary: '需要人工评估',
        changes: [],
        confidence: 0.5,
        rationale: '',
        ...overrides,
    }
}

describe('runAiIntegration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockFetchChangelog.mockResolvedValue({ entries: [{ version: 'v6.4.3', body: 'x', breakingChanges: ['b'], htmlUrl: '' }] })
        mockAssess.mockResolvedValue({
            assessment: assessment(),
            usage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            degraded: false,
        })
    })

    it('does not run when AI disabled', async () => {
        const result = await runAiIntegration(
            makeDeps({ ai: { ...ai, enabled: false } }),
            request,
        )

        expect(result.attempted).toBe(false)
        expect(result.actions).toEqual([])
        expect(mockAssess).not.toHaveBeenCalled()
    })

    it('does not run in dry-run (no cost)', async () => {
        const result = await runAiIntegration(makeDeps({ dryRun: true }), request)

        expect(result.attempted).toBe(false)
        expect(mockAssess).not.toHaveBeenCalled()
    })

    it('skips AI when changelog fetch fails and produces suggestion', async () => {
        mockFetchChangelog.mockResolvedValue({ entries: [], error: 'no GitHub repository metadata' })

        const result = await runAiIntegration(makeDeps(), request)

        expect(result.attempted).toBe(true)
        expect(mockAssess).not.toHaveBeenCalled()
        expect(result.actions[0].strategy).toBe('ai-suggestion')
        expect(result.actions[0].diff).toContain('changelog 采集失败')
    })

    it('logs usage and produces suggestion on degraded assessment', async () => {
        mockAssess.mockResolvedValue({
            assessment: null,
            usage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            degraded: true,
            error: 'AI provider error (HTTP 401)',
        })

        const result = await runAiIntegration(makeDeps(), request)

        expect(result.attempted).toBe(true)
        expect(result.actions[0].strategy).toBe('ai-suggestion')
        expect(result.actions[0].diff).toContain('AI 研判降级')
        // usage 日志输出（决策 4）
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[ai] vite 研判消耗'))
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('100 in / 50 out tokens'))
    })

    it('applies code-change fix through safety gate and verification', async () => {
        const changes = [{ filePath: 'src/main.ts', replace: [{ search: 'old()', replace: 'new()' }] }]
        mockAssess.mockResolvedValue({
            assessment: assessment({ classification: 'code-change', changes }),
            usage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            degraded: false,
        })
        mockValidate.mockReturnValue({ ok: true, errors: [], warnings: [] })
        mockApplyChanges.mockReturnValue({ success: true, appliedFiles: ['src/main.ts'], rollback: vi.fn() })
        mockVerifyProject.mockResolvedValue([{ type: 'verification', repository: 'foo/bar', target: 'pnpm lint', success: true }])

        const result = await runAiIntegration(makeDeps(), request)

        expect(result.actions).toHaveLength(1)
        expect(result.actions[0].strategy).toBe('ai-patch')
        expect(result.actions[0].success).toBe(true)
        expect(mockApplyChanges).toHaveBeenCalledWith('/tmp/work', changes)
    })

    it('rejects code-change fix blocked by safety gate (suggestion fallback)', async () => {
        mockAssess.mockResolvedValue({
            assessment: assessment({ classification: 'code-change', changes: [{ filePath: 'a.ts', replace: [{ search: 'x', replace: 'y' }] }] }),
            usage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            degraded: false,
        })
        mockValidate.mockReturnValue({ ok: false, errors: ['potential secret material'], warnings: [] })

        const result = await runAiIntegration(makeDeps(), request)

        expect(result.actions[0].strategy).toBe('ai-suggestion')
        expect(result.actions[0].diff).toContain('安全门拒绝')
        expect(mockApplyChanges).not.toHaveBeenCalled()
    })

    it('rolls back AI patch when verification fails after apply (failed, not fixed)', async () => {
        const rollback = vi.fn()
        mockAssess.mockResolvedValue({
            assessment: assessment({ classification: 'code-change', changes: [{ filePath: 'a.ts', replace: [{ search: 'x', replace: 'y' }] }] }),
            usage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            degraded: false,
        })
        mockValidate.mockReturnValue({ ok: true, errors: [], warnings: [] })
        mockApplyChanges.mockReturnValue({ success: true, appliedFiles: ['a.ts'], rollback })
        mockVerifyProject.mockResolvedValue([{ type: 'verification', repository: 'foo/bar', target: 'pnpm build', success: false }])

        const result = await runAiIntegration(makeDeps(), request)

        expect(result.actions[0].strategy).toBe('ai-patch')
        expect(result.actions[0].success).toBe(false)
        expect(result.actions[0].error).toContain('已回滚')
        expect(rollback).toHaveBeenCalled()
    })

    it('produces version-lock suggestion with override declaration', async () => {
        mockAssess.mockResolvedValue({
            assessment: assessment({ classification: 'version-lock', summary: '锁定到旧版本规避 breaking' }),
            usage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            degraded: false,
        })

        const result = await runAiIntegration(makeDeps(), request)

        expect(result.actions[0].strategy).toBe('ai-suggestion')
        expect(result.actions[0].diff).toContain('pnpm-workspace.yaml overrides')
        expect(result.actions[0].diff).toContain('vite@6.4.3')
    })

    it('produces wait-upstream note', async () => {
        mockAssess.mockResolvedValue({
            assessment: assessment({ classification: 'wait-upstream', summary: '上游已修复但未发布' }),
            usage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            degraded: false,
        })

        const result = await runAiIntegration(makeDeps(), request)

        expect(result.actions[0].strategy).toBe('ai-suggestion')
        expect(result.actions[0].diff).toContain('等待上游修复')
    })
})
