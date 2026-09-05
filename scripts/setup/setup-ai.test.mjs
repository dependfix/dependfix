import { describe, expect, it, vi } from 'vitest'
import { toSymlinkTarget } from './setup-ai.mjs'

describe('toSymlinkTarget', () => {
    it('非 win32 时返回相对路径', () => {
        const result = toSymlinkTarget('/a/b/link', '/a/b/target')
        expect(result).toBe('target')
    })

    it('非 win32 跨目录返回相对路径', () => {
        const result = toSymlinkTarget('/a/b/link', '/a/c/target')
        expect(result).toBe('../c/target')
    })

    it('win32 时返回绝对路径', () => {
        const spy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
        const result = toSymlinkTarget('/a/b/link', '/a/b/target')
        expect(result).toBe('/a/b/target')
        spy.mockRestore()
    })

    it('win32 跨目录返回绝对路径', () => {
        const spy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
        const result = toSymlinkTarget('/a/b/link', '/a/c/target')
        expect(result).toBe('/a/c/target')
        spy.mockRestore()
    })
})
