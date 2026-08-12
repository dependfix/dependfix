import { execSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTagPlan, findPathAnchor, hasLocalTag, isPublishedOnRegistry, readPackageVersion } from './tag-released-versions.mjs'

// 模块级 mock：hasLocalTag / findPathAnchor 走真实 git 命令不可控，统一替换 execSync
vi.mock('node:child_process', () => ({ execSync: vi.fn() }))

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

describe('readPackageVersion', () => {
    it('reads the version from the real package.json', () => {
        expect(readPackageVersion('packages/core')).toMatch(/^\d+\.\d+\.\d+$/)
    })
})

describe('hasLocalTag', () => {
    afterEach(() => {
        vi.mocked(execSync).mockReset()
    })

    it('returns true when rev-parse succeeds', () => {
        vi.mocked(execSync).mockReturnValue('')
        expect(hasLocalTag('v1.0.0')).toBe(true)
    })

    it('returns false when rev-parse throws', () => {
        vi.mocked(execSync).mockImplementation(() => {
            throw new Error('not found')
        })
        expect(hasLocalTag('v1.0.0')).toBe(false)
    })
})

describe('findPathAnchor', () => {
    afterEach(() => {
        vi.mocked(execSync).mockReset()
    })

    it('returns the trimmed commit hash', () => {
        vi.mocked(execSync).mockReturnValue('  abc1234\n')
        expect(findPathAnchor('packages/core')).toBe('abc1234')
    })

    it('returns null on empty output', () => {
        vi.mocked(execSync).mockReturnValue('')
        expect(findPathAnchor('packages/core')).toBeNull()
    })

    it('returns null when git fails', () => {
        vi.mocked(execSync).mockImplementation(() => {
            throw new Error('fatal')
        })
        expect(findPathAnchor('packages/nonexistent')).toBeNull()
    })
})

describe('isPublishedOnRegistry', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('returns true when registry has the version (HTTP 200)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({ versions: { '0.1.0': {}, '0.2.0': {} } }),
        }))
        await expect(isPublishedOnRegistry('@dependfix/core', '0.2.0')).resolves.toBe(true)
        await expect(isPublishedOnRegistry('@dependfix/core', '9.9.9')).resolves.toBe(false)
    })

    it('returns false on HTTP 404 without retry', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ status: 404, ok: false })
        vi.stubGlobal('fetch', fetchMock)
        await expect(isPublishedOnRegistry('@dependfix/unknown', '0.1.0')).resolves.toBe(false)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('returns null on other HTTP errors without retry', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ status: 500, ok: false })
        vi.stubGlobal('fetch', fetchMock)
        await expect(isPublishedOnRegistry('@dependfix/core', '0.1.0')).resolves.toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('retries once on transient network errors and succeeds', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new Error('UND_ERR_CONNECT_TIMEOUT'))
            .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ versions: { '0.1.0': {} } }) })
        vi.stubGlobal('fetch', fetchMock)
        await expect(isPublishedOnRegistry('@dependfix/core', '0.1.0')).resolves.toBe(true)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('returns null when both attempts fail', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
        await expect(isPublishedOnRegistry('@dependfix/core', '0.1.0')).resolves.toBeNull()
    })
})
