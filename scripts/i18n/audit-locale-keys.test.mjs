import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    collectMissingParity,
    collectUnusedCandidates,
    flattenMessages,
    formatFinding,
    formatSection,
    formatSummary,
    getLocaleModules,
    getReferencedKeys,
    parseArguments,
    runAudit,
    shouldScanSourceFile,
    summarizeFindings,
    toModulePath,
} from './audit-locale-keys.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audit-locale-keys-test-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(join(root, rel.split(/[\\/]/).slice(0, -1).join('/')), { recursive: true })
    writeFileSync(file, content)
}

describe('parseArguments', () => {
    it('applies defaults', () => {
        const options = parseArguments([])
        expect(options.only).toBe('all')
        expect(options.failOnMissing).toBe(false)
        expect(options.failOnUnused).toBe(false)
        expect(options.summaryLimit).toBe(10)
        expect(options.locales).toEqual([])
        expect(options.modules).toEqual([])
    })

    it('parses flags and values', () => {
        const options = parseArguments([
            '--fail-on-missing',
            '--only=missing',
            '--locale=zh-CN,en-US',
            '--module=common',
            '--summary-limit=5',
        ])
        expect(options.failOnMissing).toBe(true)
        expect(options.only).toBe('missing')
        expect(options.locales).toEqual(['en-US', 'zh-CN'])
        expect(options.modules).toEqual(['common'])
        expect(options.summaryLimit).toBe(5)
    })

    it('rejects unsupported --only', () => {
        expect(() => parseArguments(['--only=bogus'])).toThrow('Unsupported --only value')
    })

    it('rejects negative --summary-limit', () => {
        expect(() => parseArguments(['--summary-limit=-1'])).toThrow('non-negative integer')
    })
})

describe('flattenMessages', () => {
    it('flattens nested objects with dot paths', () => {
        const keys = flattenMessages({
            common: {
                nav: { dashboard: 'x' },
                actions: { save: 'x', cancel: 'x' },
            },
            top: 'x',
        })
        expect(keys).toEqual(['common.nav.dashboard', 'common.actions.save', 'common.actions.cancel', 'top'])
    })

    it('flattens arrays with index paths', () => {
        const keys = flattenMessages({ items: ['a', { name: 'b' }] })
        expect(keys).toEqual(['items[0]', 'items[1].name'])
    })

    it('keeps non-object prefix as leaf', () => {
        expect(flattenMessages('plain', 'prefix')).toEqual(['prefix'])
    })
})

describe('getLocaleModules', () => {
    it('reads single-file locales (dependfix current shape) with empty module name', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { title: 'x' } }))
        write('locales/en-US.json', JSON.stringify({ common: { title: 'y' } }))

        const modules = await getLocaleModules({ localeRoot: join(root, 'locales'), locales: [], modules: [] })
        expect([...modules.keys()]).toEqual(['en-US', 'zh-CN'])
        expect(modules.get('zh-CN').get('')).toEqual(['common.title'])
    })

    it('reads modularized locales (future shape)', async () => {
        write('locales/zh-CN/common.json', JSON.stringify({ title: 'x' }))
        write('locales/zh-CN/admin.json', JSON.stringify({ menu: 'm' }))
        write('locales/en-US/common.json', JSON.stringify({ title: 'y' }))

        const modules = await getLocaleModules({ localeRoot: join(root, 'locales'), locales: [], modules: [] })
        expect(modules.get('zh-CN').get('common')).toEqual(['title'])
        expect(modules.get('zh-CN').get('admin')).toEqual(['menu'])
        expect(modules.get('en-US').get('common')).toEqual(['title'])
    })

    it('filters by locale selector', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { title: 'x' } }))
        write('locales/en-US.json', JSON.stringify({ common: { title: 'y' } }))

        const modules = await getLocaleModules({ localeRoot: join(root, 'locales'), locales: ['zh-CN'], modules: [] })
        expect([...modules.keys()]).toEqual(['zh-CN'])
    })

    it('throws on unknown locale', async () => {
        write('locales/zh-CN.json', JSON.stringify({}))

        await expect(getLocaleModules({ localeRoot: join(root, 'locales'), locales: ['ja-JP'], modules: [] }))
            .rejects.toThrow('Unknown locale selector')
    })

    it('throws on unknown module in modularized shape', async () => {
        write('locales/zh-CN/common.json', JSON.stringify({}))

        await expect(getLocaleModules({ localeRoot: join(root, 'locales'), locales: [], modules: ['admin'] }))
            .rejects.toThrow('Unknown module selector')
    })
})

describe('shouldScanSourceFile', () => {
    it('excludes test files and test dirs', () => {
        expect(shouldScanSourceFile('app/pages/index.vue')).toBe(true)
        expect(shouldScanSourceFile('app/utils/x.test.ts')).toBe(false)
        expect(shouldScanSourceFile('tests/e2e/i18n.e2e.test.ts')).toBe(false)
        expect(shouldScanSourceFile('server/api/index.spec.ts')).toBe(false)
    })
})

describe('getReferencedKeys', () => {
    it('collects quoted dotted keys from source files', async () => {
        write('app/pages/a.vue', 'const x = t(\'common.nav.dashboard\')')
        write('app/utils/b.ts', 'const y = $t(\'repos.title\')')
        write('app/utils/c.test.ts', 'const z = t(\'should.not.count\')')

        const keys = await getReferencedKeys({ scanRoot: join(root, 'app') })
        expect([...keys]).toEqual(['common.nav.dashboard', 'repos.title'])
    })
})

describe('collectMissingParity', () => {
    it('returns empty when fewer than two locales', () => {
        const modules = new Map([['zh-CN', new Map([['', ['a']]])]])
        expect(collectMissingParity(modules)).toEqual([])
    })

    it('reports keys missing in either locale (single-file shape)', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { title: 'x', extra: 'e' } }))
        write('locales/en-US.json', JSON.stringify({ common: { title: 'y' } }))

        const modules = await getLocaleModules({ localeRoot: join(root, 'locales'), locales: [], modules: [] })
        const missing = collectMissingParity(modules)
        expect(missing).toHaveLength(1)
        expect(missing[0]).toEqual({ key: 'common.extra', localeCode: 'en-US', moduleName: '' })
    })

    it('compares per module in modularized shape', async () => {
        write('locales/zh-CN/common.json', JSON.stringify({ title: 'x' }))
        write('locales/en-US/common.json', JSON.stringify({ title: 'y', extra: 'e' }))

        const modules = await getLocaleModules({ localeRoot: join(root, 'locales'), locales: [], modules: [] })
        const missing = collectMissingParity(modules)
        expect(missing).toEqual([{ key: 'extra', localeCode: 'zh-CN', moduleName: 'common' }])
    })
})

describe('collectUnusedCandidates', () => {
    it('marks keys not referenced in source as unused', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { used: 'x', unused: 'u' } }))
        write('locales/en-US.json', JSON.stringify({ common: { used: 'y', unused: 'u' } }))

        const modules = await getLocaleModules({ localeRoot: join(root, 'locales'), locales: [], modules: [] })
        const referenced = new Set(['common.used'])
        const unused = collectUnusedCandidates(modules, referenced)
        expect(unused).toHaveLength(2)
        expect(unused[0]).toEqual({ key: 'common.unused', localeCode: 'en-US', moduleName: '' })
    })
})

describe('runAudit', () => {
    it('produces output sections for missing and unused modes', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { title: 'x', orphan: 'o' } }))
        write('locales/en-US.json', JSON.stringify({ common: { title: 'y' } }))
        write('app/pages/a.vue', 'const x = t(\'common.title\')')

        const options = parseArguments(['--locale-root', join(root, 'locales'), '--scan-root', join(root, 'app')])
        const result = await runAudit(options)

        expect(result.missingParity).toHaveLength(1)
        expect(result.unusedCandidates).toHaveLength(1)
        expect(result.output).toContain('Missing parity summary')
        expect(result.output).toContain('Missing parity keys')
        expect(result.output).toContain('Unused candidate summary')
        expect(result.output).toContain('Unused candidate keys')
        expect(result.output).toContain('zh-CN.json')
    })

    it('supports only=missing mode', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { title: 'x' } }))
        write('locales/en-US.json', JSON.stringify({ common: { title: 'y', extra: 'e' } }))
        write('app/pages/a.vue', 'const x = t(\'common.title\')')

        const options = parseArguments([
            '--only=missing',
            '--locale-root', join(root, 'locales'),
            '--scan-root', join(root, 'app'),
        ])
        const result = await runAudit(options)
        expect(result.missingParity).toHaveLength(1)
        expect(result.output).not.toContain('Unused candidate summary')
    })
})

describe('format helpers', () => {
    it('toModulePath handles single-file and modularized shapes', () => {
        expect(toModulePath('zh-CN', '')).toBe('zh-CN.json')
        expect(toModulePath('zh-CN', 'common')).toBe('zh-CN/common.json')
    })

    it('formatFinding renders missing/unused lines', () => {
        const item = { key: 'common.title', localeCode: 'zh-CN', moduleName: '' }
        expect(formatFinding(item, 'missing')).toBe('zh-CN.json is missing common.title')
        expect(formatFinding(item, 'unused')).toBe('zh-CN.json -> common.title')
    })

    it('formatSection renders empty and populated sections', () => {
        expect(formatSection('Missing parity keys', [])).toBe('Missing parity keys: none')
        expect(formatSection('Keys', ['a', 'b'])).toBe('Keys:\n  - a\n  - b')
    })

    it('summarizeFindings counts per locale and hotspots', () => {
        const items = [
            { key: 'a', localeCode: 'en-US', moduleName: '' },
            { key: 'b', localeCode: 'en-US', moduleName: '' },
            { key: 'c', localeCode: 'zh-CN', moduleName: '' },
        ]
        const summary = summarizeFindings(items, {
            availableLocales: ['en-US', 'zh-CN'],
            availableModules: [],
            locales: [],
            modules: [],
            summaryLimit: 2,
        })
        expect(summary.total).toBe(3)
        expect(summary.localeCounts).toEqual(['en-US: 2', 'zh-CN: 1'])
        expect(summary.topHotspots).toEqual(['en-US.json: 2', 'zh-CN.json: 1'])
    })

    it('formatSummary renders a structured summary block', () => {
        const summary = {
            total: 1,
            scannedLocales: ['en-US'],
            scannedModules: [],
            localeCounts: ['en-US: 1'],
            topHotspots: ['en-US.json: 1'],
        }
        const text = formatSummary('Missing parity summary', summary)
        expect(text).toContain('total: 1')
        expect(text).toContain('scanned locales: en-US')
        expect(text).toContain('per-locale: en-US: 1')
        expect(text).toContain('top hotspots:')
    })
})
