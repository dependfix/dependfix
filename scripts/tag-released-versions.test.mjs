import { describe, expect, it } from 'vitest'
import { buildTagPlan } from './tag-released-versions.mjs'

// 注：isPublishedOnRegistry 的真实 npm 调用行为（E404 stderr → false）不在此处测试
// （网络依赖 + 慢），由实际 `pnpm tag:released --dry-run` 实证；buildTagPlan 的分支
// 逻辑已通过注入 isPublished 全覆盖。

// 测试包清单（模拟 packages.config.mjs 结构）
const packages = [
    { path: 'packages/core', pkg: '@dependfix/core', tags: { prefix: '@dependfix/core@' } },
    { path: 'packages/skills', pkg: '@dependfix/skills', tags: { prefix: '@dependfix/skills@' } },
    { path: 'packages/cli', pkg: 'dependfix', tags: { prefix: 'dependfix@' } },
    { path: 'packages/mcp', pkg: '@dependfix/mcp', tags: { prefix: '@dependfix/mcp@' } },
]

const baseDeps = {
    versionOf: () => '0.1.0',
    hasTag: () => false,
    isPublished: () => true,
    anchorOf: () => 'abc1234',
    at: undefined,
}

describe('buildTagPlan', () => {
    it('creates tags for published versions without local tag', () => {
        const plan = buildTagPlan(packages, baseDeps)
        expect(plan).toHaveLength(4)
        for (const p of plan) {
            expect(p.action).toBe('create')
            expect(p.tagName).toMatch(/@?[\w-]+@0\.1\.0$/)
            expect(p.anchor).toBe('abc1234')
        }
    })

    it('skips packages whose tag already exists (idempotent)', () => {
        const plan = buildTagPlan(packages, {
            ...baseDeps,
            hasTag: (tagName) => tagName === 'dependfix@0.1.0',
        })
        const cli = plan.find((p) => p.pkg === 'dependfix')
        expect(cli?.action).toBe('skip-exists')
        expect(plan.filter((p) => p.action === 'create')).toHaveLength(3)
    })

    it('skips unpublished versions', () => {
        const plan = buildTagPlan(packages, {
            ...baseDeps,
            isPublished: (pkg) => pkg !== '@dependfix/mcp',
        })
        const mcp = plan.find((p) => p.pkg === '@dependfix/mcp')
        expect(mcp?.action).toBe('skip-unpublished')
        expect(plan.filter((p) => p.action === 'create')).toHaveLength(3)
    })

    it('skips registry query failures conservatively (no tag on uncertainty)', () => {
        const plan = buildTagPlan(packages, {
            ...baseDeps,
            isPublished: () => null,
        })
        for (const p of plan) {
            expect(p.action).toBe('skip-registry-error')
        }
    })

    it('skips when no anchor commit found', () => {
        const plan = buildTagPlan(packages, {
            ...baseDeps,
            anchorOf: () => null,
        })
        for (const p of plan) {
            expect(p.action).toBe('skip-no-anchor')
        }
    })

    it('uses --at override as anchor for all packages', () => {
        const plan = buildTagPlan(packages, {
            ...baseDeps,
            at: 'deadbeef',
        })
        for (const p of plan) {
            expect(p.action).toBe('create')
            expect(p.anchor).toBe('deadbeef')
        }
    })

    it('uses per-path anchor when --at is not provided', () => {
        const plan = buildTagPlan(packages, {
            ...baseDeps,
            anchorOf: (path) => `anchor-${path}`,
        })
        const core = plan.find((p) => p.pkg === '@dependfix/core')
        expect(core?.anchor).toBe('anchor-packages/core')
    })
})
