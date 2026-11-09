// execution-limits.test.ts — 仓库级执行预算与超时的解析口径。
//
// 口径来源：[repo-execution-limits.md](../../../../docs/design/governance/repo-execution-limits.md) §5
// 优先级 = 仓库值 > env > 内置默认；执行上限另受平台封顶约束；子项不得超过执行上限。
import { describe, expect, it } from 'vitest'
import {
    DEFAULT_COMMAND_TIMEOUT_MS,
    DEFAULT_EXECUTION_TIMEOUT_MS,
    DEFAULT_INSTALL_TIMEOUT_MS,
    DEFAULT_MAX_EXECUTION_TIMEOUT_MS,
    MAX_MAX_EXECUTION_TIMEOUT_MS,
    MIN_EXECUTION_TIMEOUT_MS,
    resolveExecutionCeilingMs,
    resolveExecutionLimits,
} from './execution-limits'

describe('resolveExecutionCeilingMs', () => {
    it('returns the default ceiling when unset', () => {
        expect(resolveExecutionCeilingMs({})).toBe(DEFAULT_MAX_EXECUTION_TIMEOUT_MS)
    })

    it('accepts an in-range ceiling', () => {
        expect(resolveExecutionCeilingMs({ DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS: '7200000' })).toBe(7_200_000)
    })

    it('accepts duration units for the ceiling', () => {
        expect(resolveExecutionCeilingMs({ DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS: '2h' })).toBe(7_200_000)
        expect(resolveExecutionCeilingMs({ DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS: '90m' })).toBe(5_400_000)
    })

    it('falls back to the default for out-of-range or invalid values', () => {
        expect(resolveExecutionCeilingMs({ DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS: '60000' })).toBe(DEFAULT_MAX_EXECUTION_TIMEOUT_MS)
        expect(resolveExecutionCeilingMs({ DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS: String(MAX_MAX_EXECUTION_TIMEOUT_MS + 1) }))
            .toBe(DEFAULT_MAX_EXECUTION_TIMEOUT_MS)
        expect(resolveExecutionCeilingMs({ DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS: 'bogus' })).toBe(DEFAULT_MAX_EXECUTION_TIMEOUT_MS)
    })
})

describe('resolveExecutionLimits', () => {
    it('inherits global defaults when the repository has no overrides', () => {
        const resolved = resolveExecutionLimits({}, {})

        expect(resolved.executionTimeoutMs).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
        expect(resolved.verifyCommandTimeoutMs).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
        expect(resolved.installTimeoutMs).toBe(DEFAULT_INSTALL_TIMEOUT_MS)
        expect(resolved.ceilingMs).toBe(DEFAULT_MAX_EXECUTION_TIMEOUT_MS)
        expect(resolved.warnings).toEqual([])
    })

    it('prefers repository values over env', () => {
        const resolved = resolveExecutionLimits(
            { executionTimeoutMs: 2_700_000, verifyCommandTimeoutMs: 1_200_000 },
            { EXECUTION_TIMEOUT_MS: '900000', DEPENDFIX_VERIFY_TIMEOUT_MS: '300000' },
        )

        expect(resolved.executionTimeoutMs).toBe(2_700_000)
        expect(resolved.verifyCommandTimeoutMs).toBe(1_200_000)
    })

    it('clamps a repository value to the platform ceiling and reports a warning', () => {
        const resolved = resolveExecutionLimits(
            { executionTimeoutMs: 7_200_000 },
            { DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS: '3600000' },
        )

        expect(resolved.executionTimeoutMs).toBe(3_600_000)
        expect(resolved.warnings.join('\n')).toContain('executionTimeoutMs')
    })

    it('clamps child timeouts to the effective execution limit', () => {
        const resolved = resolveExecutionLimits(
            { executionTimeoutMs: 120_000, verifyCommandTimeoutMs: 600_000 },
            {},
        )

        expect(resolved.executionTimeoutMs).toBe(120_000)
        expect(resolved.verifyCommandTimeoutMs).toBeLessThanOrEqual(120_000)
        expect(resolved.warnings.join('\n')).toContain('verifyCommandTimeoutMs')
    })

    it('accepts duration units for duration env vars', () => {
        const resolved = resolveExecutionLimits({}, {
            EXECUTION_TIMEOUT_MS: '45m',
            DEPENDFIX_VERIFY_TIMEOUT_MS: '90s',
            DEPENDFIX_INSTALL_TIMEOUT_MS: '10m',
        })

        expect(resolved.executionTimeoutMs).toBe(45 * 60_000)
        expect(resolved.verifyCommandTimeoutMs).toBe(90_000)
        expect(resolved.installTimeoutMs).toBe(10 * 60_000)
    })

    it('keeps the execution floor at one minute', () => {
        const resolved = resolveExecutionLimits({ executionTimeoutMs: 1_000 }, {})
        expect(resolved.executionTimeoutMs).toBe(MIN_EXECUTION_TIMEOUT_MS)
    })
})
