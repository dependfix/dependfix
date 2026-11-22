import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    READINESS_QUERY_TIMEOUT_MS,
    checkDatabaseReadable,
    toReadinessView,
    withTimeout,
    type ReadinessDataSource,
} from './readiness'
import { setSchemaStatus } from '#server/database/schema-drift'

/**
 * readiness 视图单测：
 * - 数据库可读 → true；引导失败 / 查询失败 / 超时 → false（fail-closed）
 * - 视图状态与 schema 枚举透传，且不包含任何数据库明细字段
 * - withTimeout 及时清理定时器并按时 reject
 */
const dataSource = (query = vi.fn(async () => [{ '1': 1 }])): ReadinessDataSource => ({ query })

afterEach(() => {
    setSchemaStatus('unknown')
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('checkDatabaseReadable', () => {
    it('引导成功且 SELECT 1 返回 → ready', async () => {
        const ds = dataSource()
        const ensure = vi.fn(async () => ds)
        await expect(checkDatabaseReadable({ ensureDataSource: ensure })).resolves.toBe(true)
        expect(ensure).toHaveBeenCalledTimes(1)
        expect(ds.query).toHaveBeenCalledWith('SELECT 1')
    })

    it('数据库引导失败 → not ready（不抛错）', async () => {
        const ensure = vi.fn(async () => {
            throw new Error('database unavailable')
        })
        await expect(checkDatabaseReadable({ ensureDataSource: ensure })).resolves.toBe(false)
    })

    it('查询失败 → not ready', async () => {
        const query = vi.fn(async () => {
            throw new Error('readonly database')
        })
        await expect(checkDatabaseReadable({ ensureDataSource: async () => dataSource(query) })).resolves.toBe(false)
    })

    it('建连耗时长 + 查询悬挂 → 按同一总超时判 not ready（不累加两阶段预算）', async () => {
        // 判别性场景：建连 100ms 后查询悬挂，timeout=150ms。
        // 共享 deadline → ≈150ms；两段各自计时 → ≈250ms，故断言上界 200ms。
        const query = () => new Promise<unknown>(() => {
            void 0
        })
        const started = Date.now()
        await expect(checkDatabaseReadable({
            ensureDataSource: async () => {
                await new Promise((resolve) => setTimeout(resolve, 100))
                return { query }
            },
            timeoutMs: 150,
        })).resolves.toBe(false)
        expect(Date.now() - started).toBeLessThan(200)
    })

    it('引导悬挂 → 超时判 not ready（探针不悬挂）', async () => {
        const ensure = () => new Promise<ReadinessDataSource>(() => {
            void 0
        })
        await expect(checkDatabaseReadable({ ensureDataSource: ensure, timeoutMs: 10 })).resolves.toBe(false)
    })

    it('缺省超时常量为 2s', () => {
        expect(READINESS_QUERY_TIMEOUT_MS).toBe(2000)
    })
})

describe('toReadinessView', () => {
    it('ready：只含 status 与 schema', async () => {
        setSchemaStatus('ok')
        const view = await toReadinessView({ ensureDataSource: async () => dataSource() })
        expect(view).toEqual({ status: 'ready', schema: 'ok' })
        expect(Object.keys(view).sort()).toEqual(['schema', 'status'])
    })

    it('not_ready：schema 仍如实透传漂移状态', async () => {
        setSchemaStatus('drift')
        const view = await toReadinessView({
            ensureDataSource: async () => {
                throw new Error('database unavailable')
            },
        })
        expect(view).toEqual({ status: 'not_ready', schema: 'drift' })
    })
})

describe('withTimeout', () => {
    it('按时完成时返回原值并清理定时器', async () => {
        vi.useFakeTimers()
        await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('超时抛出带毫秒数的错误', async () => {
        await expect(withTimeout(new Promise<string>(() => {
            void 0
        }), 10)).rejects.toThrow(/timeout after 10ms/)
    })
})
