import { describe, expect, it } from 'vitest'
import { buildVerifySpecs, collectFailures, verifyChangelog } from './verify-changelog.mjs'

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
})
