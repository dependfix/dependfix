import { describe, expect, it } from 'vitest'
import {
    filterExplicitRepositories,
    matchesRepoExclude,
    matchesRepoGlob,
    matchesRepoInclude,
    matchesTopicsExclude,
    MAX_GLOB_PATTERN_LENGTH,
    repoGlobToRegExp,
    type RepoPolicy,
} from './repo-policy'

describe('repoGlobToRegExp / matchesRepoGlob', () => {
    it('matches owner/* patterns', () => {
        expect(matchesRepoGlob('owner/*', 'owner/repo-a')).toBe(true)
        expect(matchesRepoGlob('owner/*', 'owner/pkg-1')).toBe(true)
        expect(matchesRepoGlob('owner/*', 'other/repo-a')).toBe(false)
    })

    it('matches owner/pkg-* prefix patterns', () => {
        expect(matchesRepoGlob('owner/pkg-*', 'owner/pkg-1')).toBe(true)
        expect(matchesRepoGlob('owner/pkg-*', 'owner/pkg-foo')).toBe(true)
        expect(matchesRepoGlob('owner/pkg-*', 'owner/app-1')).toBe(false)
        expect(matchesRepoGlob('owner/pkg-*', 'other/pkg-1')).toBe(false)
    })

    it('does not cross the owner/repo separator with *', () => {
        expect(matchesRepoGlob('*/*', 'a/b')).toBe(true)
        expect(matchesRepoGlob('*/*', 'a/b/c')).toBe(false)
        expect(matchesRepoGlob('a/*', 'a/x/y')).toBe(false)
    })

    it('matches ? single char', () => {
        expect(matchesRepoGlob('a/repo-?', 'a/repo-1')).toBe(true)
        expect(matchesRepoGlob('a/repo-?', 'a/repo-12')).toBe(false)
    })

    it('treats literal regex metacharacters as literals', () => {
        expect(matchesRepoGlob('a/re.po', 'a/repo')).toBe(false)
        expect(matchesRepoGlob('a/re.po', 'a/re.po')).toBe(true)
    })

    it('matches exact literal without wildcards', () => {
        expect(matchesRepoGlob('a/b', 'a/b')).toBe(true)
        expect(matchesRepoGlob('a/b', 'a/b-c')).toBe(false)
    })

    it('is case sensitive', () => {
        expect(matchesRepoGlob('A/Repo', 'a/repo')).toBe(false)
    })

    it('compiles glob to anchored regex (full match)', () => {
        const re = repoGlobToRegExp('owner/pkg-*')
        expect(re.source).toMatch(/^\^/)
        expect(re.source).toMatch(/\$$/)
    })

    it('rejects overly long patterns (R6 hardening)', () => {
        expect(() => repoGlobToRegExp('a/'.repeat(MAX_GLOB_PATTERN_LENGTH))).toThrow(/exceeds/)
    })
})

describe('topic matching case-insensitivity (R5)', () => {
    it('matchesTopicsExclude is case-insensitive', () => {
        const policy: RepoPolicy = { topicsExclude: ['Deprecated'] }
        expect(matchesTopicsExclude(policy, ['deprecated'])).toBe(true)
        expect(matchesTopicsExclude(policy, ['node', 'DEPRECATED'])).toBe(true)
        expect(matchesTopicsExclude(policy, ['node'])).toBe(false)
    })
})

describe('repo policy predicates', () => {
    const policy: RepoPolicy = {
        include: ['org/*'],
        exclude: ['org/legacy-*', 'blocked/repo'],
        topicsExclude: ['deprecated', 'archived'],
    }

    it('matchesRepoInclude: empty include allows all; non-empty requires hit', () => {
        expect(matchesRepoInclude({}, 'any/repo')).toBe(true)
        expect(matchesRepoInclude(policy, 'org/app')).toBe(true)
        expect(matchesRepoInclude(policy, 'other/app')).toBe(false)
    })

    it('matchesRepoExclude: hits any exclude pattern', () => {
        expect(matchesRepoExclude(policy, 'org/legacy-1')).toBe(true)
        expect(matchesRepoExclude(policy, 'blocked/repo')).toBe(true)
        expect(matchesRepoExclude(policy, 'org/app')).toBe(false)
    })

    it('matchesTopicsExclude: blocks repos containing any blocked topic', () => {
        expect(matchesTopicsExclude(policy, ['node', 'deprecated'])).toBe(true)
        expect(matchesTopicsExclude(policy, ['node'])).toBe(false)
    })

    it('empty policy does not block anything', () => {
        expect(matchesRepoInclude({}, 'a/b')).toBe(true)
        expect(matchesRepoExclude({}, 'a/b')).toBe(false)
        expect(matchesTopicsExclude({}, ['x'])).toBe(false)
    })
})

describe('filterExplicitRepositories', () => {
    it('explicit list is constrained by exclude only (include not applied)', () => {
        const policy: RepoPolicy = {
            include: ['org/*'], // 不应影响显式列表
            exclude: ['org/legacy-*'],
        }

        const filtered = filterExplicitRepositories(policy, [
            'other/repo', // 不在 include 中，但仍保留（显式优先）
            'org/legacy-1', // 命中 exclude → 剔除
            'org/app',
        ])

        expect(filtered).toEqual(['other/repo', 'org/app'])
    })

    it('keeps explicit list unchanged when no exclude', () => {
        expect(filterExplicitRepositories({}, ['a/b', 'c/d'])).toEqual(['a/b', 'c/d'])
    })
})

describe('policy predicate composition (discovery filters before probing)', () => {
    // 组合语义由 repository-discovery 集成测试验证（策略在探测前应用）；
    // 此处锁定三个谓词的组合判定：include + exclude + topicsExclude，exclude 胜出
    const repos = [
        { fullName: 'org/app', topics: ['node'] },
        { fullName: 'org/legacy-1', topics: ['node'] },
        { fullName: 'org/deprecated-app', topics: ['node', 'deprecated'] },
        { fullName: 'other/app', topics: ['node'] },
    ]

    it('include + exclude + topicsExclude combination keeps only org/app', () => {
        const policy: RepoPolicy = {
            include: ['org/*'],
            exclude: ['org/legacy-*'],
            topicsExclude: ['deprecated'],
        }

        const kept = repos.filter((r) => (
            matchesRepoInclude(policy, r.fullName)
            && !matchesRepoExclude(policy, r.fullName)
            && !matchesTopicsExclude(policy, r.topics)
        ))
        expect(kept.map((r) => r.fullName)).toEqual(['org/app'])
    })

    it('include + exclude conflict: exclude wins', () => {
        const policy: RepoPolicy = {
            include: ['org/legacy-1'],
            exclude: ['org/legacy-*'],
        }

        const kept = repos.filter((r) => (
            matchesRepoInclude(policy, r.fullName)
            && !matchesRepoExclude(policy, r.fullName)
        ))
        expect(kept.map((r) => r.fullName)).not.toContain('org/legacy-1')
    })
})
