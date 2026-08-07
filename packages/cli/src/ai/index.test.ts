import { describe, expect, it, vi } from 'vitest'
import type { ChangelogEntry } from './changelog-fetcher'
import { buildAssessmentContext } from './prompt'
import { AiUsageTracker, estimateCostUsd } from './usage'
import { maskSecrets, maskValue } from './secrets'
import { assessBreakingChange } from './index'

// ---------------------------------------------------------------------------
// 研判编排 + prompt 构建 + usage 聚合 + 脱敏
// ---------------------------------------------------------------------------

function okChat(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function entry(version: string, breakingChanges: string[]): ChangelogEntry {
    return { version, body: breakingChanges.join('\n'), breakingChanges, htmlUrl: '' }
}

// ---------------------------------------------------------------------------
// maskSecrets
// ---------------------------------------------------------------------------

describe('maskSecrets', () => {
    it('masks long secret values keeping first and last 4 chars', () => {
        expect(maskSecrets('error with key sk-abc12345678xyz', ['sk-abc12345678xyz']))
            .toBe('error with key sk-a****8xyz')
    })

    it('does not mask short values (<= 8 chars)', () => {
        expect(maskSecrets('value abcdef', ['abcdef'])).toBe('value abcdef')
    })

    it('returns original text when no secrets', () => {
        expect(maskSecrets('plain text', [])).toBe('plain text')
        expect(maskSecrets('', ['sk-test'])).toBe('')
    })

    it('masks multiple occurrences', () => {
        expect(maskSecrets('a sk-key-1234567890 b sk-key-1234567890', ['sk-key-1234567890']))
            .toBe('a sk-k****7890 b sk-k****7890')
    })

    it('maskValue handles short input', () => {
        expect(maskValue('short')).toBe('****')
        expect(maskValue('sk-abcdefghijkl')).toBe('sk-a****ijkl')
    })
})

// ---------------------------------------------------------------------------
// estimateCostUsd / AiUsageTracker
// ---------------------------------------------------------------------------

describe('estimateCostUsd', () => {
    it('computes cost from model price table', () => {
        // deepseek-chat: 0.14 / 1M input, 0.28 / 1M output（models.dev 2026 定价）
        expect(estimateCostUsd('deepseek-chat', 1_000_000, 0)).toBeCloseTo(0.14, 5)
        expect(estimateCostUsd('deepseek-chat', 0, 1_000_000)).toBeCloseTo(0.28, 5)
        expect(estimateCostUsd('deepseek-v4-flash', 1_000_000, 1_000_000)).toBeCloseTo(0.42, 5)
    })

    it('returns undefined for unknown models (no misleading estimate)', () => {
        expect(estimateCostUsd('unknown-model', 1000, 1000)).toBeUndefined()
    })
})

describe('AiUsageTracker', () => {
    it('aggregates calls and tokens', () => {
        const tracker = new AiUsageTracker('deepseek-chat')
        tracker.record(100, 50)
        tracker.record(200, 100)

        const snapshot = tracker.snapshot()
        expect(snapshot.calls).toBe(2)
        expect(snapshot.inputTokens).toBe(300)
        expect(snapshot.outputTokens).toBe(150)
        expect(snapshot.totalTokens).toBe(450)
        expect(snapshot.estimatedCostUsd).toBeDefined()
    })

    it('omits cost estimate for unknown models', () => {
        const tracker = new AiUsageTracker('custom-model')
        tracker.record(100, 50)
        expect(tracker.snapshot().estimatedCostUsd).toBeUndefined()
    })

    it('empty snapshot has zero counters', () => {
        const snapshot = new AiUsageTracker('deepseek-chat').snapshot()
        expect(snapshot).toMatchObject({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    })
})

// ---------------------------------------------------------------------------
// buildAssessmentContext
// ---------------------------------------------------------------------------

describe('buildAssessmentContext', () => {
    it('includes upgrade info and breaking changes', () => {
        const context = buildAssessmentContext({
            packageName: 'vite',
            fromVersion: '5.4.14',
            toVersion: '6.4.3',
            changelogEntries: [entry('v6.4.3', ['Requires Node 20+'])],
        })

        expect(context).toContain('vite')
        expect(context).toContain('5.4.14 → 6.4.3')
        expect(context).toContain('Requires Node 20+')
    })

    it('includes failure log tail and affected files when provided', () => {
        const lines = Array.from({ length: 300 }, (_, i) => `log line ${i}`)
        const context = buildAssessmentContext({
            packageName: 'pkg',
            fromVersion: '1.0.0',
            toVersion: '2.0.0',
            changelogEntries: [],
            failureLog: lines.join('\n'),
            affectedFiles: ['src/a.ts', 'src/b.ts'],
        })

        // 尾部保留（200 行截断）
        expect(context).toContain('log line 299')
        expect(context).not.toContain('log line 0')
        expect(context).toContain('src/a.ts')
    })

    it('handles missing changelog with explicit notice', () => {
        const context = buildAssessmentContext({
            packageName: 'pkg',
            fromVersion: '1.0.0',
            toVersion: '2.0.0',
            changelogEntries: [],
        })

        expect(context).toContain('未获取到目标版本 changelog')
    })
})

// ---------------------------------------------------------------------------
// assessBreakingChange（编排）
// ---------------------------------------------------------------------------

describe('assessBreakingChange', () => {
    const baseConfig = {
        provider: 'openai-compatible' as const,
        model: 'deepseek-chat',
        apiKey: 'sk-test-secret-key-1234567890',
    }
    const baseContext = {
        packageName: 'vite',
        fromVersion: '5.4.14',
        toVersion: '6.4.3',
        changelogEntries: [entry('v6.4.3', ['Breaking: drop old API'])],
    }
    const validOutput = JSON.stringify({
        classification: 'code-change',
        summary: '需要适配新 API',
        changes: [{ filePath: 'src/main.ts', replace: [{ search: 'old()', replace: 'new()' }] }],
        confidence: 0.9,
        rationale: 'changelog 显示 old API 已移除',
    })

    it('returns structured assessment on valid output', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okChat({
            choices: [{ message: { content: validOutput } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
        }))

        const result = await assessBreakingChange({ config: baseConfig, context: baseContext, fetchFn })

        expect(result.degraded).toBe(false)
        expect(result.assessment?.classification).toBe('code-change')
        expect(result.assessment?.changes[0].filePath).toBe('src/main.ts')
        expect(result.usage).toMatchObject({ calls: 1, inputTokens: 100, outputTokens: 50 })
        expect(result.error).toBeUndefined()
    })

    it('retries once on schema failure then succeeds', async () => {
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(okChat({ choices: [{ message: { content: 'not json at all' } }] }))
            .mockResolvedValueOnce(okChat({ choices: [{ message: { content: validOutput } }] }))

        const result = await assessBreakingChange({ config: baseConfig, context: baseContext, fetchFn })

        expect(result.degraded).toBe(false)
        expect(fetchFn).toHaveBeenCalledTimes(2)
        expect(result.usage.calls).toBe(2)
        // 重试消息包含解析错误提示
        const secondBody = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string)
        expect(secondBody.messages[1].content).toContain('上次输出未通过 JSON schema 校验')
        expect(secondBody.messages[1].content).toContain('no JSON object found')
    })

    it('degrades after schema retries exhausted', async () => {
        // 每次调用返回新的 Response 实例（body 只能读一次）
        const fetchFn = vi.fn().mockImplementation(() => okChat({ choices: [{ message: { content: 'still not json' } }] }))

        const result = await assessBreakingChange({ config: baseConfig, context: baseContext, fetchFn })

        expect(result.degraded).toBe(true)
        expect(result.assessment).toBeNull()
        expect(result.error).toContain('schema validation')
        expect(result.error).toContain('no JSON object found')
        expect(fetchFn).toHaveBeenCalledTimes(2) // 默认 1 次重试
    })

    it('degrades on provider HTTP error without retry (avoid duplicate billing)', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('invalid key', { status: 401 }))

        const result = await assessBreakingChange({ config: baseConfig, context: baseContext, fetchFn })

        expect(result.degraded).toBe(true)
        expect(result.error).toContain('AI provider error')
        expect(result.error).toContain('HTTP 401')
        expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('degrades on network error', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

        const result = await assessBreakingChange({ config: baseConfig, context: baseContext, fetchFn })

        expect(result.degraded).toBe(true)
        expect(result.error).toContain('AI call failed')
    })

    it('masks apiKey in error messages (no credential leak)', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error(`boom with key ${baseConfig.apiKey} inside`))

        const result = await assessBreakingChange({ config: baseConfig, context: baseContext, fetchFn })

        expect(result.degraded).toBe(true)
        expect(result.error).not.toContain(baseConfig.apiKey)
        expect(result.error).toContain(maskValue(baseConfig.apiKey))
    })

    it('masks apiKey echoed back in provider response body (OpenAI 401 style)', async () => {
        // 真实 OpenAI 401 响应体会回显 key 前缀/信息
        const fetchFn = vi.fn().mockResolvedValue(
            new Response(`{"error":{"message":"Incorrect API key provided: ${baseConfig.apiKey}","type":"authentication_error"}}`, { status: 401 }),
        )

        const result = await assessBreakingChange({ config: baseConfig, context: baseContext, fetchFn })

        expect(result.degraded).toBe(true)
        expect(result.error).not.toContain(baseConfig.apiKey)
        expect(result.error).toContain(maskValue(baseConfig.apiKey))
        expect(result.error).toContain('HTTP 401')
    })
})
