import { describe, expect, it } from 'vitest'
import {
    formatRegistryProbeFailure,
    parseRegistryProbeFailure,
    REGISTRY_PROBE_DEFAULT_TIMEOUT_MS,
    resolveRegistryProbeTimeoutMs,
} from './registry-probe'

describe('registry-probe 契约', () => {
    it('失败信息编码后可原样解析', () => {
        const line = formatRegistryProbeFailure({ host: 'registry.npmjs.org', port: 443, code: 'ETIMEDOUT', durationMs: 5003 })
        expect(line).toContain('__DEPENDFIX_REGISTRY_PROBE_FAILED__')
        expect(parseRegistryProbeFailure(`logs...\n${line}\ntail`)).toEqual({
            host: 'registry.npmjs.org',
            port: 443,
            code: 'ETIMEDOUT',
            durationMs: 5003,
        })
    })

    it('无哨兵 / 形态不符时返回 undefined', () => {
        expect(parseRegistryProbeFailure('')).toBeUndefined()
        expect(parseRegistryProbeFailure('__DEPENDFIX_REGISTRY_PROBE_FAILED__ broken')).toBeUndefined()
    })

    it('预检超时解析：默认 5s，越界 / 非法回退', () => {
        expect(resolveRegistryProbeTimeoutMs(undefined)).toBe(REGISTRY_PROBE_DEFAULT_TIMEOUT_MS)
        expect(resolveRegistryProbeTimeoutMs('2500')).toBe(2500)
        expect(resolveRegistryProbeTimeoutMs('999')).toBe(REGISTRY_PROBE_DEFAULT_TIMEOUT_MS)
        expect(resolveRegistryProbeTimeoutMs('60000')).toBe(REGISTRY_PROBE_DEFAULT_TIMEOUT_MS)
        expect(resolveRegistryProbeTimeoutMs('abc')).toBe(REGISTRY_PROBE_DEFAULT_TIMEOUT_MS)
    })
})
