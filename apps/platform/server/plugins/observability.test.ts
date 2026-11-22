import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * observability 插件单测：Nitro error 钩子 → 生命周期异常上报（含 route / method / statusCode）
 * 与 worker 角色跳过（HTTP-only）。冲刷统一挪到两进程共用的 logger 插件。
 */
const { captureErrorMock, shouldSkipMock, infoMock, warnMock } = vi.hoisted(() => ({
    captureErrorMock: vi.fn(),
    shouldSkipMock: vi.fn(() => false),
    infoMock: vi.fn(),
    warnMock: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
    defineNitroPlugin: (fn: unknown) => fn,
}))

vi.mock('#server/utils/observability', () => ({
    captureLifecycleError: captureErrorMock,
}))

vi.mock('#server/utils/process-role', () => ({
    shouldSkipHttpOnlyPlugin: shouldSkipMock,
}))

vi.mock('#server/utils/logger', () => ({
    logger: { info: infoMock, warn: warnMock, error: vi.fn(), debug: vi.fn() },
}))

import observabilityPlugin from './observability'

const hooks: Record<string, (...args: unknown[]) => unknown> = {}

const makeNitroApp = () => ({
    hooks: {
        hook: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
            hooks[name] = handler
        }),
    },
})

const runPlugin = (): void => {
    ;(observabilityPlugin as unknown as (app: unknown) => void)(makeNitroApp())
}

afterEach(() => {
    vi.clearAllMocks()
    shouldSkipMock.mockReturnValue(false)
    for (const key of Object.keys(hooks)) {
        delete hooks[key]
    }
})

describe('observability 插件', () => {
    it('error 钩子上报 route / method / statusCode', () => {
        runPlugin()
        const error = Object.assign(new Error('boom'), { statusCode: 503 })
        hooks.error!(error, { event: { path: '/api/runs', method: 'POST' } })

        expect(captureErrorMock).toHaveBeenCalledTimes(1)
        expect(captureErrorMock).toHaveBeenCalledWith(error, {
            source: 'http',
            route: '/api/runs',
            method: 'POST',
            statusCode: 503,
        })
    })

    it('缺少 event / 状态码时降级 unknown 与 500', () => {
        runPlugin()
        hooks.error!(new Error('boom'), {})
        expect(captureErrorMock).toHaveBeenCalledWith(expect.any(Error), {
            source: 'http',
            route: 'unknown',
            method: 'unknown',
            statusCode: 500,
        })
    })

    it('status 字段（替代 statusCode）同样被识别', () => {
        runPlugin()
        const error = Object.assign(new Error('bad gateway'), { status: 502 })
        hooks.error!(error, { event: { path: '/api/x', method: 'GET' } })
        expect(captureErrorMock.mock.calls[0]![1]).toMatchObject({ statusCode: 502 })
    })

    it('worker 角色：跳过插件（不注册任何钩子）', () => {
        shouldSkipMock.mockReturnValue(true)
        runPlugin()
        expect(captureErrorMock).not.toHaveBeenCalled()
        expect(hooks.error).toBeUndefined()
    })
})
