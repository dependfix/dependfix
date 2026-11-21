import { describe, expect, it } from 'vitest'
import { classifyError, ExecutionTimeoutError, registryUnreachableResult } from './sandbox-errors'

describe('sandbox-errors', () => {
    it('外层超时带回已捕获输出尾部（adapter 卡死时可定位到步骤）', () => {
        const result = classifyError(
            new ExecutionTimeoutError(30_000),
            30_000,
            '2026-11-21T00:00:00.000Z',
            'cloning...\ninstalling...\n',
        )
        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_timeout')
        expect(result.error?.message).toContain('30000ms 上限')
        expect(result.error?.message).toContain('容器输出末尾')
        expect(result.error?.message).toContain('installing')
    })

    it('无尾部时保持原超时消息', () => {
        const result = classifyError(new ExecutionTimeoutError(1000), 1000, '2026-11-21T00:00:00.000Z')
        expect(result.error?.message).toBe('执行超时(1000ms 上限)')
    })

    it('预检失败结果含目标、errno 与耗时', () => {
        const result = registryUnreachableResult(
            { host: 'registry.npmjs.org', port: 443, code: 'ETIMEDOUT', durationMs: 5003 },
            undefined,
            '2026-11-21T00:00:00.000Z',
        )
        expect(result.error?.code).toBe('registry_unreachable')
        expect(result.error?.message).toContain('registry.npmjs.org:443')
        expect(result.error?.message).toContain('ETIMEDOUT')
        expect(result.error?.message).toContain('5003ms')
    })
})
