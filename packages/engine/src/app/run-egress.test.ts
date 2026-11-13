import { describe, expect, it } from 'vitest'
import type { FixError, RunResult } from '@dependfix/core'
import { attachRunEgressResult } from './run-egress'

const baseResult = () => ({
    summary: { alertsFound: 0, alertsFixable: 0, alertsFixed: 0, alertsFailed: 0, repositoriesScanned: 0 },
} as unknown as RunResult)

const violation = {
    time: '2026-11-13T00:00:00.000Z',
    source: 'proxy' as const,
    method: 'CONNECT',
    target: 'https://evil.example.com/exfil?token=secret',
    violation: true,
}

describe('attachRunEgressResult', () => {
    it('does nothing when there is no audit entry', () => {
        const result = baseResult()
        const errors: FixError[] = []
        expect(attachRunEgressResult(result, undefined, errors)).toBe(false)
        expect(attachRunEgressResult(result, { entries: [], violations: [] }, errors)).toBe(false)
        expect(result.networkAudit).toBeUndefined()
        expect(errors).toHaveLength(0)
    })

    it('records entries, counts and a redacted violation error', () => {
        const result = baseResult()
        const errors: FixError[] = []
        const snapshot = { entries: [violation], violations: [violation] }

        expect(attachRunEgressResult(result, snapshot, errors)).toBe(true)
        expect(result.networkAudit).toHaveLength(1)
        expect(result.networkViolations).toHaveLength(1)
        expect(result.summary.networkViolations).toBe(1)
        expect(result.summary.networkAudited).toBe(1)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({ repository: '*', stage: 'verify', category: 'NETWORK_VIOLATION' })
        // 消息里只留最小化目标（查询串与凭据不落错误面）
        expect(errors[0].message).toContain('evil.example.com')
        expect(errors[0].message).not.toContain('token=secret')
    })

    it('records audited entries without an error when nothing was blocked', () => {
        const result = baseResult()
        const errors: FixError[] = []
        const allowed = { ...violation, target: 'https://registry.npmjs.org/x', violation: undefined }

        expect(attachRunEgressResult(result, { entries: [allowed], violations: [] }, errors)).toBe(false)
        expect(result.summary.networkAudited).toBe(1)
        expect(result.summary.networkViolations).toBe(0)
        expect(errors).toHaveLength(0)
    })
})
