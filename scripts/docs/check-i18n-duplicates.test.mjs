import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectDuplicates, listLocaleDirectories, pathExists, toDocPath, walkMarkdownFiles } from './check-i18n-duplicates.mjs'

let root
let docsRoot
let i18nRoot

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'check-i18n-duplicates-test-'))
    docsRoot = join(root, 'docs')
    i18nRoot = join(docsRoot, 'i18n')
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(join(root, rel.split(/[\\/]/).slice(0, -1).join('/')), { recursive: true })
    writeFileSync(file, content)
}

describe('pathExists', () => {
    it('detects existing and missing paths', async () => {
        write('docs/index.md', '# x')
        expect(await pathExists(join(root, 'docs'))).toBe(true)
        expect(await pathExists(join(root, 'nope'))).toBe(false)
    })
})

describe('listLocaleDirectories', () => {
    it('returns only locale-named directories', async () => {
        write('docs/en-US/a.md', '# x')
        write('docs/zh-CN/b.md', '# x')
        write('docs/i18n/en-US/c.md', '# x')
        write('docs/standards/d.md', '# x')

        const docsLocales = await listLocaleDirectories(docsRoot)
        expect(docsLocales).toEqual(['en-US', 'zh-CN'])

        const i18nLocales = await listLocaleDirectories(i18nRoot)
        expect(i18nLocales).toEqual(['en-US'])
    })

    it('returns empty for missing base dir', async () => {
        expect(await listLocaleDirectories(join(root, 'nope'))).toEqual([])
    })
})

describe('walkMarkdownFiles', () => {
    it('walks nested markdown files recursively', async () => {
        write('docs/i18n/en-US/index.md', '# x')
        write('docs/i18n/en-US/guide/quick-start.md', '# x')
        write('docs/i18n/en-US/guide/deep/page.md', '# x')
        write('docs/i18n/en-US/notes.txt', 'not md')

        const files = await walkMarkdownFiles(join(root, 'docs/i18n/en-US'))
        expect(files.sort()).toEqual([
            'guide/deep/page.md',
            'guide/quick-start.md',
            'index.md',
        ])
    })
})

describe('toDocPath', () => {
    it('joins segments with posix separators and normalizes backslashes', () => {
        expect(toDocPath('docs', 'en-US', 'guide\\quick-start.md')).toBe('docs/en-US/guide/quick-start.md')
    })
})

describe('collectDuplicates', () => {
    it('returns empty when no legacy locale dir exists', async () => {
        write('docs/i18n/en-US/index.md', '# x')
        const duplicates = await collectDuplicates(docsRoot, i18nRoot)
        expect(duplicates).toEqual([])
    })

    it('flags files duplicated in legacy and i18n dirs', async () => {
        // 旧目录回流：docs/en-US/ 与 docs/i18n/en-US/ 存在同一翻译页
        write('docs/en-US/guide/quick-start.md', '# en legacy')
        write('docs/i18n/en-US/guide/quick-start.md', '# en i18n')
        write('docs/i18n/en-US/index.md', '# en ok')
        write('docs/zh-CN/guide/quick-start.md', '# zh legacy only')

        const duplicates = await collectDuplicates(docsRoot, i18nRoot)
        expect(duplicates).toHaveLength(1)
        expect(duplicates[0]).toMatchObject({
            locale: 'en-US',
            relativeFile: 'guide/quick-start.md',
            legacyPath: 'docs/en-US/guide/quick-start.md',
            translatedPath: 'docs/i18n/en-US/guide/quick-start.md',
        })
    })
})
