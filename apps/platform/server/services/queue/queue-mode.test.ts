import { describe, expect, it } from 'vitest'
import {
    buildScanJobId,
    parseQueueEnabled,
    parseRetryConfig,
    resolveQueueMode,
    SCAN_JOB_PRIORITY,
} from './queue-mode'

describe('resolveQueueMode（队列模式决策/降级矩阵）', () => {
    it('auto + Redis 可用 → async', () => {
        expect(resolveQueueMode({ enabled: 'auto', redisAvailable: true })).toBe('async')
    })

    it('auto + Redis 不可用 → sync（无 Redis 降级同步）', () => {
        expect(resolveQueueMode({ enabled: 'auto', redisAvailable: false })).toBe('sync')
    })

    it('显式 true + Redis 可用 → async', () => {
        expect(resolveQueueMode({ enabled: 'true', redisAvailable: true })).toBe('async')
    })

    it('显式 true + Redis 不可用 → sync（可用性优先 failover）', () => {
        expect(resolveQueueMode({ enabled: 'true', redisAvailable: false })).toBe('sync')
    })

    it('显式 false → 强制 sync（即使 Redis 可用）', () => {
        expect(resolveQueueMode({ enabled: 'false', redisAvailable: true })).toBe('sync')
    })
})

describe('parseQueueEnabled', () => {
    it('合法值原样解析', () => {
        expect(parseQueueEnabled('true')).toBe('true')
        expect(parseQueueEnabled('false')).toBe('false')
        expect(parseQueueEnabled('auto')).toBe('auto')
    })

    it('布尔值解析（runtimeConfig 运行时覆盖经 destr 转布尔——NUXT_QUEUE_ENABLED=false）', () => {
        expect(parseQueueEnabled(true)).toBe('true')
        expect(parseQueueEnabled(false)).toBe('false')
    })

    it('未设置/非法值回退 auto', () => {
        expect(parseQueueEnabled(undefined)).toBe('auto')
        expect(parseQueueEnabled('')).toBe('auto')
        expect(parseQueueEnabled('yes')).toBe('auto')
    })
})

describe('buildScanJobId（去重键）', () => {
    it('同仓库固定 jobId（等待中重复入队合并）；不含冒号（BullMQ 6 限制）', () => {
        expect(buildScanJobId('repo-1')).toBe('scan-repo-1')
        expect(buildScanJobId('repo-1')).toBe(buildScanJobId('repo-1'))
        expect(buildScanJobId('repo-1')).not.toContain(':')
    })

    it('不同仓库 jobId 隔离', () => {
        expect(buildScanJobId('repo-1')).not.toBe(buildScanJobId('repo-2'))
    })
})

describe('parseRetryConfig（重试配置）', () => {
    it('默认：3 次尝试 + 5s 指数退避起点', () => {
        expect(parseRetryConfig({})).toEqual({ attempts: 3, backoffMs: 5_000 })
    })

    it('env 可配（合法值）', () => {
        expect(parseRetryConfig({ retriesRaw: '5', backoffMsRaw: '10000' })).toEqual({ attempts: 5, backoffMs: 10_000 })
    })

    it('非法值回退默认（负数/小数/零/空串）', () => {
        expect(parseRetryConfig({ retriesRaw: '-1', backoffMsRaw: '0' })).toEqual({ attempts: 3, backoffMs: 5_000 })
        expect(parseRetryConfig({ retriesRaw: '1.5', backoffMsRaw: 'abc' })).toEqual({ attempts: 3, backoffMs: 5_000 })
        // Number('') === 0 陷阱：空串/空白（env 未设置）必须回退默认而非"不重试"
        expect(parseRetryConfig({ retriesRaw: '', backoffMsRaw: '' })).toEqual({ attempts: 3, backoffMs: 5_000 })
        expect(parseRetryConfig({ retriesRaw: ' ', backoffMsRaw: ' ' })).toEqual({ attempts: 3, backoffMs: 5_000 })
    })

    it('retries=0 合法（不重试）', () => {
        expect(parseRetryConfig({ retriesRaw: '0' })).toEqual({ attempts: 0, backoffMs: 5_000 })
    })
})

describe('SCAN_JOB_PRIORITY（优先级：手动 > webhook > 定时）', () => {
    it('数值保证优先级顺序（BullMQ 数值越小越先）', () => {
        expect(SCAN_JOB_PRIORITY.manual).toBeLessThan(SCAN_JOB_PRIORITY.webhook)
        expect(SCAN_JOB_PRIORITY.webhook).toBeLessThan(SCAN_JOB_PRIORITY.scheduled)
    })
})
