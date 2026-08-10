import { describe, expect, it } from 'vitest'
import { buildPublishPlan } from './release-publish.mjs'

// 注：isPublishedOnRegistry 的真实 npm 调用行为（E404 stderr → false）不在此处测试
// （网络依赖 + 慢），由实际 `pnpm release:publish --dry-run` 实证；buildPublishPlan
// 的分支逻辑已通过注入 isPublished 全覆盖。

// 模拟发布包清单（结构对齐 packages.config.mjs：publishOrder 升序）
const packages = [
    { path: 'packages/core', pkg: '@dependfix/core', tags: { prefix: '@dependfix/core@' } },
    { path: 'packages/engine', pkg: '@dependfix/engine', tags: { prefix: '@dependfix/engine@' } },
    { path: 'packages/skills', pkg: '@dependfix/skills', tags: { prefix: '@dependfix/skills@' } },
    { path: 'packages/cli', pkg: 'dependfix', tags: { prefix: 'dependfix@' } },
    { path: 'packages/mcp', pkg: '@dependfix/mcp', tags: { prefix: '@dependfix/mcp@' } },
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
