import { describe, expect, it, vi } from 'vitest'
import { bootstrapDatabase } from './database-bootstrap'

/**
 * 启动期数据库引导核心逻辑：就绪判定 / 日志 / 迁移专用模式的退出码。
 */
describe('bootstrapDatabase', () => {
    const makeDeps = (initialized: boolean, migrationsOnly: boolean) => {
        const exit = vi.fn()
        const log = vi.fn()
        const error = vi.fn()
        return {
            deps: {
                initialize: vi.fn().mockResolvedValue({ isInitialized: initialized }),
                exit,
                log,
                error,
                migrationsOnly,
            },
            exit,
            log,
            error,
        }
    }

    it('常规模式：初始化成功返回 true 且不退出', async () => {
        const { deps, exit, log } = makeDeps(true, false)
        await expect(bootstrapDatabase(deps)).resolves.toBe(true)
        expect(exit).not.toHaveBeenCalled()
        expect(log).toHaveBeenCalledWith(expect.stringContaining('启动期初始化完成'))
    })

    it('常规模式：初始化失败返回 false 且仅告警', async () => {
        const { deps, exit, error } = makeDeps(false, false)
        await expect(bootstrapDatabase(deps)).resolves.toBe(false)
        expect(exit).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalledWith(expect.stringContaining('初始化失败'))
    })

    it('迁移专用模式：初始化成功退出 0', async () => {
        const { deps, exit } = makeDeps(true, true)
        await bootstrapDatabase(deps)
        expect(exit).toHaveBeenCalledWith(0)
    })

    it('迁移专用模式：初始化失败退出 1', async () => {
        const { deps, exit } = makeDeps(false, true)
        await bootstrapDatabase(deps)
        expect(exit).toHaveBeenCalledWith(1)
    })
})
