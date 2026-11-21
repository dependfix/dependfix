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

const injected = { entries: [] as typeof violation[], violations: [] as typeof violation[], injection: 'injected' as const }

describe('attachRunEgressResult', () => {
    it('records the injection status even when there is no audit entry', () => {
        const result = baseResult()
        const errors: FixError[] = []
        expect(attachRunEgressResult(result, undefined, errors)).toBe(false)
        // 未经过审计初始化 → unavailable（不得沉默：未拦截 ≠ 无外联）
        expect(result.networkAuditInjection).toEqual({ status: 'unavailable' })
        expect(result.summary.networkAuditInjection).toBe('unavailable')

        expect(attachRunEgressResult(result, { entries: [], violations: [], injection: 'existing-proxy' }, errors)).toBe(false)
        expect(result.networkAuditInjection?.status).toBe('existing-proxy')
        expect(result.summary.networkAuditInjection).toBe('existing-proxy')
        expect(result.networkAudit).toBeUndefined()
        expect(errors).toHaveLength(0)
    })

    it('records entries, counts and a redacted violation error', () => {
        const result = baseResult()
        const errors: FixError[] = []
        const snapshot = { entries: [violation], violations: [violation], injection: 'injected' as const }

        expect(attachRunEgressResult(result, snapshot, errors)).toBe(true)
        expect(result.networkAudit).toHaveLength(1)
        expect(result.networkViolations).toHaveLength(1)
        expect(result.summary.networkViolations).toBe(1)
        expect(result.summary.networkAudited).toBe(1)
        expect(result.networkAuditInjection).toEqual({ status: 'injected' })
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

        expect(attachRunEgressResult(result, { ...injected, entries: [allowed] }, errors)).toBe(false)
        expect(result.summary.networkAudited).toBe(1)
        expect(result.summary.networkViolations).toBe(0)
        expect(errors).toHaveLength(0)
    })
})
