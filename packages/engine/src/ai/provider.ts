// AI 提供商抽象：OpenAI 兼容端点优先（DeepSeek 等指定 baseURL 兼容），
// 同时支持 Anthropic。轻量 fetch 封装，不引入 SDK。

import { maskSecrets } from './secrets'

export interface AiConfig {
    /** 提供商类型：openai-compatible（默认）/ anthropic */
    provider: 'openai-compatible' | 'anthropic'
    /** 模型名（如 gpt-4o-mini / deepseek-chat / claude-3-5-haiku） */
    model: string
    /** API Key（仅运行时持有，不落盘不进报告，见 secrets.ts 脱敏） */
    apiKey: string
    /**
     * OpenAI 兼容端点基地址（默认 `https://api.deepseek.com`，与默认模型
     * deepseek-v4-flash 配套；DeepSeek 官方 OpenAI 兼容端点）。
     * 使用 OpenAI 官方模型时显式指定 `https://api.openai.com/v1`。
     */
    baseUrl?: string
    /**
     * Anthropic 兼容端点（仅 provider=anthropic 生效；
     * 默认 `https://api.anthropic.com/v1/messages`）。
     * 自托管 / 网关等 anthropic 格式兼容端点可显式指定。
     */
    apiUrl?: string
    /** 单次调用最大输出 token（默认 2048） */
    maxTokens?: number
    /** 请求超时毫秒（默认 60000） */
    timeoutMs?: number
    /** 采样温度（默认 0.2，研判偏确定性） */
    temperature?: number
}

export interface AiChatMessage {
    role: 'system' | 'user'
    content: string
}

export interface AiChatParams {
    messages: AiChatMessage[]
    maxTokens?: number
    temperature?: number
    signal?: AbortSignal
}

export interface AiChatUsage {
    inputTokens: number
    outputTokens: number
}

export interface AiChatResult {
    text: string
    usage: AiChatUsage
}

export interface AiProvider {
    readonly name: string
    chat(params: AiChatParams): Promise<AiChatResult>
}

/**
 * AI 调用失败（HTTP 非 2xx / 网络错误）。
 * message 已在本层脱敏（maskSecrets，不含 apiKey）——防御纵深，
 * 调用方即使绕过编排层直接使用 provider 也不会泄露凭据。
 */
export class AiProviderError extends Error {
    constructor(
        message: string,
        public readonly status: number | null,
        public readonly providerName: string,
    ) {
        super(message)
        this.name = 'AiProviderError'
    }
}

export interface CreateAiProviderOptions {
    /** 注入请求函数（默认全局 fetch；测试用 vi.fn） */
    fetchFn?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_TOKENS = 2048
const DEFAULT_TEMPERATURE = 0.2

export function createAiProvider(
    config: AiConfig,
    options: CreateAiProviderOptions = {},
): AiProvider {
    const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS
    const temperature = config.temperature ?? DEFAULT_TEMPERATURE

    if (config.provider === 'anthropic') {
        return new AnthropicProvider(config, { fetchFn, timeoutMs, maxTokens, temperature })
    }
    return new OpenAICompatibleProvider(config, { fetchFn, timeoutMs, maxTokens, temperature })
}

// ---------------------------------------------------------------------------
// OpenAI 兼容实现（/chat/completions；DeepSeek / 通义 / OpenAI 均此协议）
// ---------------------------------------------------------------------------

class OpenAICompatibleProvider implements AiProvider {
    readonly name: string
    private readonly baseUrl: string

    constructor(
        private readonly config: AiConfig,
        private readonly opts: { fetchFn: typeof fetch, timeoutMs: number, maxTokens: number, temperature: number },
    ) {
        this.name = 'openai-compatible'
        this.baseUrl = (config.baseUrl ?? 'https://api.deepseek.com').replace(/\/+$/, '')
    }

    async chat(params: AiChatParams): Promise<AiChatResult> {
        const res = await this.opts.fetchFn(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: params.messages,
                max_tokens: params.maxTokens ?? this.opts.maxTokens,
                temperature: params.temperature ?? this.opts.temperature,
            }),
            signal: params.signal ?? AbortSignal.timeout(this.opts.timeoutMs),
        })

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const masked = maskSecrets(body, [this.config.apiKey])
            throw new AiProviderError(
                `AI provider returned HTTP ${res.status}${masked ? `: ${truncate(masked, 300)}` : ''}`,
                res.status,
                this.name,
            )
        }

        const json = await res.json() as {
            choices?: Array<{ message?: { content?: string | null } }>
            usage?: { prompt_tokens?: number, completion_tokens?: number }
        }
        const text = json.choices?.[0]?.message?.content
        if (typeof text !== 'string' || !text.trim()) {
            throw new AiProviderError('AI provider returned empty completion', res.status, this.name)
        }
        return {
            text,
            usage: {
                inputTokens: json.usage?.prompt_tokens ?? 0,
                outputTokens: json.usage?.completion_tokens ?? 0,
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Anthropic 实现（/v1/messages）
// ---------------------------------------------------------------------------

class AnthropicProvider implements AiProvider {
    readonly name = 'anthropic'
    private readonly apiUrl: string

    constructor(
        private readonly config: AiConfig,
        private readonly opts: { fetchFn: typeof fetch, timeoutMs: number, maxTokens: number, temperature: number },
    ) {
        this.apiUrl = (config.apiUrl ?? 'https://api.anthropic.com/v1/messages').replace(/\/+$/, '')
    }

    async chat(params: AiChatParams): Promise<AiChatResult> {
        // Anthropic messages API：system 独立字段，messages 仅 user/assistant
        const system = params.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
        const messages = params.messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }))

        const res = await this.opts.fetchFn(this.apiUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: this.config.model,
                system: system || undefined,
                messages,
                max_tokens: params.maxTokens ?? this.opts.maxTokens,
                temperature: params.temperature ?? this.opts.temperature,
            }),
            signal: params.signal ?? AbortSignal.timeout(this.opts.timeoutMs),
        })

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const masked = maskSecrets(body, [this.config.apiKey])
            throw new AiProviderError(
                `AI provider returned HTTP ${res.status}${masked ? `: ${truncate(masked, 300)}` : ''}`,
                res.status,
                this.name,
            )
        }

        const json = await res.json() as {
            content?: Array<{ type?: string, text?: string }>
            usage?: { input_tokens?: number, output_tokens?: number }
        }
        const text = json.content?.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
        if (!text?.trim()) {
            throw new AiProviderError('AI provider returned empty completion', res.status, this.name)
        }
        return {
            text,
            usage: {
                inputTokens: json.usage?.input_tokens ?? 0,
                outputTokens: json.usage?.output_tokens ?? 0,
            },
        }
    }
}

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text
}
