// 验证命令超时口径：默认链与 CI 镜像脚本共用同一超时，env 覆盖有界回退。
import { describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_COMMAND_TIMEOUT_MS,
    resolveCommandTimeoutMs,
    VERIFY_TIMEOUT_ENV,
} from './verification-runner'

describe('resolveCommandTimeoutMs', () => {
    it('默认 10 分钟；env 合法值覆盖（CI 镜像脚本与默认链同源）', () => {
        expect(resolveCommandTimeoutMs({})).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '120000' })).toBe(120_000)
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '10m' })).toBe(600_000)
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '90s' })).toBe(90_000)
    })

    it('非法 env 回退默认并告警（同一原值只告警一次）', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '10fortnights' })).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '10fortnights' })).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
        expect(spy).toHaveBeenCalledTimes(1)
        expect(String(spy.mock.calls[0]?.[0])).toContain(VERIFY_TIMEOUT_ENV)
        spy.mockRestore()
    })

    it('越界 / 非整数回退默认（不中断运行）', () => {
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '1' })).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '999999999' })).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: 'abc' })).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
        // 带单位解析：尾随非单位字符解析失败 → 回退默认
        expect(resolveCommandTimeoutMs({ [VERIFY_TIMEOUT_ENV]: '120000abc' })).toBe(DEFAULT_COMMAND_TIMEOUT_MS)
    })
})
