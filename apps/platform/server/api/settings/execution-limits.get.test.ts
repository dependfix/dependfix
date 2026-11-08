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
        const result = await handler(makeEvent('GET', '/api/settings/execution-limits')) as Record<string, number>

        expect(result.executionTimeoutMs).toBeGreaterThan(0)
        expect(result.maxExecutionTimeoutMs).toBeGreaterThanOrEqual(result.executionTimeoutMs)
        expect(result.verifyCommandTimeoutMs).toBeGreaterThan(0)
        expect(result.installTimeoutMs).toBeGreaterThan(0)
        expect(result.cloneTimeoutMs).toBeGreaterThan(0)
        // 不返回 token / 路径等敏感字段
        expect(Object.keys(result).sort()).toEqual([
            'cloneTimeoutMs',
            'executionTimeoutMs',
            'installTimeoutMs',
            'maxExecutionTimeoutMs',
            'verifyCommandTimeoutMs',
        ])
    })
})
