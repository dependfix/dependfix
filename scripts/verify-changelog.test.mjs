import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildVerifySpecs, collectFailures, main, verifyChangelog } from './verify-changelog.mjs'

// main() 依赖真实 fs（readFileSync 读 package.json 与 changelog），统一 mock
vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))

// 模拟 changelog 内容（minor 段 + patch 段 + 历史段，与 create-github-release.test.mjs 同款形态）
const changelog = [
    '# dependfix',
    '',
    '## [0.2.1](https://github.com/dependfix/dependfix/compare/0.2.0...0.2.1) (2026-08-10)',
    '',
    '### 🐛 Bug 修复',
    '',
    '* **cli:** 修复问题 ([abc1234](https://github.com/dependfix/dependfix/commit/abc1234))',
    '',
    '# [0.2.0](https://github.com/dependfix/dependfix/compare/0.1.0...0.2.0) (2026-08-08)',
    '',
    '### ✨ 新功能',
    '',
    '* **cli:** 新增能力 ([def5678](https://github.com/dependfix/dependfix/commit/def5678))',
    '',
].join('\n')

describe('verifyChangelog', () => {
    it('passes when the version section exists (minor heading)', () => {
        expect(verifyChangelog(changelog, '0.2.0')).toBe(true)
    })

    it('passes when the version section exists (patch heading)', () => {
        expect(verifyChangelog(changelog, '0.2.1')).toBe(true)
    })

    it('fails when the version section is missing', () => {
        expect(verifyChangelog(changelog, '0.3.0')).toBe(false)
    })

    it('fails for empty content', () => {
        expect(verifyChangelog('', '0.2.0')).toBe(false)
    })
})

describe('buildVerifySpecs', () => {
    const packages = [
        { path: 'packages/core', pkg: '@dependfix/core', changelog: 'packages/core/CHANGELOG.md' },
        { path: 'packages/cli', pkg: 'dependfix', changelog: 'packages/cli/CHANGELOG.md', rootChangelog: true },
        { path: 'packages/mcp', pkg: '@dependfix/mcp', changelog: 'packages/mcp/CHANGELOG.md' },
    ]

    it('builds specs for each package changelog plus root', () => {
        const specs = buildVerifySpecs(packages, (path) => (path === 'packages/cli' ? '0.2.1' : '0.1.0'))
        expect(specs).toEqual([
            { file: 'packages/core/CHANGELOG.md', version: '0.1.0' },
            { file: 'packages/cli/CHANGELOG.md', version: '0.2.1' },
            { file: 'packages/mcp/CHANGELOG.md', version: '0.1.0' },
            // 根级 CHANGELOG 锚 = 主交付物（rootChangelog 包）版本
            { file: 'CHANGELOG.md', version: '0.2.1' },
        ])
    })
})

describe('collectFailures', () => {
    const specs = [
        { file: 'packages/core/CHANGELOG.md', version: '0.2.0' },
        { file: 'packages/cli/CHANGELOG.md', version: '0.3.0' },
        { file: 'missing/CHANGELOG.md', version: '0.1.0' },
    ]
    const readFile = (file) => {
        if (file === 'missing/CHANGELOG.md') {
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }
        return changelog
    }

    it('collects missing-section failures', () => {
        // 仅缺段场景（不含缺失文件，ENOENT 单独用例覆盖）
        const okSpecs = [{ file: 'packages/core/CHANGELOG.md', version: '0.2.0' }, { file: 'packages/cli/CHANGELOG.md', version: '0.3.0' }]
        const failures = collectFailures(okSpecs, readFile)
        expect(failures).toHaveLength(1)
        expect(failures[0]).toContain('packages/cli/CHANGELOG.md 缺少版本段 0.3.0')
    })

    it('reports missing file separately with ENOENT message', () => {
        const failures = collectFailures(specs, readFile)
        expect(failures.some((f) => f.includes('missing/CHANGELOG.md 不存在'))).toBe(true)
        // 缺段 + 不存在各计一项（specs 全量场景共 2 项）
        expect(failures).toHaveLength(2)
    })

    it('returns empty when all pass', () => {
        const okSpecs = [{ file: 'packages/core/CHANGELOG.md', version: '0.2.0' }]
        expect(collectFailures(okSpecs, readFile)).toEqual([])
    })

    it('rethrows non-ENOENT read errors (fail-closed, not silently skipped)', () => {
        const readFile = () => {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
        }
        expect(() => collectFailures([{ file: 'packages/core/CHANGELOG.md', version: '0.2.0' }], readFile)).toThrow('permission denied')
    })
})

describe('main', () => {
    const changelogWithSection = [
        '# dependfix',
        '',
        '## [0.2.1](https://github.com/dependfix/dependfix/compare/0.2.0...0.2.1) (2026-08-12)',
        '',
        '### ✨ 新功能',
        '',
        '* **cli:** 发布能力 ([abc1234](https://github.com/dependfix/dependfix/commit/abc1234))',
        '',
    ].join('\n')

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('passes when all package and root changelogs contain the version sections', () => {
        vi.mocked(readFileSync).mockImplementation((file) => {
            if (String(file).endsWith('package.json')) {
                return JSON.stringify({ version: '0.2.1' })
            }
            return changelogWithSection
        })
        main()
        expect(console.log).toHaveBeenCalledWith('changelog is up to date')
        expect(console.error).not.toHaveBeenCalled()
    })

    it('reports failures with ::error:: and exits 1 when a section is missing', () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
        vi.mocked(readFileSync).mockImplementation((file) => {
            if (String(file).endsWith('package.json')) {
                return JSON.stringify({ version: '9.9.9' })
            }
            return changelogWithSection
        })
        main()
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('::error::'))
        expect(exitSpy).toHaveBeenCalledWith(1)
    })
})
