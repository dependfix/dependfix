import { describe, expect, it } from 'vitest'
import { buildReleasePlan, extractSection } from './create-github-release.mjs'

// 模拟 changelog 内容（根级：minor 段 + patch 段 + 历史段）
const rootChangelog = [
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

const files = {
    root: 'CHANGELOG.md',
    byPkg: { '@dependfix/core': 'packages/core/CHANGELOG.md' },
}

const fileContents = new Map([
    [files.root, rootChangelog],
    [files.byPkg['@dependfix/core'], coreChangelog],
])
const readFile = (path) => fileContents.get(path) ?? ''

describe('extractSection', () => {
    it('extracts patch section with ## heading', () => {
        const section = extractSection(rootChangelog, '0.2.1')
        expect(section).toContain('## [0.2.1]')
        expect(section).toContain('修复问题')
        // 不含下一个版本段的标题行（compare URL 含旧版本号属正常内容，不断言）
        expect(section).not.toContain('# [0.2.0]')
    })

    it('extracts minor section with # heading', () => {
        const section = extractSection(rootChangelog, '0.2.0')
        expect(section).toContain('# [0.2.0]')
        expect(section).toContain('新增能力')
        expect(section).not.toContain('## [0.2.1]')
    })

    it('returns null when version not found', () => {
        expect(extractSection(rootChangelog, '9.9.9')).toBeNull()
    })

    it('returns null for content without version sections', () => {
        expect(extractSection('# 标题\n\n正文内容', '0.1.0')).toBeNull()
    })
})

describe('buildReleasePlan', () => {
    it('creates plan with root changelog section and version matrix', () => {
        const result = {
            published: [{ pkg: 'dependfix', version: '0.2.1' }, { pkg: '@dependfix/core', version: '0.3.0' }],
            anchorVersion: '0.2.1',
            anchorPkg: 'dependfix',
        }
        const plan = buildReleasePlan(result, files, { readFile })
        expect(plan.action).toBe('create')
        expect(plan.tag).toBe('v0.2.1')
        expect(plan.prerelease).toBe(true)
        expect(plan.notes).toContain('## 本轮发布包')
        expect(plan.notes).toContain('- dependfix@0.2.1')
        expect(plan.notes).toContain('- @dependfix/core@0.3.0')
        expect(plan.notes).toContain('修复问题')
    })

    it('falls back to anchor package changelog when root section missing (core-only)', () => {
        const result = {
            published: [{ pkg: '@dependfix/core', version: '0.3.0' }],
            anchorVersion: '0.3.0',
            anchorPkg: '@dependfix/core',
        }
        const plan = buildReleasePlan(result, files, { readFile })
        expect(plan.action).toBe('create')
        expect(plan.tag).toBe('v0.3.0')
        expect(plan.notes).toContain('@dependfix/core 包级 CHANGELOG')
        expect(plan.notes).toContain('新 API')
    })

    it('marks prerelease only for 0.x versions', () => {
        const result = { published: [{ pkg: 'dependfix', version: '1.0.0' }], anchorVersion: '1.0.0', anchorPkg: 'dependfix' }
        const plan = buildReleasePlan(result, files, { readFile })
        expect(plan.prerelease).toBe(false)
    })

    it('skips when nothing published', () => {
        const plan = buildReleasePlan({ published: [], anchorVersion: null, anchorPkg: null }, files, { readFile })
        expect(plan.action).toBe('skip-no-published')
    })

    it('skips when no changelog section found', () => {
        const result = {
            published: [{ pkg: '@dependfix/skills', version: '0.5.0' }],
            anchorVersion: '0.5.0',
            anchorPkg: '@dependfix/skills',
        }
        const plan = buildReleasePlan(result, files, { readFile })
        expect(plan.action).toBe('skip-no-notes')
    })

    it('handles missing result file content gracefully', () => {
        const plan = buildReleasePlan(null, files, { readFile })
        expect(plan.action).toBe('skip-no-published')
    })
})
