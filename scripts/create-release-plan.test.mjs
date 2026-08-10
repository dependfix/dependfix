import { describe, expect, it } from 'vitest'
import { buildReleasePlan, parseCommit, pathToPkg, renderChangeset, stripDevTags, toBump } from './create-release-plan.mjs'

describe('parseCommit', () => {
    it('parses type and description', () => {
        expect(parseCommit('feat(cli): 新增功能')).toEqual({
            type: 'feat',
            scope: 'cli',
            breaking: false,
            description: '新增功能',
        })
    })

    it('parses commit without scope', () => {
        const parsed = parseCommit('fix: 修复问题')
        expect(parsed).toMatchObject({ type: 'fix', scope: null })
    })

    it('detects breaking via bang suffix', () => {
        expect(parseCommit('feat!: 破坏性变更')).toMatchObject({ type: 'feat', breaking: true })
        expect(parseCommit('feat(core)!: 破坏性变更')).toMatchObject({ type: 'feat', scope: 'core', breaking: true })
    })

    it('detects breaking via BREAKING CHANGE footer', () => {
        expect(parseCommit('feat: 变更', 'BREAKING CHANGE: 不再兼容旧 API')).toMatchObject({ breaking: true })
        expect(parseCommit('feat: 变更', 'BREAKING-CHANGE: 不再兼容旧 API')).toMatchObject({ breaking: true })
        expect(parseCommit('feat: 变更', '无 breaking 说明')).toMatchObject({ breaking: false })
    })

    it('returns null for non-conventional subject', () => {
        expect(parseCommit('Merge branch master')).toBeNull()
        expect(parseCommit('v0.2.0')).toBeNull()
    })
})

describe('toBump', () => {
    it('maps feat to minor and fix/perf/revert to patch', () => {
        expect(toBump({ type: 'feat', breaking: false }, false)).toBe('minor')
        expect(toBump({ type: 'fix', breaking: false }, false)).toBe('patch')
        expect(toBump({ type: 'perf', breaking: false }, false)).toBe('patch')
        expect(toBump({ type: 'revert', breaking: false }, false)).toBe('patch')
    })

    it('ignores non-release types', () => {
        for (const type of ['refactor', 'docs', 'chore', 'build', 'ci', 'test', 'style']) {
            expect(toBump({ type, breaking: false }, true)).toBeNull()
        }
    })

    it('bumps breaking to major only after 1.0.0 (preMajor 0.x → minor)', () => {
        expect(toBump({ type: 'fix', breaking: true }, true)).toBe('minor')
        expect(toBump({ type: 'feat', breaking: true }, true)).toBe('minor')
        expect(toBump({ type: 'fix', breaking: true }, false)).toBe('major')
    })
})

describe('pathToPkg', () => {
    it('maps package paths to publish packages', () => {
        expect(pathToPkg('packages/core/src/utils/index.ts')).toBe('@dependfix/core')
        expect(pathToPkg('packages/core')).toBe('@dependfix/core')
        expect(pathToPkg('packages/cli/package.json')).toBe('dependfix')
        expect(pathToPkg('packages/skills/dependfix-remediator/SKILL.md')).toBe('@dependfix/skills')
        expect(pathToPkg('packages/mcp/src/index.ts')).toBe('@dependfix/mcp')
    })

    it('returns null for non-package paths', () => {
        expect(pathToPkg('docs/guide/release.md')).toBeNull()
        expect(pathToPkg('package.json')).toBeNull()
        expect(pathToPkg('scripts/changelog.mjs')).toBeNull()
        expect(pathToPkg('apps/platform/src/index.ts')).toBeNull()
    })
})

describe('buildReleasePlan', () => {
    it('takes the highest bump per package', () => {
        const commits = [
            { type: 'fix', subject: 'fix(core): a', packages: ['@dependfix/core'], breaking: false },
            { type: 'feat', subject: 'feat(core): b', packages: ['@dependfix/core'], breaking: false },
            { type: 'feat', subject: 'feat(cli): c', packages: ['dependfix'], breaking: false },
        ]
        expect(buildReleasePlan(commits, false)).toEqual(new Map([
            ['@dependfix/core', 'minor'],
            ['dependfix', 'minor'],
        ]))
    })

    it('ignores commits without package mapping and non-release types', () => {
        const commits = [
            { type: 'docs', subject: 'docs: x', packages: [], breaking: false },
            { type: 'refactor', subject: 'refactor(core): y', packages: ['@dependfix/core'], breaking: false },
        ]
        expect(buildReleasePlan(commits, true).size).toBe(0)
    })
})

describe('renderChangeset', () => {
    it('renders frontmatter with single-quoted package names', () => {
        const plan = new Map([
            ['dependfix', 'minor'],
            ['@dependfix/core', 'minor'],
        ])
        expect(renderChangeset(plan, 'feat: 新功能')).toBe('---\n\'dependfix\': minor\n\'@dependfix/core\': minor\n---\n\nfeat: 新功能\n')
    })
})

describe('stripDevTags', () => {
    // 注意：以下用例的编号标记（T506/C21/C8）是 stripDevTags 清洗功能的输入样例数据，
    // 用于验证编号标记被正确删除，非开发流程编号残留
    it('removes dev-flow tags and trailing colon', () => {
        expect(stripDevTags('feat(cli): AI 链路（T506：config 接入）')).toBe('feat(cli): AI 链路（config 接入）')
        expect(stripDevTags('feat: 登记 C21（评估）')).toBe('feat: 登记 （评估）')
    })

    it('collapses leftover empty parens and extra whitespace', () => {
        expect(stripDevTags('feat: 变更（C8）完成')).toBe('feat: 变更 完成')
        expect(stripDevTags('fix:  a   b')).toBe('fix: a b')
    })

    it('keeps plain text unchanged', () => {
        expect(stripDevTags('feat(cli): 新增功能')).toBe('feat(cli): 新增功能')
    })
})
