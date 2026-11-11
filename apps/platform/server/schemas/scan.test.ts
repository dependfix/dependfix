import { describe, expect, it } from 'vitest'
import { scanRequestSchema } from './scan'

/**
 * 扫描请求 schema 定向测试。
 *
 * 2026-11-09 起 sandbox 入口恢复：report-only 真实执行，fix / fix-and-pr 由编排层
 * 降级 container 并记 `sandbox_fix_requires_egress_policy`；schema 层不按模式拒绝。
 */
describe('scan request schema', () => {
    it('sandbox 执行器可写入（report-only 与 fix 均通过 schema）', () => {
        expect(scanRequestSchema.safeParse({ executorKind: 'sandbox' }).success).toBe(true)
        expect(scanRequestSchema.safeParse({ executorKind: 'sandbox', mode: 'fix' }).success).toBe(true)
    })

    it('container / github-action / 缺省仍通过', () => {
        expect(scanRequestSchema.safeParse({ executorKind: 'container' }).success).toBe(true)
        expect(scanRequestSchema.safeParse({ executorKind: 'github-action' }).success).toBe(true)
        expect(scanRequestSchema.safeParse({}).success).toBe(true)
    })
})
