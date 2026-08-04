import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import {
    buildUpgradeGroups,
    extractMainPackage,
    isMainPackagePresent,
    matchesPattern,
    parseDependabotGroups,
} from './fix-grouping'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function alert(packageName: string): NormalizedSecurityAlert {
    return {
        id: 1,
        source: 'dependabot',
        repository: 'foo/bar',
        defaultBranch: '',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName,
        manifestPath: '',
        ruleId: 'GHSA-xxx',
        summary: 'test',
        htmlUrl: 'https://github.com/foo/bar',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion: '9.9.9',
        dependencyType: 'direct',
    }
}

function makeWorkDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'dependfix-grouping-'))
    return dir
}

/** 写入 .github/dependabot.yml（自动创建 .github 目录） */
function writeDependabotYml(dir: string, content: string): void {
    const githubDir = join(dir, '.github')
    mkdirSync(githubDir, { recursive: true })
    writeFileSync(join(githubDir, 'dependabot.yml'), content, 'utf-8')
}

const workDirs: string[] = []
function trackWorkDir(): string {
    const dir = makeWorkDir()
    workDirs.push(dir)
    return dir
}

afterEach(() => {
    for (const dir of workDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

// ---------------------------------------------------------------------------
// matchesPattern
// ---------------------------------------------------------------------------

describe('matchesPattern', () => {
    it('matches exact package names', () => {
        expect(matchesPattern('lodash', 'lodash')).toBe(true)
        expect(matchesPattern('lodash-es', 'lodash')).toBe(false)
    })

    it('matches @scope/* wildcard', () => {
        expect(matchesPattern('@nuxt/eslint', '@nuxt/*')).toBe(true)
        expect(matchesPattern('@nuxt/test-utils', '@nuxt/*')).toBe(true)
        expect(matchesPattern('nuxt', '@nuxt/*')).toBe(false)
    })

    it('matches prefix* wildcard (glob: * matches zero or more chars)', () => {
        expect(matchesPattern('markdown-it-anchor', 'markdown-it-*')).toBe(true)
        // 前缀含 `-` 时 `markdown-it-*` 不匹配本体（glob 语义）
        expect(matchesPattern('markdown-it', 'markdown-it-*')).toBe(false)
        // `markdown-it*` 的 `*` 匹配零字符 → 匹配本体
        expect(matchesPattern('markdown-it', 'markdown-it*')).toBe(true)
        expect(matchesPattern('markdown-it-anchor', 'markdown-it*')).toBe(true)
    })

    it('rejects bare * to prevent over-grouping', () => {
        expect(matchesPattern('lodash', '*')).toBe(false)
    })

    it('rejects mid-pattern wildcards', () => {
        expect(matchesPattern('foo-bar', 'foo*bar')).toBe(false)
    })

    it('rejects empty patterns', () => {
        expect(matchesPattern('lodash', '')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// parseDependabotGroups
// ---------------------------------------------------------------------------

describe('parseDependabotGroups', () => {
    it('parses npm ecosystem groups from .github/dependabot.yml', () => {
        const dir = trackWorkDir()
        writeDependabotYml(
            dir,
            [
                'version: 2',
                'updates:',
                '  - package-ecosystem: npm',
                '    directory: "/"',
                '    schedule:',
                '      interval: weekly',
                '    groups:',
                '      eslint-stack:',
                '        patterns:',
                '          - "eslint"',
                '          - "eslint-plugin-vue"',
                '      typescript-checking:',
                '        patterns:',
                '          - "typescript"',
                '          - "@typescript-eslint/*"',
                '          - "*"',
                '  - package-ecosystem: github-actions',
                '    directory: "/"',
                '    groups:',
                '      actions:',
                '        patterns:',
                '          - "actions/*"',
                '',
            ].join('\n'),
        )

        const groups = parseDependabotGroups(dir)
        expect(groups['eslint-stack']).toEqual(['eslint', 'eslint-plugin-vue'])
        // 裸 `*` 被过滤；github-actions ecosystem 不纳入
        expect(groups['typescript-checking']).toEqual(['typescript', '@typescript-eslint/*'])
        expect(groups['actions']).toBeUndefined()
    })

    it('returns empty object when dependabot.yml is missing', () => {
        const dir = trackWorkDir()
        expect(parseDependabotGroups(dir)).toEqual({})
    })

    it('returns empty object on malformed YAML', () => {
        const dir = trackWorkDir()
        writeDependabotYml(dir, '{{{{ not yaml')
        expect(parseDependabotGroups(dir)).toEqual({})
    })

    it('returns empty object when there are no groups', () => {
        const dir = trackWorkDir()
        writeDependabotYml(dir, ['version: 2', 'updates:', '  - package-ecosystem: npm', '    directory: "/"', ''].join('\n'))
        expect(parseDependabotGroups(dir)).toEqual({})
    })

    it('supports dependabot.yaml variant', () => {
        const dir = trackWorkDir()
        const githubDir = join(dir, '.github')
        mkdirSync(githubDir, { recursive: true })
        writeFileSync(
            join(githubDir, 'dependabot.yaml'),
            [
                'version: 2',
                'updates:',
                '  - package-ecosystem: npm',
                '    groups:',
                '      db:',
                '        patterns:',
                '          - "lodash"',
                '',
            ].join('\n'),
            'utf-8',
        )
        expect(parseDependabotGroups(dir)).toEqual({ db: ['lodash'] })
    })

    it('ignores unsafe group names', () => {
        const dir = trackWorkDir()
        writeDependabotYml(
            dir,
            [
                'version: 2',
                'updates:',
                '  - package-ecosystem: npm',
                '    groups:',
                '      __proto__:',
                '        patterns:',
                '          - "lodash"',
                '',
            ].join('\n'),
        )
        expect(parseDependabotGroups(dir)).toEqual({})
    })
})

// ---------------------------------------------------------------------------
// extractMainPackage
// ---------------------------------------------------------------------------

describe('extractMainPackage', () => {
    it('extracts main package from @types/*', () => {
        expect(extractMainPackage('@types/express')).toBe('express')
        expect(extractMainPackage('@types/markdown-it')).toBe('markdown-it')
    })

    it('restores scoped main package from @types double-underscore convention', () => {
        // TypeScript 官方约定：scoped 主包 `@koa/router` 的类型包为 `@types/koa__router`
        expect(extractMainPackage('@types/koa__router')).toBe('@koa/router')
        expect(extractMainPackage('@types/node__test')).toBe('@node/test')
    })

    it('returns null for non-@types packages', () => {
        expect(extractMainPackage('express')).toBeNull()
        expect(extractMainPackage('@scope/foo')).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// isMainPackagePresent
// ---------------------------------------------------------------------------

describe('isMainPackagePresent', () => {
    it('finds main package in dependencies', () => {
        const pkg = { dependencies: { express: '^4.0.0' } }
        expect(isMainPackagePresent(pkg, 'no-lockfile', 'express')).toBe(true)
    })

    it('finds main package in devDependencies', () => {
        const pkg = { devDependencies: { vitest: '^3.0.0' } }
        expect(isMainPackagePresent(pkg, 'no-lockfile', 'vitest')).toBe(true)
    })

    it('finds main package in pnpm overrides', () => {
        const pkg = { pnpm: { overrides: { 'fast-uri': '^3.1.5' } } }
        expect(isMainPackagePresent(pkg, 'no-lockfile', 'fast-uri')).toBe(true)
    })

    it('finds main package in lockfile (indirect dependency)', () => {
        const dir = trackWorkDir()
        writeFileSync(join(dir, 'pnpm-lock.yaml'), '/express/4.21.0:\n', 'utf-8')
        expect(isMainPackagePresent({}, join(dir, 'pnpm-lock.yaml'), 'express')).toBe(true)
    })

    it('returns false when main package is absent everywhere', () => {
        const dir = trackWorkDir()
        expect(isMainPackagePresent({}, join(dir, 'pnpm-lock.yaml'), 'express')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// buildUpgradeGroups
// ---------------------------------------------------------------------------

describe('buildUpgradeGroups', () => {
    it('assigns unmatched packages to single groups (backward compatible)', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups([alert('vite'), alert('fast-uri')], { workDir: dir })

        expect(result.groups.map((g) => g.source)).toEqual(['single', 'single'])
        expect(result.groups.map((g) => g.packages)).toEqual([['vite'], ['fast-uri']])
        expect(result.cleanupCandidates).toEqual([])
    })

    it('applies explicit groups with the highest priority', () => {
        const dir = trackWorkDir()
        writeDependabotYml(
            dir,
            [
                'version: 2',
                'updates:',
                '  - package-ecosystem: npm',
                '    groups:',
                '      db:',
                '        patterns:',
                '          - "lodash"',
                '',
            ].join('\n'),
        )
        const result = buildUpgradeGroups(
            [alert('lodash'), alert('vite')],
            { workDir: dir, explicitGroups: { custom: ['lodash'] } },
        )

        expect(result.groups).toHaveLength(2)
        expect(result.groups[0]).toMatchObject({ name: 'custom', source: 'explicit', packages: ['lodash'] })
        // dependabot group 中的 lodash 已被显式分组抢占，不重复分组
        expect(result.groups[1]).toMatchObject({ name: 'vite', source: 'single' })
    })

    it('applies dependabot groups patterns', () => {
        const dir = trackWorkDir()
        writeDependabotYml(
            dir,
            [
                'version: 2',
                'updates:',
                '  - package-ecosystem: npm',
                '    groups:',
                '      nuxt-stack:',
                '        patterns:',
                '          - "nuxt"',
                '          - "@nuxt/*"',
                '',
            ].join('\n'),
        )
        const result = buildUpgradeGroups(
            [alert('nuxt'), alert('@nuxt/eslint'), alert('vite')],
            { workDir: dir },
        )

        expect(result.groups).toHaveLength(2)
        expect(result.groups[0]).toMatchObject({
            name: 'nuxt-stack',
            source: 'dependabot',
            packages: ['nuxt', '@nuxt/eslint'],
        })
        expect(result.groups[1]).toMatchObject({ name: 'vite', source: 'single' })
    })

    it('groups packages by scope heuristic', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups(
            [alert('@octokit/rest'), alert('@octokit/core'), alert('vite')],
            { workDir: dir },
        )

        const scopeGroup = result.groups.find((g) => g.source === 'scope')
        expect(scopeGroup).toMatchObject({ name: '@octokit', packages: ['@octokit/rest', '@octokit/core'] })
        expect(result.groups.find((g) => g.source === 'single')?.packages).toEqual(['vite'])
    })

    it('groups packages by prefix heuristic with size limit', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups(
            [
                alert('markdown-it'),
                alert('markdown-it-anchor'),
                alert('markdown-it-footnote'),
                alert('markdownlint'),
            ],
            { workDir: dir },
        )

        const prefixGroup = result.groups.find((g) => g.source === 'prefix')
        expect(prefixGroup).toMatchObject({
            name: 'markdown-it',
            packages: ['markdown-it', 'markdown-it-anchor', 'markdown-it-footnote'],
        })
        // markdownlint 单段包不成 prefix 组 → 单包组
        expect(result.groups.find((g) => g.source === 'single')?.packages).toEqual(['markdownlint'])
    })

    it('drops prefix group when it exceeds heuristicMaxSize', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups(
            [
                alert('plugin-one'),
                alert('plugin-two'),
                alert('plugin-three'),
                alert('plugin-four'),
                alert('plugin-five'),
                alert('plugin-six'),
            ],
            { workDir: dir, heuristicMaxSize: 5 },
        )

        expect(result.groups.filter((g) => g.source === 'prefix')).toHaveLength(0)
        expect(result.groups.filter((g) => g.source === 'single')).toHaveLength(6)
    })

    it('merges @types package into its main package group', () => {
        const dir = trackWorkDir()
        writeFileSync(
            join(dir, 'package.json'),
            JSON.stringify({ dependencies: { express: '^4.0.0' }, devDependencies: { '@types/express': '^4.0.0' } }),
            'utf-8',
        )
        const result = buildUpgradeGroups([alert('express'), alert('@types/express')], { workDir: dir })

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0].packages).toEqual(['express', '@types/express'])
        expect(result.cleanupCandidates).toEqual([])
    })

    it('creates a standalone types group when main package exists without alerts', () => {
        const dir = trackWorkDir()
        writeFileSync(
            join(dir, 'package.json'),
            JSON.stringify({ dependencies: { express: '^4.0.0' }, devDependencies: { '@types/express': '^4.0.0' } }),
            'utf-8',
        )
        const result = buildUpgradeGroups([alert('@types/express')], { workDir: dir })

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ name: 'types:express', source: 'types', packages: ['@types/express'] })
        expect(result.cleanupCandidates).toEqual([])
    })

    it('flags orphan @types as cleanup candidate when main package is gone', () => {
        const dir = trackWorkDir()
        // main package 已完全移除（package.json 无、overrides 无、lockfile 无）
        writeFileSync(
            join(dir, 'package.json'),
            JSON.stringify({ devDependencies: { '@types/express': '^4.0.0' } }),
            'utf-8',
        )
        const result = buildUpgradeGroups([alert('@types/express')], { workDir: dir })

        expect(result.groups).toHaveLength(0)
        expect(result.cleanupCandidates).toEqual(['@types/express'])
    })

    it('keeps @types as standalone when main package exists only in lockfile', () => {
        const dir = trackWorkDir()
        writeFileSync(join(dir, 'pnpm-lock.yaml'), '/express/4.21.0:\n', 'utf-8')
        const result = buildUpgradeGroups([alert('@types/express')], { workDir: dir })

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ source: 'types', packages: ['@types/express'] })
        expect(result.cleanupCandidates).toEqual([])
    })

    it('merges scoped-main @types into its scoped main package group', () => {
        const dir = trackWorkDir()
        writeFileSync(
            join(dir, 'package.json'),
            JSON.stringify({
                dependencies: { '@koa/router': '^12.0.0' },
                devDependencies: { '@types/koa__router': '^12.0.0' },
            }),
            'utf-8',
        )
        const result = buildUpgradeGroups([alert('@koa/router'), alert('@types/koa__router')], { workDir: dir })

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0].packages).toEqual(['@koa/router', '@types/koa__router'])
        expect(result.cleanupCandidates).toEqual([])
    })

    it('does not flag scoped-main @types as orphan when main package exists in lockfile', () => {
        const dir = trackWorkDir()
        writeFileSync(join(dir, 'pnpm-lock.yaml'), '/@koa/router/12.0.1:\n', 'utf-8')
        const result = buildUpgradeGroups([alert('@types/koa__router')], { workDir: dir })

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ name: 'types:@koa/router', source: 'types' })
        expect(result.cleanupCandidates).toEqual([])
    })

    it('handles empty input', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups([], { workDir: dir })

        expect(result.groups).toEqual([])
        expect(result.cleanupCandidates).toEqual([])
    })

    it('deduplicates packages listed in multiple explicit groups (first wins)', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups(
            [alert('lodash')],
            { workDir: dir, explicitGroups: { first: ['lodash'], second: ['lodash'] } },
        )

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ name: 'first', packages: ['lodash'] })
    })

    it('deduplicates a package repeated inside the same explicit group', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups(
            [alert('lodash')],
            { workDir: dir, explicitGroups: { g: ['lodash', 'lodash'] } },
        )

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0].packages).toEqual(['lodash'])
    })

    it('ignores explicit group packages without alerts', () => {
        const dir = trackWorkDir()
        const result = buildUpgradeGroups(
            [alert('lodash')],
            { workDir: dir, explicitGroups: { g: ['lodash', 'not-in-alerts'] } },
        )

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0].packages).toEqual(['lodash'])
    })

    it('ignores unsafe group names (__proto__ / constructor / prototype)', () => {
        const dir = trackWorkDir()
        writeDependabotYml(
            dir,
            [
                'version: 2',
                'updates:',
                '  - package-ecosystem: npm',
                '    groups:',
                '      __proto__:',
                '        patterns:',
                '          - "lodash"',
                '      safe:',
                '        patterns:',
                '          - "vite"',
                '',
            ].join('\n'),
        )
        const result = buildUpgradeGroups(
            [alert('lodash'), alert('vite')],
            { workDir: dir, explicitGroups: { constructor: ['lodash'], good: ['vite'] } },
        )

        // dependabot 层 __proto__ 被忽略；显式层 constructor 被忽略
        const explicitGroup = result.groups.find((g) => g.source === 'explicit')
        expect(explicitGroup?.packages).toEqual(['vite'])
        expect(result.groups.some((g) => g.name === '__proto__' || g.name === 'constructor')).toBe(false)
    })
})
