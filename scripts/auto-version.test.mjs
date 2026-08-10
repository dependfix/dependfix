import { describe, expect, it } from 'vitest'
import { getChangedPackages, hasStagedChanges, readHeadFile, resolveNotes } from './auto-version.mjs'

// 模拟发布包清单（结构对齐 packages.config.mjs）
const packages = [
    { path: 'packages/core', pkg: '@dependfix/core', changelog: 'packages/core/CHANGELOG.md' },
    { path: 'packages/cli', pkg: 'dependfix', changelog: 'packages/cli/CHANGELOG.md', rootChangelog: true },
    { path: 'packages/mcp', pkg: '@dependfix/mcp', changelog: 'packages/mcp/CHANGELOG.md' },
]

const rootChangelog = [
    '# dependfix',
    '',
    '# [0.2.0](https://github.com/dependfix/dependfix/compare/0.1.0...0.2.0) (2026-08-08)',
    '',
    '### ✨ 新功能',
    '',
    '* **cli:** 新增能力 ([def5678](https://github.com/dependfix/dependfix/commit/def5678))',
    '',
].join('\n')

const coreChangelog = [
    '# @dependfix/core',
    '',
    '# [0.3.0](https://github.com/dependfix/dependfix/compare/0.2.0...0.3.0) (2026-08-10)',
    '',
    '### ✨ 新功能',
    '',
    '* **core:** 新 API ([aaa1111](https://github.com/dependfix/dependfix/commit/aaa1111))',
    '',
].join('\n')

describe('getChangedPackages', () => {
    it('lists packages whose workspace version differs from HEAD', () => {
        const changed = getChangedPackages(
            (path) => (path === 'packages/core' ? '0.3.0' : '0.2.0'),
            (path) => '0.2.0',
            packages,
        )
        expect(changed).toEqual([{ pkg: '@dependfix/core', version: '0.3.0' }])
    })

    it('treats missing HEAD package as 0.0.0 (new package)', () => {
        const changed = getChangedPackages(
            (path) => '0.1.0',
            (path) => null,
            packages,
        )
        expect(changed).toHaveLength(3)
    })

    it('returns empty when versions match', () => {
        const changed = getChangedPackages(() => '0.2.0', () => '0.2.0', packages)
        expect(changed).toEqual([])
    })
})

describe('readHeadFile', () => {
    it('returns content when HEAD has the file', () => {
        const git = (args) => (args.startsWith('show HEAD:') ? '{"version":"0.2.0"}' : '')
        expect(readHeadFile(git, 'packages/cli/package.json')).toBe('{"version":"0.2.0"}')
    })

    it('returns null when HEAD lacks the file', () => {
        const git = (args) => {
            if (args.startsWith('show HEAD:')) {
                throw new Error('path does not exist')
            }
            return ''
        }
        expect(readHeadFile(git, 'packages/mcp/package.json')).toBeNull()
    })
})

describe('hasStagedChanges', () => {
    it('returns false when git diff --cached --quiet exits 0', () => {
        expect(hasStagedChanges(() => '')).toBe(false)
    })

    it('returns true when git diff --cached --quiet exits non-zero', () => {
        const git = () => {
            throw new Error('exit 1')
        }
        expect(hasStagedChanges(git)).toBe(true)
    })
})

describe('resolveNotes', () => {
    const files = { byPkg: { '@dependfix/core': 'packages/core/CHANGELOG.md' } }
    const readFile = (path) => (path === files.byPkg['@dependfix/core'] ? coreChangelog : '')

    it('prefers root changelog section', () => {
        const notes = resolveNotes(rootChangelog, files, { pkg: 'dependfix', version: '0.2.0' }, readFile)
        expect(notes).toContain('# [0.2.0]')
        expect(notes).toContain('新增能力')
    })

    it('falls back to anchor package changelog when root section missing (core-only)', () => {
        const notes = resolveNotes(rootChangelog, files, { pkg: '@dependfix/core', version: '0.3.0' }, readFile)
        expect(notes).toContain('新 API')
    })

    it('returns null when neither root nor package changelog has the version', () => {
        const notes = resolveNotes(rootChangelog, files, { pkg: '@dependfix/core', version: '9.9.9' }, readFile)
        expect(notes).toBeNull()
    })
})
