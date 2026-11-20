import { describe, expect, it } from 'vitest'
import { buildLogsJson, lastLines, registryHostname } from './sandbox-diagnostics'

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

describe('buildLogsJson', () => {
    it('keeps the tail of stdout / stderr and reports dropped lines', () => {
        const stdout = Array.from({ length: 6 }, (_, index) => `out-${index}`).join('\n')
        const stderr = Array.from({ length: 4 }, (_, index) => `err-${index}`).join('\n')
        const { logsJson, dropped } = buildLogsJson(stdout, stderr, 2)
        const entries = JSON.parse(logsJson) as { level: string, message: string }[]
        expect(entries.map((entry) => entry.message)).toEqual(['out-4', 'out-5', 'err-2', 'err-3'])
        expect(entries.map((entry) => entry.level)).toEqual(['info', 'info', 'error', 'error'])
        expect(dropped).toBe(6)
    })

    it('reports 0 when nothing is dropped', () => {
        const { dropped } = buildLogsJson('one line', '')
        expect(dropped).toBe(0)
    })

    it('does not count blank lines as dropped entries', () => {
        const { logsJson, dropped } = buildLogsJson('a\n\n\n', '\n\n', 10)
        expect(dropped).toBe(0)
        expect((JSON.parse(logsJson) as unknown[]).length).toBe(1)
    })
})
