import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    buildDuplicateGroups,
    flattenMessageEntries,
    formatKeys,
    formatMarkdownReport,
    formatTextReport,
    formatValues,
    getLocaleMessageMaps,
    getSharedKeys,
    parseArguments,
    renderReport,
    runAudit,
} from './audit-duplicate-messages.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'audit-duplicate-messages-test-'))
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
        expect(options.format).toBe('text')
        expect(options.limit).toBe(50)
        expect(options.minGroupSize).toBe(2)
        expect(options.crossModuleOnly).toBe(false)
        expect(options.locales).toEqual([])
        expect(options.modules).toEqual([])
    })

    it('parses values and flags', () => {
        const options = parseArguments([
            '--format=json',
            '--limit=10',
            '--min-group-size=3',
            '--cross-module-only',
            '--locale=zh-CN,en-US',
        ])
        expect(options.format).toBe('json')
        expect(options.limit).toBe(10)
        expect(options.minGroupSize).toBe(3)
        expect(options.crossModuleOnly).toBe(true)
        expect(options.locales).toEqual(['en-US', 'zh-CN'])
    })

    it('rejects min-group-size below 2', () => {
        expect(() => parseArguments(['--min-group-size=1'])).toThrow('at least 2')
    })
})

describe('flattenMessageEntries', () => {
    it('flattens nested objects with non-empty string leaves', () => {
        const entries = flattenMessageEntries({ common: { title: 'x', skip: '' } })
        expect(entries).toEqual([{ key: 'common.title', value: 'x' }])
    })

    it('flattens arrays with index paths', () => {
        const entries = flattenMessageEntries({ items: ['a', { name: 'b' }] })
        expect(entries).toEqual([
            { key: 'items[0]', value: 'a' },
            { key: 'items[1].name', value: 'b' },
        ])
    })
})

describe('getLocaleMessageMaps', () => {
    it('reads single-file locales', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { title: '标题' } }))
        write('locales/en-US.json', JSON.stringify({ common: { title: 'Title' } }))

        const maps = await getLocaleMessageMaps(join(root, 'locales'), [])
        expect([...maps.keys()].sort()).toEqual(['en-US', 'zh-CN'])
        expect(maps.get('zh-CN').messageMap.get('common.title')).toEqual({ moduleName: 'zh-CN', value: '标题' })
        expect(maps.get('zh-CN').moduleNames).toEqual(['zh-CN'])
    })

    it('reads modularized locales', async () => {
        // 模块化形态：模块文件内容带完整命名空间前缀（common.json 内为 common.* 树）
        write('locales/zh-CN/common.json', JSON.stringify({ common: { title: '标题' } }))
        write('locales/zh-CN/admin.json', JSON.stringify({ admin: { menu: '菜单' } }))
        write('locales/en-US/common.json', JSON.stringify({ common: { title: 'Title' } }))

        const maps = await getLocaleMessageMaps(join(root, 'locales'), [])
        expect(maps.get('zh-CN').moduleNames).toEqual(['admin', 'common'])
        expect(maps.get('zh-CN').messageMap.get('common.title')).toEqual({ moduleName: 'common', value: '标题' })
        expect(maps.get('zh-CN').messageMap.get('admin.menu')).toEqual({ moduleName: 'admin', value: '菜单' })
    })

    it('filters by requested module', async () => {
        write('locales/zh-CN/common.json', JSON.stringify({ title: '标题' }))
        write('locales/zh-CN/admin.json', JSON.stringify({ menu: '菜单' }))
        write('locales/en-US/common.json', JSON.stringify({ title: 'Title' }))
        write('locales/en-US/admin.json', JSON.stringify({ menu: 'Menu' }))

        const maps = await getLocaleMessageMaps(join(root, 'locales'), ['common'])
        expect(maps.get('zh-CN').moduleNames).toEqual(['common'])
        expect(maps.get('zh-CN').messageMap.has('admin.menu')).toBe(false)
    })
})

describe('getSharedKeys', () => {
    it('computes shared keys across locales', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { title: 'x', onlyZh: 'z' } }))
        write('locales/en-US.json', JSON.stringify({ common: { title: 'y', onlyEn: 'e' } }))

        const maps = await getLocaleMessageMaps(join(root, 'locales'), [])
        const { incompleteKeyCount, sharedKeys, totalDistinctKeys } = getSharedKeys(['en-US', 'zh-CN'], maps)
        expect(sharedKeys).toEqual(['common.title'])
        expect(totalDistinctKeys).toBe(3)
        expect(incompleteKeyCount).toBe(2)
    })
})

describe('buildDuplicateGroups', () => {
    it('groups keys whose values match in every locale (single-file shape, no cross-module)', async () => {
        write('locales/zh-CN.json', JSON.stringify({
            common: { save: '保存', cancel: '取消' },
            pages: { submit: '提交', save: '保存' },
        }))
        write('locales/en-US.json', JSON.stringify({
            common: { save: 'Save', cancel: 'Cancel' },
            pages: { submit: 'Submit', save: 'Save' },
        }))

        const maps = await getLocaleMessageMaps(join(root, 'locales'), [])
        const { sharedKeys } = getSharedKeys(['en-US', 'zh-CN'], maps)
        const groups = buildDuplicateGroups(['en-US', 'zh-CN'], maps, sharedKeys, 2)

        // common.save + pages.save 在两种语言下签名一致 → 一组（2 keys）
        const saveGroup = groups.find((group) => group.keys[0]?.key === 'common.save')
        expect(saveGroup).toBeDefined()
        expect(saveGroup.keyCount).toBe(2)
        expect(saveGroup.keys.map((item) => item.key).sort()).toEqual(['common.save', 'pages.save'])
        // 单文件形态：module 名 = locale 名，跨 key 但同 module → 不算 cross-module
        expect(saveGroup.crossModule).toBe(false)
    })

    it('marks cross-module groups in modularized shape', async () => {
        write('locales/zh-CN/common.json', JSON.stringify({ common: { save: '保存' } }))
        write('locales/zh-CN/pages.json', JSON.stringify({ pages: { save: '保存' } }))
        write('locales/en-US/common.json', JSON.stringify({ common: { save: 'Save' } }))
        write('locales/en-US/pages.json', JSON.stringify({ pages: { save: 'Save' } }))

        const maps = await getLocaleMessageMaps(join(root, 'locales'), [])
        const { sharedKeys } = getSharedKeys(['en-US', 'zh-CN'], maps)
        const groups = buildDuplicateGroups(['en-US', 'zh-CN'], maps, sharedKeys, 2)

        const saveGroup = groups.find((group) => group.keys[0]?.key === 'common.save')
        expect(saveGroup).toBeDefined()
        expect(saveGroup.keyCount).toBe(2)
        expect(saveGroup.modules).toEqual(['common', 'pages'])
        expect(saveGroup.crossModule).toBe(true)
    })

    it('respects minGroupSize', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { save: '保存' }, pages: { save: '保存' } }))
        write('locales/en-US.json', JSON.stringify({ common: { save: 'Save' }, pages: { save: 'Save' } }))

        const maps = await getLocaleMessageMaps(join(root, 'locales'), [])
        const { sharedKeys } = getSharedKeys(['en-US', 'zh-CN'], maps)
        const groups = buildDuplicateGroups(['en-US', 'zh-CN'], maps, sharedKeys, 3)
        expect(groups).toHaveLength(0)
    })
})

describe('runAudit', () => {
    it('runs end-to-end with text output and returns report', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { save: '保存', cancel: '取消' } }))
        write('locales/en-US.json', JSON.stringify({ common: { save: 'Save', cancel: 'Cancel' } }))

        const options = parseArguments([`--locale-root=${join(root, 'locales')}`])
        const report = await runAudit(options)
        expect(report.summary.locales).toEqual(['en-US', 'zh-CN'])
        expect(report.groups).toHaveLength(0) // save/cancel 两种语言值不同 → 无重复组
    })

    it('throws when fewer than two locales', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { save: '保存' } }))

        const options = parseArguments([`--locale-root=${join(root, 'locales')}`])
        await expect(runAudit(options)).rejects.toThrow('At least two locales')
    })

    it('writes output file when --output provided', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { save: '保存' }, pages: { save: '保存' } }))
        write('locales/en-US.json', JSON.stringify({ common: { save: 'Save' }, pages: { save: 'Save' } }))

        const options = parseArguments([
            `--locale-root=${join(root, 'locales')}`,
            `--output=${join(root, 'report.json')}`,
            '--format=json',
        ])
        const report = await runAudit(options)
        expect(report.groups.length).toBeGreaterThan(0)
    })

    it('throws on unknown locale selector', async () => {
        write('locales/zh-CN.json', JSON.stringify({ common: { save: '保存' } }))
        write('locales/en-US.json', JSON.stringify({ common: { save: 'Save' } }))

        const options = parseArguments([
            `--locale-root=${join(root, 'locales')}`,
            '--locale=ja-JP',
        ])
        await expect(runAudit(options)).rejects.toThrow('Unknown locale selector')
    })
})

describe('report formatting', () => {
    const sampleReport = () => ({
        filters: { crossModuleOnly: false, limit: 50, minGroupSize: 2, modules: [] },
        groups: [{
            crossModule: true,
            keyCount: 2,
            keys: [
                { key: 'common.save', moduleName: 'common' },
                { key: 'pages.save', moduleName: 'pages' },
            ],
            modules: ['common', 'pages'],
            values: { 'en-US': 'Save', 'zh-CN': '保存' },
        }],
        summary: {
            crossModuleGroupCount: 1,
            duplicateGroupCount: 1,
            incompleteKeyCount: 0,
            locales: ['en-US', 'zh-CN'],
            sharedKeyCount: 2,
            shownGroupCount: 1,
            totalDistinctKeyCount: 2,
            totalKeysInGroups: 2,
        },
    })

    it('formatValues renders per-locale value lines', () => {
        const text = formatValues({ 'en-US': 'Save', 'zh-CN': '保存' })
        expect(text).toContain('en-US: Save')
        expect(text).toContain('zh-CN: 保存')
    })

    it('formatKeys renders key lines with module annotations', () => {
        const text = formatKeys([{ key: 'common.save', moduleName: 'common' }])
        expect(text).toBe('      - common.save [common]')
    })

    it('formatTextReport renders header, summary and groups', () => {
        const text = formatTextReport(sampleReport())
        expect(text).toContain('Scanned 2 locale(s): en-US, zh-CN')
        expect(text).toContain('Duplicate groups that match in every locale: 1')
        expect(text).toContain('common.save')
        expect(text).toContain('cross-module')
    })

    it('formatTextReport handles empty groups', () => {
        const report = sampleReport()
        report.groups = []
        report.summary.duplicateGroupCount = 0
        report.summary.shownGroupCount = 0
        const text = formatTextReport(report)
        expect(text).toContain('No duplicate groups matched the current filters.')
    })

    it('formatMarkdownReport renders markdown structure', () => {
        const text = formatMarkdownReport(sampleReport())
        expect(text).toContain('# Duplicate Message Audit')
        expect(text).toContain('## Summary')
        expect(text).toContain('## Candidate Groups')
        expect(text).toContain('common.save [common]')
    })

    it('renderReport supports text/markdown/json formats', () => {
        const report = sampleReport()
        expect(renderReport(report, 'text')).toContain('Scanned 2 locale(s)')
        expect(renderReport(report, 'markdown')).toContain('# Duplicate Message Audit')
        expect(JSON.parse(renderReport(report, 'json'))).toMatchObject({ summary: { duplicateGroupCount: 1 } })
    })
})
