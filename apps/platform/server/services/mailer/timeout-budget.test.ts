import { describe, expect, it } from 'vitest'
import { checkSmtpTimeoutBudget } from './timeout-budget'

/** SMTP socket 超时与周报检查节拍的关系断言：正常 / 边界 / 违规三向。 */
describe('checkSmtpTimeoutBudget', () => {
    it('socket 超时小于节拍 → ok，说明含两值', () => {
        const result = checkSmtpTimeoutBudget({ socketTimeoutMs: 120_000, checkIntervalMs: 900_000 })
        expect(result.ok).toBe(true)
        expect(result.message).toContain('120000')
        expect(result.message).toContain('900000')
    })

    it('相等（边界）→ 违规（必须严格小于）', () => {
        const result = checkSmtpTimeoutBudget({ socketTimeoutMs: 900_000, checkIntervalMs: 900_000 })
        expect(result.ok).toBe(false)
        expect(result.message).toContain('900000')
    })

    it('大于节拍 → 违规并说明停摆风险', () => {
        const result = checkSmtpTimeoutBudget({ socketTimeoutMs: 1_800_000, checkIntervalMs: 900_000 })
        expect(result.ok).toBe(false)
        expect(result.message).toContain('1800000')
        expect(result.message).toContain('900000')
        expect(result.message).toContain('跨过检查节拍')
    })
})
