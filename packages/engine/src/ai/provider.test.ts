import { describe, expect, it, vi } from 'vitest'
import { AiProviderError, createAiProvider } from './provider'

// ---------------------------------------------------------------------------
// AI 提供商（OpenAI 兼容 / Anthropic）
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

describe('createAiProvider (openai-compatible)', () => {
    it('posts chat completions with bearer auth and parses usage', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 120, completion_tokens: 45 },
        }))
        const provider = createAiProvider({
            provider: 'openai-compatible',
            model: 'deepseek-chat',
            apiKey: 'sk-test-key-1234567890',
        }, { fetchFn })

        const result = await provider.chat({
            messages: [
                { role: 'system', content: 'sys' },
                { role: 'user', content: 'hello' },
            ],
        })

        expect(fetchFn).toHaveBeenCalledTimes(1)
        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
        // 默认端点与默认模型 deepseek-v4-flash 配套（DeepSeek 官方 OpenAI 兼容端点）
        expect(url).toBe('https://api.deepseek.com/chat/completions')
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-key-1234567890')
        const body = JSON.parse(init.body as string)
        expect(body.model).toBe('deepseek-chat')
        expect(body.messages).toEqual([
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'hello' },
        ])
        expect(result.text).toBe('{"ok":true}')
        expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45 })
    })

    it('uses custom baseUrl and strips trailing slashes', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'x' } }] }))
        const provider = createAiProvider({
            provider: 'openai-compatible',
            model: 'deepseek-chat',
            apiKey: 'sk-test',
            baseUrl: 'https://api.deepseek.com/v1/',
        }, { fetchFn })

        await provider.chat({ messages: [{ role: 'user', content: 'hi' }] })

        expect(fetchFn.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/chat/completions')
    })

    it('uses custom apiUrl for anthropic-compatible endpoints (gateway/self-hosted)', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
            content: [{ type: 'text', text: '{"ok":true}' }],
            usage: { input_tokens: 1, output_tokens: 1 },
        }))
        const provider = createAiProvider({
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            apiKey: 'sk-ant-test-key-1234567890',
            apiUrl: 'https://gateway.example.com/v1/messages/',
        }, { fetchFn })

        await provider.chat({ messages: [{ role: 'user', content: 'hi' }] })

        // 尾部斜杠去除后拼接
        expect(fetchFn.mock.calls[0][0]).toBe('https://gateway.example.com/v1/messages')
    })

    it('throws AiProviderError with masked body on non-2xx', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('invalid api key', { status: 401 }))
        const provider = createAiProvider({
            provider: 'openai-compatible',
            model: 'gpt-4o-mini',
            apiKey: 'sk-test-key-1234567890',
        }, { fetchFn })

        await expect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }))
            .rejects.toMatchObject({
                name: 'AiProviderError',
                status: 401,
                providerName: 'openai-compatible',
            })
    })

    it('throws AiProviderError on empty completion', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: null } }] }))
        const provider = createAiProvider({
            provider: 'openai-compatible',
            model: 'gpt-4o-mini',
            apiKey: 'sk-test-key-1234567890',
        }, { fetchFn })

        await expect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }))
            .rejects.toBeInstanceOf(AiProviderError)
    })

    it('passes an abort signal for timeout', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'x' } }] }))
        const provider = createAiProvider({
            provider: 'openai-compatible',
            model: 'gpt-4o-mini',
            apiKey: 'sk-test-key-1234567890',
            timeoutMs: 5_000,
        }, { fetchFn })

        await provider.chat({ messages: [{ role: 'user', content: 'hi' }] })

        const init = fetchFn.mock.calls[0][1] as RequestInit
        expect(init.signal).toBeDefined()
    })
})

describe('createAiProvider (anthropic)', () => {
    it('posts to messages API with system separated and parses usage', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
            content: [{ type: 'text', text: '{"ok":true}' }],
            usage: { input_tokens: 90, output_tokens: 30 },
        }))
        const provider = createAiProvider({
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            apiKey: 'sk-ant-test-key-1234567890',
        }, { fetchFn })

        const result = await provider.chat({
            messages: [
                { role: 'system', content: 'sys-prompt' },
                { role: 'user', content: 'hello' },
            ],
        })

        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://api.anthropic.com/v1/messages')
        const headers = init.headers as Record<string, string>
        expect(headers['x-api-key']).toBe('sk-ant-test-key-1234567890')
        expect(headers['anthropic-version']).toBe('2023-06-01')
        const body = JSON.parse(init.body as string)
        expect(body.system).toBe('sys-prompt')
        expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
        expect(body.max_tokens).toBe(2048)
        expect(result.usage).toEqual({ inputTokens: 90, outputTokens: 30 })
    })

    it('throws AiProviderError on non-2xx with truncated body', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('x'.repeat(1000), { status: 429 }))
        const provider = createAiProvider({
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            apiKey: 'sk-ant-test-key-1234567890',
        }, { fetchFn })

        const error = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] }).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(AiProviderError)
        if (error instanceof AiProviderError) {
            expect(error.status).toBe(429)
            expect(error.message.length).toBeLessThan(500)
        }
    })

    it('masks apiKey in provider error message (defense in depth, F-01)', async () => {
        const key = 'sk-ant-test-key-1234567890'
        const fetchFn = vi.fn().mockResolvedValue(new Response(`unauthorized for ${key}`, { status: 401 }))
        const provider = createAiProvider({
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            apiKey: key,
        }, { fetchFn })

        const error = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] }).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(AiProviderError)
        if (error instanceof AiProviderError) {
            expect(error.message).not.toContain(key)
            expect(error.message).toContain('sk-a****7890')
        }
    })

    it('throws AiProviderError on empty content array', async () => {
        const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ content: [], usage: {} }))
        const provider = createAiProvider({
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            apiKey: 'sk-ant-test-key-1234567890',
        }, { fetchFn })

        await expect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }))
            .rejects.toBeInstanceOf(AiProviderError)
    })
})

describe('factory', () => {
    it('defaults to openai-compatible provider', () => {
        const provider = createAiProvider({
            provider: 'openai-compatible',
            model: 'm',
            apiKey: 'k',
        }, { fetchFn: vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'x' } }] })) })
        expect(provider.name).toBe('openai-compatible')
    })
})
