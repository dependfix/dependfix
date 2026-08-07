// AI 研判编排：上下文构建 → provider 调用 → schema 校验（失败重试一次）
// → 降级建议模式。所有日志/错误经 maskSecrets 脱敏（凭据不泄露）。

import { createAiProvider, AiProviderError, type AiChatResult, type AiConfig } from './provider'
import { parseAssessment, type AiAssessment } from './schema'
import { ASSESSMENT_SYSTEM_PROMPT, buildAssessmentContext, type AssessmentContextInput } from './prompt'
import { AiUsageTracker, type AiUsage } from './usage'
import { maskSecrets } from './secrets'

export interface AssessResult {
    /** 结构化研判（降级时为 null，走建议模式） */
    assessment: AiAssessment | null
    /**
     * 聚合用量（仅计**成功**调用——provider 失败路径无 usage 响应，
     * 失败调用的 token 消耗不可见，属已知盲区）
     */
    usage: AiUsage
    /** 是否降级（schema 校验失败重试后仍失败 / provider 异常） */
    degraded: boolean
    /** 降级原因（脱敏后的错误消息；成功时为 undefined） */
    error?: string
}

export interface AssessOptions {
    config: AiConfig
    context: AssessmentContextInput
    /** 注入请求函数（默认全局 fetch；测试用 vi.fn） */
    fetchFn?: typeof fetch
    /** schema 校验失败重试次数（默认 1；provider 异常不重试） */
    schemaRetries?: number
}

const DEFAULT_SCHEMA_RETRIES = 1

/**
 * 执行一次 breaking change 研判。
 *
 * 流程：
 * 1. buildAssessmentContext（数据注入，不拼接用户指令）
 * 2. provider.chat（system 硬编码 + user 上下文）
 * 3. parseAssessment：成功 → 返回；schema 失败 → 重试（附带解析错误提示）→ 仍失败降级
 * 4. provider 异常（HTTP/网络/空完成）→ 直接降级（不重试，避免重复计费）
 *
 * 降级语义：调用方走建议模式（报告输出人工建议），不静默、可审计。
 */
export async function assessBreakingChange(options: AssessOptions): Promise<AssessResult> {
    const { config, context, fetchFn, schemaRetries = DEFAULT_SCHEMA_RETRIES } = options
    const tracker = new AiUsageTracker(config.model)
    const provider = createAiProvider(config, { fetchFn })
    const secrets = [config.apiKey]

    const system = ASSESSMENT_SYSTEM_PROMPT
    const userMessage = buildAssessmentContext(context)

    let lastError: string | undefined
    for (let attempt = 0; attempt <= schemaRetries; attempt += 1) {
        let result: AiChatResult
        try {
            const messages = [
                { role: 'system' as const, content: system },
                { role: 'user' as const, content: attempt === 0 ? userMessage : `${userMessage}\n\n上次输出未通过 JSON schema 校验：${lastError ?? 'unknown'}\n请重新输出严格符合要求的 JSON。` },
            ]
            result = await provider.chat({ messages })
        } catch (error: unknown) {
            const message = maskSecrets(
                error instanceof Error ? error.message : String(error),
                secrets,
            )
            if (error instanceof AiProviderError) {
                return { assessment: null, usage: tracker.snapshot(), degraded: true, error: `AI provider error (${error.providerName}, HTTP ${error.status ?? '?'}): ${message}` }
            }
            return { assessment: null, usage: tracker.snapshot(), degraded: true, error: `AI call failed: ${message}` }
        }

        tracker.record(result.usage.inputTokens, result.usage.outputTokens)

        const parsed = parseAssessment(result.text)
        // 注意：zod infer 深类型可能导致 boolean discriminant 收窄退化，
        // 用 in 收窄更鲁棒
        if ('error' in parsed) {
            lastError = parsed.error
            continue
        }
        return { assessment: parsed.value, usage: tracker.snapshot(), degraded: false }
    }

    return {
        assessment: null,
        usage: tracker.snapshot(),
        degraded: true,
        error: `AI output failed schema validation after ${schemaRetries + 1} attempt(s): ${lastError ?? 'unknown'}`,
    }
}

export { maskSecrets } from './secrets'
export { estimateCostUsd, AiUsageTracker, type AiUsage } from './usage'
export type { AiAssessment, AiFileChange, AiReplaceBlock } from './schema'
export type { AiConfig, AiChatResult } from './provider'
export type { AssessmentContextInput } from './prompt'
