// execution-limits.get.test.ts — 执行预算只读端点的返回契约。
//
// 用途：仓库表单「继承全局」占位与设置页只读卡片只消费该端点，禁止前端硬编码默认值。
import { describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../../../tests/api-helper'
import handler from './execution-limits.get'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

describe('GET /api/settings/execution-limits', () => {
    it('返回解析后的全局生效值与封顶值', async () => {
        const result = await handler(makeEvent('GET', '/api/settings/execution-limits')) as {
            executionTimeoutMs: number
            maxExecutionTimeoutMs: number
            verifyCommandTimeoutMs: number
            installTimeoutMs: number
            cloneTimeoutMs: number
            bounds: {
                execution: { minMs: number, maxMs: number }
                verifyCommand: { minMs: number, maxMs: number }
                install: { minMs: number, maxMs: number }
                clone: { minMs: number, maxMs: number }
            }
        }

        expect(result.executionTimeoutMs).toBeGreaterThan(0)
        expect(result.maxExecutionTimeoutMs).toBeGreaterThanOrEqual(result.executionTimeoutMs)
        expect(result.verifyCommandTimeoutMs).toBeGreaterThan(0)
        expect(result.installTimeoutMs).toBeGreaterThan(0)
        expect(result.cloneTimeoutMs).toBeGreaterThan(0)
        // 不返回 token / 路径等敏感字段
        expect(Object.keys(result).sort()).toEqual([
            'bounds',
            'cloneTimeoutMs',
            'executionTimeoutMs',
            'installTimeoutMs',
            'maxExecutionTimeoutMs',
            'verifyCommandTimeoutMs',
        ])
        // 客户端提示 / 校验边界：min <= 当前生效值 <= max，执行上限以运行期封顶为 max
        expect(Object.keys(result.bounds).sort()).toEqual(['clone', 'execution', 'install', 'verifyCommand'])
        for (const bounds of Object.values(result.bounds)) {
            expect(bounds.minMs).toBeGreaterThan(0)
            expect(bounds.maxMs).toBeGreaterThanOrEqual(bounds.minMs)
        }
        expect(result.bounds.execution.maxMs).toBe(result.maxExecutionTimeoutMs)
        expect(result.bounds.execution.minMs).toBeLessThanOrEqual(result.executionTimeoutMs)
    })
})
