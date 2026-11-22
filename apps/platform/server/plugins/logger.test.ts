import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * logger 插件单测：启动行 + 致命错误钩子安装 + close 钩子卸载 / 关闭文件流。
 * logger 与 process-log 均 mock（真实文件落盘见 utils/logger.files.test.ts）。
 */
const { infoMock, uninstallMock, closeMock, installSpy, captureEventMock, flushMock } = vi.hoisted(() => ({
    infoMock: vi.fn(),
    uninstallMock: vi.fn(),
    closeMock: vi.fn(),
    installSpy: vi.fn(),
    captureEventMock: vi.fn(),
    flushMock: vi.fn(async () => true),
}))

vi.mock('nitropack/runtime', () => ({
    defineNitroPlugin: (fn: unknown) => fn,
}))

vi.mock('#server/utils/logger', () => ({
    logger: { debug: vi.fn(), info: infoMock, warn: vi.fn(), error: vi.fn() },
    getLoggerState: () => ({ env: { LOG_LEVEL: 'info', PROCESS_ROLE: 'server' }, logDir: '/app/data/logs', fileLogging: true }),
    formatLogStartupLine: () => '[logger] files=/app/data/logs level=info role=server',
    getWinstonLogger: () => ({ close: closeMock }),
}))

vi.mock('#server/utils/observability', () => ({
    captureLifecycleEvent: captureEventMock,
    flushObservability: flushMock,
}))

vi.mock('#server/utils/process-log', () => ({
    installProcessErrorHandlers: () => {
        installSpy()
        return uninstallMock
    },
}))

import loggerPlugin from './logger'

const makeNitroApp = () => ({ hooks: { hook: vi.fn() } })

const runPlugin = (): ReturnType<typeof makeNitroApp> => {
    const nitroApp = makeNitroApp()
    ;(loggerPlugin as unknown as (app: unknown) => void)(nitroApp)
    return nitroApp
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('logger 插件', () => {
    it('安装致命错误钩子并打印启动行', () => {
        runPlugin()
        expect(installSpy).toHaveBeenCalledTimes(1)
        expect(infoMock).toHaveBeenCalledWith('[logger] files=/app/data/logs level=info role=server')
        expect(captureEventMock).toHaveBeenCalledWith('platform_started', 'info', expect.any(Object))
    })

    it('close 钩子卸载钩子、关闭文件流并冲刷可观测性事件', async () => {
        const nitroApp = runPlugin()
        expect(nitroApp.hooks.hook).toHaveBeenCalledWith('close', expect.any(Function))

        const closeHandler = nitroApp.hooks.hook.mock.calls[0]![1] as () => Promise<void>
        await closeHandler()

        expect(uninstallMock).toHaveBeenCalledTimes(1)
        expect(closeMock).toHaveBeenCalledTimes(1)
        expect(flushMock).toHaveBeenCalledWith(2000)
    })

    it('close 钩子等待可观测性冲刷完成（不是 fire-and-forget）', async () => {
        let finishFlush: ((value: boolean) => void) | undefined
        flushMock.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
            finishFlush = resolve
        }))
        const nitroApp = runPlugin()
        const closeHandler = nitroApp.hooks.hook.mock.calls[0]![1] as () => Promise<void>

        let settled = false
        const closePromise = closeHandler().then(() => {
            settled = true
        })
        await Promise.resolve()
        expect(settled).toBe(false)

        finishFlush!(true)
        await closePromise
        expect(settled).toBe(true)
    })

    it('关闭文件流失败不阻断退出', () => {
        closeMock.mockImplementationOnce(() => {
            throw new Error('already closed')
        })
        const nitroApp = runPlugin()
        const closeHandler = nitroApp.hooks.hook.mock.calls[0]![1] as () => void
        expect(() => closeHandler()).not.toThrow()
        expect(uninstallMock).toHaveBeenCalled()
    })
})
