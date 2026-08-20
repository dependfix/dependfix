// merge-ai-usage.test.ts — run 级 AI 用量聚合（mergeAiUsage）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { describe, expect, it } from 'vitest'
import { mergeAiUsage } from './helpers'

describe('mergeAiUsage', () => {
    it('returns undefined when single call has no usage', () => {
        expect(mergeAiUsage(undefined, undefined)).toBeUndefined()
        expect(mergeAiUsage(undefined, { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 })).toBeUndefined()
    })

    it('accumulates calls and tokens', () => {
        const agg = mergeAiUsage(
            { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0001 },
            { calls: 2, inputTokens: 300, outputTokens: 60, totalTokens: 360, estimatedCostUsd: 0.0003 },
        )
        // 浮点累加误差（0.0001 + 0.0003）用近似断言；其余字段用 toMatchObject（cost 单独断言）
        expect(agg).toMatchObject({
            calls: 3,
            inputTokens: 400,
            outputTokens: 100,
            totalTokens: 500,
        })
        expect(agg?.estimatedCostUsd).toBeCloseTo(0.0004, 6)
    })

    it('takes cost from the first call when aggregate starts empty', () => {
        const agg = mergeAiUsage(
            undefined,
            { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0003 },
        )
        expect(agg?.estimatedCostUsd).toBeCloseTo(0.0003, 6)
    })

    it('preserves aggregate when new usage is undefined', () => {
        const agg = { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0001 }
        expect(mergeAiUsage(agg, undefined)).toBe(agg)
    })

    it('drops cost to undefined when either side lacks price data', () => {
        const noCost = { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: undefined }
        const withCost = { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0001 }
        expect(mergeAiUsage(noCost, withCost)?.estimatedCostUsd).toBeUndefined()
        expect(mergeAiUsage(withCost, noCost)?.estimatedCostUsd).toBeUndefined()
    })
})
