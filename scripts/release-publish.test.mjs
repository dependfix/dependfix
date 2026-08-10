import { describe, expect, it } from 'vitest'
import { buildFinalizePlan, buildPublishPlan, resolveAnchorVersion } from './release-publish.mjs'

// 注：isPublishedOnRegistry 的真实 npm 调用行为（E404 stderr → false）不在此处测试
// （网络依赖 + 慢），由实际 `pnpm release:publish --dry-run` 实证；buildPublishPlan
// 的分支逻辑已通过注入 isPublished 全覆盖。

// 模拟发布包清单（结构对齐 packages.config.mjs：publishOrder 升序 + rootChangelog）
const packages = [
    { path: 'packages/core', pkg: '@dependfix/core', tags: { prefix: '@dependfix/core@' }, publishOrder: 1, rootChangelog: false },
    { path: 'packages/engine', pkg: '@dependfix/engine', tags: { prefix: '@dependfix/engine@' }, publishOrder: 2, rootChangelog: false },
    { path: 'packages/skills', pkg: '@dependfix/skills', tags: { prefix: '@dependfix/skills@' }, publishOrder: 3, rootChangelog: false },
    { path: 'packages/cli', pkg: 'dependfix', tags: { prefix: 'dependfix@' }, publishOrder: 4, rootChangelog: true },
    { path: 'packages/mcp', pkg: '@dependfix/mcp', tags: { prefix: '@dependfix/mcp@' }, publishOrder: 5, rootChangelog: false },
]

const baseDeps = {
    versionOf: () => '0.3.0',
    hasTag: () => false,
    isPublished: () => false,
}

describe('buildPublishPlan', () => {
    it('plans publish for unpublished versions in publishOrder', () => {
        const plan = buildPublishPlan(packages, baseDeps)
        expect(plan.map((p) => p.action)).toEqual([
            'publish',
            'publish',
            'publish',
            'publish',
            'publish',
        ])
        // publishOrder 顺序保持：core 先行、mcp 殿后
        expect(plan[0].pkg).toBe('@dependfix/core')
        expect(plan[4].pkg).toBe('@dependfix/mcp')
        expect(plan[0].tagName).toBe('@dependfix/core@0.3.0')
    })

    it('skips packages whose tag already exists', () => {
        const plan = buildPublishPlan(packages, {
            ...baseDeps,
            hasTag: (tagName) => tagName === 'dependfix@0.3.0',
        })
        const cli = plan.find((p) => p.pkg === 'dependfix')
        expect(cli?.action).toBe('skip-tag-exists')
        expect(plan.filter((p) => p.action === 'publish')).toHaveLength(4)
    })

    it('skips packages already published on registry', () => {
        const plan = buildPublishPlan(packages, {
            ...baseDeps,
            isPublished: (pkg) => pkg === '@dependfix/mcp',
        })
        const mcp = plan.find((p) => p.pkg === '@dependfix/mcp')
        expect(mcp?.action).toBe('skip-published')
        expect(plan.filter((p) => p.action === 'publish')).toHaveLength(4)
    })

    it('skips registry query failures conservatively (no publish on uncertainty)', () => {
        const plan = buildPublishPlan(packages, {
            ...baseDeps,
            isPublished: () => null,
        })
        for (const p of plan) {
            expect(p.action).toBe('skip-registry-error')
        }
    })

    it('keeps package version from versionOf', () => {
        const plan = buildPublishPlan(packages, {
            ...baseDeps,
            versionOf: (path) => (path === 'packages/core' ? '0.4.0' : '0.3.0'),
        })
        const core = plan.find((p) => p.pkg === '@dependfix/core')
        expect(core?.version).toBe('0.4.0')
        expect(core?.tagName).toBe('@dependfix/core@0.4.0')
    })
})

describe('resolveAnchorVersion', () => {
    it('prefers the root changelog package (dependfix)', () => {
        const published = [
            { pkg: '@dependfix/core', version: '0.3.0' },
            { pkg: 'dependfix', version: '0.2.1' },
            { pkg: '@dependfix/mcp', version: '0.2.0' },
        ]
        expect(resolveAnchorVersion(published, packages)).toEqual({ pkg: 'dependfix', version: '0.2.1' })
    })

    it('falls back to core when dependfix not published (core-only round)', () => {
        const published = [{ pkg: '@dependfix/core', version: '0.3.0' }]
        expect(resolveAnchorVersion(published, packages)).toEqual({ pkg: '@dependfix/core', version: '0.3.0' })
    })

    it('uses publishOrder order when root package absent', () => {
        const published = [{ pkg: '@dependfix/mcp', version: '0.2.0' }, { pkg: '@dependfix/skills', version: '0.2.0' }]
        expect(resolveAnchorVersion(published, packages)).toEqual({ pkg: '@dependfix/skills', version: '0.2.0' })
    })

    it('returns null for empty published list', () => {
        expect(resolveAnchorVersion([], packages)).toBeNull()
    })
})

describe('buildFinalizePlan', () => {
    it('creates v tag plan with result content for anchored round', () => {
        const plan = buildFinalizePlan(
            [{ pkg: 'dependfix', version: '0.2.1' }, { pkg: '@dependfix/core', version: '0.3.0' }],
            packages,
            () => false,
        )
        expect(plan.vTag).toBe('v0.2.1')
        expect(plan.vTagAction).toBe('create')
        expect(plan.result).toEqual({
            published: [{ pkg: 'dependfix', version: '0.2.1' }, { pkg: '@dependfix/core', version: '0.3.0' }],
            anchorVersion: '0.2.1',
            anchorPkg: 'dependfix',
        })
    })

    it('skips existing v tag (no overwrite)', () => {
        const plan = buildFinalizePlan([{ pkg: '@dependfix/core', version: '0.3.0' }], packages, (t) => t === 'v0.3.0')
        expect(plan.vTagAction).toBe('skip-exists')
        expect(plan.vTag).toBe('v0.3.0')
    })

    it('writes empty result structure when nothing published (CI no-op rounds)', () => {
        const plan = buildFinalizePlan([], packages, () => false)
        expect(plan.vTagAction).toBe('skip-no-anchor')
        expect(plan.result).toEqual({ published: [], anchorVersion: null, anchorPkg: null })
    })
})
