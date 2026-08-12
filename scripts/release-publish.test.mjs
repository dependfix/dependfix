import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFinalizePlan, buildPublishPlan, main, resolveAnchorVersion, tagRecovered } from './release-publish.mjs'
import { readPackageVersion } from './tag-released-versions.mjs'

// main()/publishOne/finalizeRelease 依赖真实 git 命令与文件写入，统一 mock
// （finalizeRelease 会写 repoRoot/release-publish-result.json，必须 mock writeFileSync 防污染工作区；
//  readFileSync 保留真实实现——依赖链中 readPackageVersion 需读真实 package.json）
vi.mock('node:child_process', () => ({ execSync: vi.fn() }))
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, writeFileSync: vi.fn() }
})

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

describe('tagRecovered', () => {
    const planItem = { pkg: '@dependfix/core', path: 'packages/core', version: '0.2.1', tagName: '@dependfix/core@0.2.1' }

    it('tags when npm already published and HEAD touches the path (re-run self-heal)', () => {
        const tag = vi.fn()
        const ok = tagRecovered(planItem, { headTouches: () => true, tag })
        expect(ok).toBe(true)
        expect(tag).toHaveBeenCalledExactlyOnceWith('@dependfix/core@0.2.1')
    })

    it('refuses to tag when HEAD does not touch the path (keep safe skip)', () => {
        const tag = vi.fn()
        const ok = tagRecovered(planItem, { headTouches: () => false, tag })
        expect(ok).toBe(false)
        expect(tag).not.toHaveBeenCalled()
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

describe('main', () => {
    const realArgv = process.argv

    // registry 已发布当前真实版本（读 package.json），用于 skip-published 路径
    const stubRegistryPublished = () => {
        const versions = {}
        for (const p of packages) {
            versions[readPackageVersion(p.path)] = {}
        }
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({ versions }),
        }))
    }
    const stubRegistryUnpublished = () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false }))
    }

    beforeEach(() => {
        // HEAD 锚点命中 + 本地无 tag + 发布命令成功
        vi.mocked(execSync).mockReset()
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('rev-parse HEAD')) {
                return 'abc1234'
            }
            if (c.includes('log -1')) {
                return 'abc1234'
            }
            if (c.includes('rev-parse --verify')) {
                throw new Error('tag not found')
            }
            if (c.includes('pnpm --filter')) {
                return ''
            }
            return ''
        })
        vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        process.argv = realArgv
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('dry-run prints would-publish lines without executing publish', async () => {
        stubRegistryUnpublished()
        process.argv = ['node', 'release-publish.mjs', '--dry-run']
        await main()

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run] would publish'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('dry-run 完成'))
        // 无 pnpm publish / git tag 执行
        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        expect(calls.filter((c) => c.includes('pnpm --filter'))).toHaveLength(0)
    })

    it('publishes unpublished packages, creates tags and finalizes v tag', async () => {
        stubRegistryUnpublished()
        process.argv = ['node', 'release-publish.mjs']
        await main()

        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        // 5 包全部发布
        expect(calls.filter((c) => c.includes('pnpm --filter'))).toHaveLength(5)
        expect(calls.filter((c) => c.includes('git tag -a'))).toHaveLength(6) // 5 包 tag + 1 个 v tag
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('created v'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('聚合 Release tag'))
        // result.json 写入（mock fs，不落盘）
        expect(writeFileSync).toHaveBeenCalled()
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('written'))
    })

    it('tags half-published packages when HEAD touches the path (self-heal)', async () => {
        stubRegistryPublished()
        process.argv = ['node', 'release-publish.mjs']
        await main()

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('npm 已发布，补 annotated tag'))
        // 无 pnpm publish（全部 skip-published），但有 5 包补 tag + 1 个 v tag
        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        expect(calls.filter((c) => c.includes('pnpm --filter'))).toHaveLength(0)
        expect(calls.filter((c) => c.includes('git tag -a'))).toHaveLength(6)
    })

    it('skips tag recovery when HEAD does not touch the path', async () => {
        vi.mocked(execSync).mockReset()
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('rev-parse HEAD')) {
                return 'abc1234'
            }
            if (c.includes('log -1')) {
                return 'deadbeef'
            }
            if (c.includes('rev-parse --verify')) {
                throw new Error('tag not found')
            }
            if (c.includes('pnpm --filter')) {
                return ''
            }
            return ''
        })
        stubRegistryPublished()
        process.argv = ['node', 'release-publish.mjs']
        await main()

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('不补 tag'))
        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        expect(calls.filter((c) => c.includes('git tag -a'))).toHaveLength(0) // 无补 tag（v tag 也不打：无锚包）
    })

    it('no-op round writes empty result and skips v tag', async () => {
        // 全部本地已有 tag → 无发布、无补 tag
        vi.mocked(execSync).mockReset()
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('rev-parse --verify')) {
                return ''
            }
            if (c.includes('pnpm --filter')) {
                return ''
            }
            return ''
        })
        stubRegistryPublished()
        process.argv = ['node', 'release-publish.mjs']
        await main()

        expect(console.log).toHaveBeenCalledWith('没有需要发布的版本（全部已发布 / 查询失败保守跳过）')
        expect(console.log).toHaveBeenCalledWith('skip v tag（本轮无锚包发布）')
        expect(writeFileSync).toHaveBeenCalled()
    })

    it('skips conservatively on registry query failures', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
        process.argv = ['node', 'release-publish.mjs']
        await main()

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('npm 查询失败，保守跳过'))
        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        expect(calls.filter((c) => c.includes('pnpm --filter'))).toHaveLength(0)
    })
})
