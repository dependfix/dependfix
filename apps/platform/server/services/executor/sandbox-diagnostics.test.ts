import { describe, expect, it } from 'vitest'
import { lastLines, registryHostname } from './sandbox-diagnostics'

describe('registryHostname', () => {
    it('extracts the host of an https registry', () => {
        expect(registryHostname('https://registry.npmmirror.com')).toBe('registry.npmmirror.com')
        expect(registryHostname('https://registry.example.com:8443/')).toBe('registry.example.com')
    })

    it('rejects plaintext registries and embedded credentials', () => {
        expect(registryHostname('http://registry.example.com')).toBeNull()
        expect(registryHostname('https://user:pass@registry.example.com')).toBeNull()
        expect(registryHostname('not-a-url')).toBeNull()
        expect(registryHostname('')).toBeNull()
    })
})

describe('lastLines', () => {
    it('keeps the tail within the character budget', () => {
        const tail = lastLines('aaaa\nbbbb\ncccc\n', 15)
        expect(tail).toBe('bbbb / cccc')
        expect(tail.length).toBeLessThanOrEqual(15)
    })

    it('truncates a single oversized line instead of returning empty', () => {
        const tail = lastLines('x'.repeat(200), 40)
        expect(tail).toHaveLength(40)
    })
})
