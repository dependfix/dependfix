import { describe, expect, it } from 'vitest'
import { resolveBatchDeepLinkTarget } from '../../app/utils/batch-deep-link'
import { buildBatchDeepLinkPath } from '#shared/batch-routes'

describe('utils/batch-deep-link', () => {
    const runs = Array.from({ length: 25 }, (_, index) => ({ id: `batch-${index}` }))

    it('命中首页目标：返回下标与页码', () => {
        expect(resolveBatchDeepLinkTarget(runs, 'batch-3', 10)).toEqual({ index: 3, page: 1 })
    })

    it('命中后续页目标：页码按每页条数换算（1 基）', () => {
        expect(resolveBatchDeepLinkTarget(runs, 'batch-10', 10)).toEqual({ index: 10, page: 2 })
        expect(resolveBatchDeepLinkTarget(runs, 'batch-24', 10)).toEqual({ index: 24, page: 3 })
    })

    it('id 缺失 / 空白 / 目标不在列表 → null', () => {
        expect(resolveBatchDeepLinkTarget(runs, null, 10)).toBeNull()
        expect(resolveBatchDeepLinkTarget(runs, undefined, 10)).toBeNull()
        expect(resolveBatchDeepLinkTarget(runs, '   ', 10)).toBeNull()
        expect(resolveBatchDeepLinkTarget(runs, 'not-exist', 10)).toBeNull()
    })

    it('每页条数非法（0 / 负数 / NaN / Infinity）时不产生 NaN，按 1 处理', () => {
        expect(resolveBatchDeepLinkTarget(runs, 'batch-2', 0)).toEqual({ index: 2, page: 3 })
        expect(resolveBatchDeepLinkTarget(runs, 'batch-2', -5)).toEqual({ index: 2, page: 3 })
        expect(resolveBatchDeepLinkTarget(runs, 'batch-2', Number.NaN)).toEqual({ index: 2, page: 3 })
        expect(resolveBatchDeepLinkTarget(runs, 'batch-2', Number.POSITIVE_INFINITY)).toEqual({ index: 2, page: 3 })
    })

    it('小数每页条数向下取整', () => {
        expect(resolveBatchDeepLinkTarget(runs, 'batch-3', 2.9)).toEqual({ index: 3, page: 2 })
    })
})

describe('shared/batch-routes', () => {
    it('构造深链路径并编码 id', () => {
        expect(buildBatchDeepLinkPath('6886ca3eaf001020')).toBe('/batch-runs?id=6886ca3eaf001020')
        expect(buildBatchDeepLinkPath('a b&c')).toBe('/batch-runs?id=a%20b%26c')
    })

    it('id 缺失 / 空白 → 列表页', () => {
        expect(buildBatchDeepLinkPath(null)).toBe('/batch-runs')
        expect(buildBatchDeepLinkPath(undefined)).toBe('/batch-runs')
        expect(buildBatchDeepLinkPath('   ')).toBe('/batch-runs')
    })
})
