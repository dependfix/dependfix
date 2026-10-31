import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * queue-consumer 插件单测：锁定「双进程形态下 worker 进程必须启动消费端」这一约束。
 *
 * 背景（容器运维实测，见 docs/guide/deployment.md 的运维实测记录）：队列服务是惰性单例，唯一主动初始化者是按角色跳过 worker 的
 * stale-cleanup 插件，导致 worker 进程从不创建消费者、扫描 run 永久 pending。
 * 本插件是该启动点，用例覆盖：HTTP 主进程 no-op / async 启动 / sync 不启动 /
 * 角色=worker 但未启用消费（配置错误）/ 启动失败退出进程。
 */
const { getQueueServiceMock, logInfoMock, logErrorMock, roleState } = vi.hoisted(() => ({
    getQueueServiceMock: vi.fn(),
    logInfoMock: vi.fn(),
    logErrorMock: vi.fn(),
    roleState: { worker: false },
}))

vi.mock('nitropack/runtime', () => ({
    defineNitroPlugin: (fn: unknown) => fn,
}))
vi.mock('#server/services/queue/queue.service', () => ({ getQueueService: getQueueServiceMock }))
vi.mock('#server/utils/logger', () => ({
    logger: { debug: vi.fn(), info: logInfoMock, warn: vi.fn(), error: logErrorMock },
}))
vi.mock('#server/utils/process-role', () => ({ isQueueWorkerProcess: () => roleState.worker }))
// 插件入口依赖 Nuxt 自动导入的 useRuntimeConfig：单测里注入桩，避免触达 Nuxt 运行时
vi.stubGlobal('useRuntimeConfig', () => ({ inProcessWorker: true }))

import queueConsumerPlugin, { startQueueConsumer } from './queue-consumer'

const service = (mode: 'async' | 'sync') => ({ mode, queue: mode === 'async' ? {} : null, close: vi.fn() })
const workerRole = { isWorkerProcess: () => true }
const serverRole = { isWorkerProcess: () => false }

describe('startQueueConsumer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        roleState.worker = false
    })

    it('HTTP 主进程（inProcessWorker=false 且非 worker 角色）不初始化队列服务', async () => {
        await expect(startQueueConsumer({ inProcessWorker: false }, serverRole)).resolves.toBe(false)
        expect(getQueueServiceMock).not.toHaveBeenCalled()
    })

    it('角色=worker 但 inProcessWorker=false → 视为配置错误并抛出（不留无声消费者）', async () => {
        await expect(startQueueConsumer({ inProcessWorker: false }, workerRole)).rejects
            .toThrow('inProcessWorker=false')
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('未启用 IN_PROCESS_WORKER'))
        expect(getQueueServiceMock).not.toHaveBeenCalled()
    })

    it('inProcessWorker=true 且 async 模式 → 初始化并报告消费端就绪', async () => {
        getQueueServiceMock.mockResolvedValue(service('async'))
        await expect(startQueueConsumer({ inProcessWorker: true })).resolves.toBe(true)
        expect(getQueueServiceMock).toHaveBeenCalledTimes(1)
        expect(logInfoMock).toHaveBeenCalledWith(expect.stringContaining('消费者已就绪'))
    })

    it('sync 模式（Redis 不可用 / 显式关闭）→ 不启动消费端但记录模式', async () => {
        getQueueServiceMock.mockResolvedValue(service('sync'))
        await expect(startQueueConsumer({ inProcessWorker: true })).resolves.toBe(false)
        expect(logInfoMock).toHaveBeenCalledWith(expect.stringContaining('mode=sync'))
    })

    it('初始化失败 → 记录错误并抛出（启动失败可见，不留无声消费者）', async () => {
        const failure = new Error('redis unavailable')
        getQueueServiceMock.mockRejectedValue(failure)
        await expect(startQueueConsumer({ inProcessWorker: true })).rejects.toThrow('redis unavailable')
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('消费者启动失败'), { error: failure })
    })
})

describe('queue-consumer 插件入口', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        roleState.worker = false
    })

    it('注册为 nitro 插件函数', () => {
        expect(typeof queueConsumerPlugin).toBe('function')
    })

    it('消费端启动失败 → 退出进程（交由入口看护 / 编排重启）', async () => {
        // 变异守卫：删掉插件层 .catch 里的 process.exit 会让本用例失败
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
        try {
            getQueueServiceMock.mockRejectedValue(new Error('redis unavailable'))
            await (queueConsumerPlugin as unknown as () => Promise<void>)()
            // 等 catch 分支执行（void promise）
            await new Promise((resolve) => {
                setTimeout(resolve, 0)
            })
            expect(exitSpy).toHaveBeenCalledWith(1)
        } finally {
            exitSpy.mockRestore()
        }
    })
})
