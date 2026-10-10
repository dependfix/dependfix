import { afterEach, describe, expect, it } from 'vitest'
import {
    DEFAULT_EXECUTION_TIMEOUT_MS,
    MAX_EXECUTION_TIMEOUT_MS,
    MIN_EXECUTION_TIMEOUT_MS,
    resolveExecutionTimeoutMs,
} from './container-executor'

/**
 * `resolveExecutionTimeoutMs`（EXECUTION_TIMEOUT_MS env 解析）测试。
 *
 * 该解析器同时驱动容器执行器超时与队列 Worker 锁时长（`SCAN_WORKER_LOCK_OPTIONS`），
 * 故覆盖：缺省 / 有效覆盖 / 边界值 / 非法值 / 越界 fail-closed 回退 / env 读取。
 */
describe('resolveExecutionTimeoutMs (utility)', () => {
    const originalEnv = process.env.EXECUTION_TIMEOUT_MS

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.EXECUTION_TIMEOUT_MS
        } else {
            process.env.EXECUTION_TIMEOUT_MS = originalEnv
        }
    })

    it('returns default (30min) when raw is undefined', () => {
        // resolveExecutionTimeoutMs(undefined) 会读 env（默认参数），故显式清除以保证确定性
        delete process.env.EXECUTION_TIMEOUT_MS
        expect(DEFAULT_EXECUTION_TIMEOUT_MS).toBe(30 * 60 * 1000)
        expect(resolveExecutionTimeoutMs(undefined)).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
    })

    it('parses valid override within bounds', () => {
        expect(resolveExecutionTimeoutMs('600000')).toBe(600_000)
    })

    it('accepts boundary values (min / max)', () => {
        expect(resolveExecutionTimeoutMs(String(MIN_EXECUTION_TIMEOUT_MS))).toBe(MIN_EXECUTION_TIMEOUT_MS)
        expect(resolveExecutionTimeoutMs(String(MAX_EXECUTION_TIMEOUT_MS))).toBe(MAX_EXECUTION_TIMEOUT_MS)
    })

    it('falls back to default for NaN / negative / zero', () => {
        expect(resolveExecutionTimeoutMs('foo')).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
        expect(resolveExecutionTimeoutMs('-1')).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
        expect(resolveExecutionTimeoutMs('0')).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
    })

    it('fail-closed fallback for out-of-range (below min / above max)', () => {
        expect(resolveExecutionTimeoutMs(String(MIN_EXECUTION_TIMEOUT_MS - 1))).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
        expect(resolveExecutionTimeoutMs(String(MAX_EXECUTION_TIMEOUT_MS + 1))).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
    })

    it('reads EXECUTION_TIMEOUT_MS env when no raw argument is given', () => {
        process.env.EXECUTION_TIMEOUT_MS = '900000'
        expect(resolveExecutionTimeoutMs()).toBe(900_000)
    })
})
