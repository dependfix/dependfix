import { describe, expect, it } from 'vitest'
import { buildDepGraph, computeBumps, incVersion, parsePlan, renderSummary, serializePkgJson } from './release-version.mjs'

// 模拟发布包清单（结构对齐 packages.config.mjs）
const packages = [
    { path: 'packages/core', pkg: '@dependfix/core' },
    { path: 'packages/engine', pkg: '@dependfix/engine' },
    { path: 'packages/skills', pkg: '@dependfix/skills' },
    { path: 'packages/cli', pkg: 'dependfix' },
    { path: 'packages/mcp', pkg: '@dependfix/mcp' },
]

// 实证依赖图：core 无依赖；engine 依赖 core；skills 无依赖；
// cli 依赖 core/engine/skills；mcp 依赖 core/engine
const realDeps = {
    'packages/core': {},
    'packages/engine': { '@dependfix/core': 'workspace:*' },
    'packages/skills': {},
    'packages/cli': {
        '@dependfix/core': 'workspace:*',
        '@dependfix/engine': 'workspace:*',
        '@dependfix/skills': 'workspace:*',
    },
    'packages/mcp': { '@dependfix/core': 'workspace:*', '@dependfix/engine': 'workspace:*' },
}

describe('parsePlan', () => {
    it('parses frontmatter plan and summary', () => {
        const { plan, summary } = parsePlan('---\n\'@dependfix/core\': minor\n\'dependfix\': patch\n---\n\nfeat(core): 新能力；fix(cli): 修 bug\n')
        expect([...plan]).toEqual([['@dependfix/core', 'minor'], ['dependfix', 'patch']])
        expect(summary).toBe('feat(core): 新能力；fix(cli): 修 bug')
    })

    it('rejects invalid bump level', () => {
        expect(() => parsePlan('---\n\'@dependfix/core\': nope\n---\n')).toThrow(/行格式无效/)
    })

    it('rejects unknown package name', () => {
        expect(() => parsePlan('---\n\'@dependfix/unknown\': patch\n---\n')).toThrow(/未知发布包/)
    })

    it('rejects missing frontmatter', () => {
        expect(() => parsePlan('feat: 没有 frontmatter\n')).toThrow(/缺少 frontmatter/)
    })

    it('rejects empty plan', () => {
        expect(() => parsePlan('---\n---\n\n')).toThrow(/无任何包条目/)
    })
})

describe('incVersion', () => {
    it('increments patch/minor/major for 0.x', () => {
        expect(incVersion('0.2.0', 'patch')).toBe('0.2.1')
        expect(incVersion('0.2.0', 'minor')).toBe('0.3.0')
        expect(incVersion('0.2.0', 'major')).toBe('1.0.0')
    })

    it('increments patch/minor/major for 1.x', () => {
        expect(incVersion('1.2.3', 'patch')).toBe('1.2.4')
        expect(incVersion('1.2.3', 'minor')).toBe('1.3.0')
        expect(incVersion('1.2.3', 'major')).toBe('2.0.0')
    })

    it('throws on invalid version or bump', () => {
        expect(() => incVersion('0.2', 'patch')).toThrow(/无法递增/)
        expect(() => incVersion('v0.2.0', 'patch')).toThrow(/无法递增/)
        expect(() => incVersion('0.2.0', 'nope')).toThrow(/非法 bump/)
    })
})

describe('buildDepGraph', () => {
    it('builds reverse dependency graph from workspace deps', () => {
        const graph = buildDepGraph(packages, (path) => realDeps[path])
        expect([...graph.get('@dependfix/core')]).toEqual(expect.arrayContaining(['@dependfix/engine', 'dependfix', '@dependfix/mcp']))
        expect([...graph.get('@dependfix/engine')]).toEqual(expect.arrayContaining(['dependfix', '@dependfix/mcp']))
        expect([...graph.get('@dependfix/skills')]).toEqual(['dependfix'])
        expect(graph.get('dependfix')?.size).toBe(0)
        expect(graph.get('@dependfix/mcp')?.size).toBe(0)
    })

    it('ignores non-workspace ranges and non-package deps', () => {
        // 注：readDeps 契约 = 各包 package.json 的 dependencies 字段（devDependencies
        // 由调用方读取路径保证不参与传导，见 main 中 readFileSync(...).dependencies）
        const deps = {
            'packages/cli': {
                '@dependfix/core': '^0.2.0', // 非 workspace 协议，不传导
                'lodash-es': '^4.18.1', // 非发布包，不传导
            },
        }
        const graph = buildDepGraph(packages, (path) => deps[path] ?? {})
        expect(graph.get('@dependfix/core')?.has('dependfix')).toBe(false)
        expect(graph.get('lodash-es')).toBeUndefined()
    })
})

describe('computeBumps', () => {
    const graph = buildDepGraph(packages, (path) => realDeps[path])

    it('propagates patch to direct dependents (core minor → engine/cli/mcp)', () => {
        const bumps = computeBumps(new Map([['@dependfix/core', 'minor']]), graph)
        expect(bumps.get('@dependfix/core')).toBe('minor')
        expect(bumps.get('@dependfix/engine')).toBe('patch')
        expect(bumps.get('dependfix')).toBe('patch')
        expect(bumps.get('@dependfix/mcp')).toBe('patch')
        expect(bumps.has('@dependfix/skills')).toBe(false)
    })

    it('propagates transitively (engine minor → cli/mcp via chain)', () => {
        const bumps = computeBumps(new Map([['@dependfix/engine', 'minor']]), graph)
        expect(bumps.get('@dependfix/engine')).toBe('minor')
        expect(bumps.get('dependfix')).toBe('patch')
        expect(bumps.get('@dependfix/mcp')).toBe('patch')
    })

    it('propagates through skills (skills minor → cli)', () => {
        const bumps = computeBumps(new Map([['@dependfix/skills', 'minor']]), graph)
        expect(bumps.get('@dependfix/skills')).toBe('minor')
        expect(bumps.get('dependfix')).toBe('patch')
        expect(bumps.has('@dependfix/engine')).toBe(false)
    })

    it('keeps planned bump when propagation would be lower (no downgrade)', () => {
        const bumps = computeBumps(new Map([['@dependfix/core', 'minor'], ['dependfix', 'minor']]), graph)
        expect(bumps.get('dependfix')).toBe('minor')
    })

    it('returns empty for empty plan', () => {
        expect(computeBumps(new Map(), graph).size).toBe(0)
    })
})

describe('renderSummary', () => {
    it('renders from/to with bump and source', () => {
        const bumps = new Map([['@dependfix/core', 'minor'], ['dependfix', 'patch']])
        const out = renderSummary(bumps, () => '0.2.0', new Set(['@dependfix/core']))
        expect(out).toContain('@dependfix/core: 0.2.0 → 0.3.0 (minor，计划)')
        expect(out).toContain('dependfix: 0.2.0 → 0.2.1 (patch，传导)')
    })
})

describe('serializePkgJson', () => {
    it('keeps 2-space indent and no trailing newline (editorconfig package.json default)', () => {
        const raw = '{\n  "name": "a",\n  "version": "0.1.0"\n}'
        expect(serializePkgJson({ name: 'a', version: '0.2.0' }, raw)).toBe(
            '{\n  "name": "a",\n  "version": "0.2.0"\n}',
        )
    })

    it('keeps 4-space indent of original file instead of reformatting', () => {
        const raw = '{\n    "name": "a",\n    "version": "0.1.0"\n}'
        expect(serializePkgJson({ name: 'a', version: '0.2.0' }, raw)).toBe(
            '{\n    "name": "a",\n    "version": "0.2.0"\n}',
        )
    })

    it('keeps trailing newline when original file ends with one', () => {
        const raw = '{\n  "version": "0.1.0"\n}\n'
        expect(serializePkgJson({ version: '0.2.0' }, raw)).toBe('{\n  "version": "0.2.0"\n}\n')
    })

    it('falls back to 2-space indent for compact single-line json', () => {
        expect(serializePkgJson({ version: '0.2.0' }, '{"version":"0.1.0"}')).toBe(
            '{\n  "version": "0.2.0"\n}',
        )
    })

    it('falls back to 2-space indent for tab-indented json (space regex only matches spaces)', () => {
        const raw = '{\n\t"version": "0.1.0"\n}'
        expect(serializePkgJson({ version: '0.2.0' }, raw)).toBe('{\n  "version": "0.2.0"\n}')
    })

    it('preserves key order of original file', () => {
        const raw = '{\n  "name": "a",\n  "version": "0.1.0",\n  "license": "MIT"\n}'
        const out = serializePkgJson(JSON.parse(raw), raw)
        expect(out.indexOf('name')).toBeLessThan(out.indexOf('version'))
        expect(out.indexOf('version')).toBeLessThan(out.indexOf('license'))
    })
})
