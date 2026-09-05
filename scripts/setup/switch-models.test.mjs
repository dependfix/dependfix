import { describe, expect, it } from 'vitest'
import { mergeConfig, normalizeConfig } from './switch-models.mjs'

describe('mergeConfig', () => {
    it('浅合并对象', () => {
        const base = { a: 1, b: 2 }
        const override = { b: 3, c: 4 }
        expect(mergeConfig(base, override)).toEqual({ a: 1, b: 3, c: 4 })
    })

    it('递归合并嵌套对象', () => {
        const base = { a: { x: 1, y: 2 }, b: 1 }
        const override = { a: { y: 3, z: 4 } }
        expect(mergeConfig(base, override)).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 1 })
    })

    it('数组类型直接用 override 替换', () => {
        expect(mergeConfig([1, 2], [3, 4])).toEqual([3, 4])
    })

    it('base 为数组时返回 override', () => {
        expect(mergeConfig([1, 2], { a: 1 })).toEqual({ a: 1 })
    })

    it('override 为数组时返回 override', () => {
        expect(mergeConfig({ a: 1 }, [3, 4])).toEqual([3, 4])
    })

    it('base 为 null 时返回 override', () => {
        expect(mergeConfig(null, { a: 1 })).toEqual({ a: 1 })
    })

    it('override 为 null 时返回 base', () => {
        expect(mergeConfig({ a: 1 }, null)).toEqual({ a: 1 })
    })

    it('两者都为 null 时返回 null', () => {
        expect(mergeConfig(null, null)).toBeNull()
    })

    it('base 为非对象时返回 override', () => {
        expect(mergeConfig('hello', 'world')).toBe('world')
    })

    it('override 为非对象时返回 override', () => {
        expect(mergeConfig({ a: 1 }, 'string')).toBe('string')
    })

    it('base 为数字 override 为对象时返回 override', () => {
        expect(mergeConfig(42, { a: 1 })).toEqual({ a: 1 })
    })

    it('override 中的新键直接添加', () => {
        const base = { a: 1 }
        const override = { b: 2 }
        expect(mergeConfig(base, override)).toEqual({ a: 1, b: 2 })
    })

    it('深层嵌套多层递归', () => {
        const base = { a: { b: { c: 1, d: 2 } } }
        const override = { a: { b: { d: 3, e: 4 } } }
        expect(mergeConfig(base, override)).toEqual({ a: { b: { c: 1, d: 3, e: 4 } } })
    })

    it('空对象合并', () => {
        expect(mergeConfig({}, {})).toEqual({})
        expect(mergeConfig({ a: 1 }, {})).toEqual({ a: 1 })
        expect(mergeConfig({}, { a: 1 })).toEqual({ a: 1 })
    })
})

describe('normalizeConfig', () => {
    it('按规范顺序排列已知键', () => {
        const config = { agent: { a: 1 }, model: 'test', mcp: {}, z_extra: true }
        const result = normalizeConfig(config)
        const keys = Object.keys(result)
        expect(keys[0]).toBe('model')
        expect(keys[1]).toBe('mcp')
        expect(keys[2]).toBe('agent')
        expect(keys[3]).toBe('z_extra')
    })

    it('无已知键时保持原样', () => {
        const config = { x: 1, y: 2 }
        expect(normalizeConfig(config)).toEqual({ x: 1, y: 2 })
    })

    it('所有已知键都存在时按序排列', () => {
        const config = {
            agent: 'a',
            model: 'b',
            instructions: 'c',
            mcp: 'd',
            default_agent: 'e',
            $schema: 'f',
            extra: 'g',
        }
        const result = normalizeConfig(config)
        const keys = Object.keys(result)
        expect(keys).toEqual(['$schema', 'model', 'default_agent', 'instructions', 'mcp', 'agent', 'extra'])
    })

    it('只有部分已知键时只排已知键', () => {
        const config = { extra: 1, model: 'test', other: 2 }
        const result = normalizeConfig(config)
        expect(Object.keys(result)[0]).toBe('model')
    })

    it('保留所有值', () => {
        const config = { model: 'm', agent: { a: 1 }, custom: 'c' }
        const result = normalizeConfig(config)
        expect(result.model).toBe('m')
        expect(result.agent).toEqual({ a: 1 })
        expect(result.custom).toBe('c')
    })

    it('空对象返回空对象', () => {
        expect(normalizeConfig({})).toEqual({})
    })
})
