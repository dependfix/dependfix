// AI token 用量聚合与成本估算（成本默认关闭背景下，消耗可见性是核心诉求；
// 单价表为公开定价推算值，标注"估算仅供参考"）。

export interface AiUsage {
    /** 调用次数 */
    calls: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    /** 估算成本（USD）；模型无单价数据时为 undefined */
    estimatedCostUsd?: number
}

/** 每百万 token 单价（USD，公开定价推算；DeepSeek 为官方价格，其余为常见模型价） */
export const MODEL_PRICE_TABLE: Record<string, { inputPerM: number, outputPerM: number }> = {
    'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
    'gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
    'deepseek-chat': { inputPerM: 0.27, outputPerM: 1.1 },
    'deepseek-reasoner': { inputPerM: 0.55, outputPerM: 2.19 },
    'claude-3-5-haiku': { inputPerM: 0.8, outputPerM: 4 },
    'claude-3-5-sonnet': { inputPerM: 3, outputPerM: 15 },
}

/**
 * 估算单次调用成本（USD）。
 * 模型不在单价表返回 undefined（不估算，避免误导）。
 */
export function estimateCostUsd(
    model: string,
    inputTokens: number,
    outputTokens: number,
): number | undefined {
    const price = MODEL_PRICE_TABLE[model]
    if (!price) {
        return undefined
    }
    return (inputTokens / 1_000_000) * price.inputPerM + (outputTokens / 1_000_000) * price.outputPerM
}

/** 聚合多次 AI 调用的 token 消耗（run 级）。 */
export class AiUsageTracker {
    private calls = 0
    private inputTokens = 0
    private outputTokens = 0
    private costUsd: number | undefined
    private readonly model: string

    constructor(model: string) {
        this.model = model
    }

    /**
     * 记录一次**成功**调用（provider.chat 正常返回）的 token 消耗。
     * 失败调用（HTTP 错误/网络/超时）不计入——失败路径的 token 计费
     * 无法从 provider 响应获得，属于已知盲区（见 AssessResult 文档）。
     */
    record(inputTokens: number, outputTokens: number): void {
        this.calls += 1
        this.inputTokens += inputTokens
        this.outputTokens += outputTokens
        const cost = estimateCostUsd(this.model, inputTokens, outputTokens)
        this.costUsd = cost === undefined ? this.costUsd : (this.costUsd ?? 0) + cost
    }

    snapshot(): AiUsage {
        return {
            calls: this.calls,
            inputTokens: this.inputTokens,
            outputTokens: this.outputTokens,
            totalTokens: this.inputTokens + this.outputTokens,
            estimatedCostUsd: this.costUsd,
        }
    }
}
