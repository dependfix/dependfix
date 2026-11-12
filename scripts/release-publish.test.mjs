import { execFileSync, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_PUBLISH_REGISTRY,
    SECURITY_GATE_SCRIPT,
    buildFinalizePlan,
    buildPublishArgs,
    buildPublishCommand,
    buildPublishPlan,
    ensureCleanWorkspace,
    main,
    parsePublishArgs,
    planNeedsSecurityGate,
    resolveAnchorVersion,
    runSecurityGate,
    tagOnly,
    tagRecovered,
    validateRegistry,
} from './release-publish.mjs'
import { readPackageVersion } from './tag-released-versions.mjs'

// main()/publishOne/finalizeRelease 依赖真实 git 命令与文件写入，统一 mock
// （finalizeRelease 会写 repoRoot/release-publish-result.json，必须 mock writeFileSync 防污染工作区；
//  readFileSync 保留真实实现——依赖链中 readPackageVersion 需读真实 package.json）
vi.mock('node:child_process', () => ({ execSync: vi.fn(), execFileSync: vi.fn() }))
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

// 含 platform 第 6 包：用于测 tag-only 分支（§T1310）
const packagesWithPlatform = [
    ...packages,
    {
        path: 'apps/platform',
        pkg: '@dependfix/platform',
        tags: { prefix: '@dependfix/platform@' },
        publishOrder: 6,
        rootChangelog: false,
        npmPublishable: false,
    },
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

describe('ensureCleanWorkspace', () => {
    it('干净工作区通过', () => {
        expect(() => ensureCleanWorkspace('')).not.toThrow()
        expect(() => ensureCleanWorkspace('\n\n')).not.toThrow()
    })

    it('有未提交变更时拒绝发布，并列出变更', () => {
        expect(() => ensureCleanWorkspace(' M packages/cli/src/index.ts\n?? scripts/release/new.mjs'))
            .toThrow(/未提交变更[\s\S]*packages\/cli\/src\/index\.ts[\s\S]*scripts\/release\/new\.mjs/)
    })

    it('变更超过十项时截断并给出剩余数量', () => {
        const status = Array.from({ length: 12 }, (_, index) => ` M file-${index}.ts`).join('\n')
        expect(() => ensureCleanWorkspace(status)).toThrow(/另有 2 项/)
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

// §T1310 tag-only 路径：npmPublishable=false（docker-only 发布单元）跳过 pnpm publish
// 但仍打 annotated git tag，保证 changelog 历史可比 + docker 触发 platform-x.y.z tag
describe('buildPublishPlan with platform (npmPublishable=false)', () => {
    it('routes npmPublishable=false packages to tag-only action', () => {
        const plan = buildPublishPlan(packagesWithPlatform, baseDeps)
        const platform = plan.find((p) => p.pkg === '@dependfix/platform')
        expect(platform?.action).toBe('tag-only')
        expect(platform?.version).toBe('0.3.0')
        expect(platform?.tagName).toBe('@dependfix/platform@0.3.0')
        // 5 个 npm 包路径不变（仍走 publish）
        expect(plan.filter((p) => p.action === 'publish')).toHaveLength(5)
        expect(plan.filter((p) => p.action === 'tag-only')).toHaveLength(1)
    })

    it('npmPublishable=false 短路优先于 isPublished 判定（即使 registry 误判命中也不发 npm）', () => {
        const plan = buildPublishPlan(packagesWithPlatform, {
            ...baseDeps,
            isPublished: (pkg) => pkg === '@dependfix/platform',
        })
        const platform = plan.find((p) => p.pkg === '@dependfix/platform')
        expect(platform?.action).toBe('tag-only')
    })

    it('local-tag-exists 短路优先于 tag-only（已打 tag 不重复）', () => {
        const plan = buildPublishPlan(packagesWithPlatform, {
            ...baseDeps,
            hasTag: (tagName) => tagName === '@dependfix/platform@0.3.0',
        })
        const platform = plan.find((p) => p.pkg === '@dependfix/platform')
        expect(platform?.action).toBe('skip-tag-exists')
    })
})

describe('tagOnly', () => {
    const planItem = {
        pkg: '@dependfix/platform',
        path: 'apps/platform',
        version: '0.1.0',
        tagName: '@dependfix/platform@0.1.0',
    }

    it('creates annotated tag when HEAD touches the path', () => {
        const tag = vi.fn()
        expect(() => tagOnly(planItem, { headTouches: () => true, tag })).not.toThrow()
        expect(tag).toHaveBeenCalledExactlyOnceWith('@dependfix/platform@0.1.0')
    })

    it('refuses to tag when HEAD does not touch the path (anchor guard)', () => {
        const tag = vi.fn()
        expect(() =>
            tagOnly(planItem, { headTouches: () => false, tag, headHash: () => 'abc1234' }),
        ).toThrow(/HEAD 不是 touch/)
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
        vi.mocked(execFileSync).mockReset()
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
            return ''
        })
        vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        process.argv = realArgv
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('refuses to publish from a dirty workspace before any side effect', async () => {
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('status --porcelain')) {
                return ' M packages/cli/src/index.ts'
            }
            if (c.includes('rev-parse HEAD')) {
                return 'abc1234'
            }
            return ''
        })
        process.argv = ['node', 'release-publish.mjs']

        await expect(main()).rejects.toThrow(/未提交变更/)
        // 前置守卫必须发生在 publish / tag 之前（不留半发布态）
        expect(vi.mocked(execFileSync).mock.calls).toHaveLength(0)
        const commands = vi.mocked(execSync).mock.calls.map(([cmd]) => String(cmd))
        expect(commands.some((cmd) => cmd.includes('tag -a'))).toBe(false)
    })

    it('dry-run prints would-publish lines without executing publish', async () => {
        stubRegistryUnpublished()
        process.argv = ['node', 'release-publish.mjs', '--dry-run']
        await main()

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run] would publish'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('dry-run 完成'))
        // 无 pnpm publish 执行，也不执行安全门禁（dry-run 不消耗外部 API）
        expect(vi.mocked(execFileSync).mock.calls).toHaveLength(0)
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('dry-run：跳过发布前安全告警门禁'))
    })

    it('安全门禁失败时在 npm 发布前中止（零发布副作用）', async () => {
        stubRegistryUnpublished()
        vi.mocked(execFileSync).mockImplementation((file) => {
            if (file === process.execPath) {
                throw new Error('Command failed: node scripts/check-release-security-alerts.mjs')
            }
            return undefined
        })
        process.argv = ['node', 'release-publish.mjs']

        await expect(main()).rejects.toThrow(/安全告警门禁未通过/)
        // 门禁先于 publish：不含任何 pnpm publish；也不打 tag（不留半发布态）
        expect(vi.mocked(execFileSync).mock.calls.filter(([file]) => file === 'pnpm')).toHaveLength(0)
        const commands = vi.mocked(execSync).mock.calls.map(([cmd]) => String(cmd))
        expect(commands.some((cmd) => cmd.includes('git tag -a'))).toBe(false)
    })

    it('--skip-security=<理由> 绕过门禁并在终端摘要留痕', async () => {
        stubRegistryUnpublished()
        process.argv = ['node', 'release-publish.mjs', '--skip-security=上游无修复版本，已登记豁免台账']
        await main()

        expect(vi.mocked(execFileSync).mock.calls.filter(([file]) => file === process.execPath)).toHaveLength(0)
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('上游无修复版本，已登记豁免台账'))
        expect(vi.mocked(execFileSync).mock.calls.filter(([file]) => file === 'pnpm')).toHaveLength(5)
    })

    it('publishes 5 npm packages + tag-only platform, creates tags and finalizes v tag', async () => {
        // §T1310：自 platform 加入后 main() 真实读取 PUBLISHABLE_PACKAGES（来自
        // packages.config.mjs，6 个包）。5 个 npm 包走 publish；platform 走
        // tag-only（不打 pnpm publish 但打 annotated tag）。
        stubRegistryUnpublished()
        process.argv = ['node', 'release-publish.mjs']
        await main()

        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        // 安全门禁 1 次（node 子进程）+ 5 包 pnpm publish（platform 跳过 pnpm；execFileSync 数组参数）
        expect(vi.mocked(execFileSync).mock.calls).toHaveLength(6)
        expect(vi.mocked(execFileSync).mock.calls[0][0]).toBe(process.execPath)
        expect(vi.mocked(execFileSync).mock.calls[0][1]).toEqual([SECURITY_GATE_SCRIPT])
        // 5 包 npm tag + 1 platform tag + 1 v tag = 7
        expect(calls.filter((c) => c.includes('git tag -a'))).toHaveLength(7)
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('tagged @dependfix/platform@'),
        )
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('npmPublishable=false'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('created v'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('聚合 Release tag'))
        // result.json 写入（mock fs，不落盘）
        expect(writeFileSync).toHaveBeenCalled()
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('written'))
    })

    it('tags half-published npm packages + tag-only platform (self-heal mix)', async () => {
        // registry 已发布当前真实版本 → 5 npm 包走 skip-published → tagRecovered 补 tag
        // platform 走 tag-only（不受 isPublished 影响）。
        stubRegistryPublished()
        process.argv = ['node', 'release-publish.mjs']
        await main()

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('npm 已发布，补 annotated tag'))
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('tagged @dependfix/platform@'),
        )
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('npmPublishable=false'))
        // 无 pnpm publish（5 npm 包 skip-published + platform tag-only），但有
        // 5 包补 tag + 1 platform tag + 1 v tag = 7
        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        expect(calls.filter((c) => c.includes('pnpm --filter'))).toHaveLength(0)
        expect(calls.filter((c) => c.includes('git tag -a'))).toHaveLength(7)
    })

    it('skips tag recovery for npm packages when HEAD does not touch the path (platform throws on anchor guard)', async () => {
        // HEAD 不 touch 任何包路径（mock 让 log -1 返回 ≠ HEAD）→ 5 个 npm 包
        // self-heal 跳过（HEAD 不 touch） + platform tag-only 锚点校验失败抛错。
        // tagOnly 与 publishOne 锚点守卫对称硬抛错，停止 main 流程（保证不污染 tag 锚点）。
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
        // 锚点失败预期抛错（与 publishOne 对称硬抛错语义）
        await expect(main()).rejects.toThrow(/HEAD 不是 touch apps\/platform/)
        // 5 npm 包 self-heal 跳过（HEAD 不 touch）
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('不补 tag'))
        // tag 与 publish 都未执行
        const calls = vi.mocked(execSync).mock.calls.map((c) => String(c[0]))
        expect(calls.filter((c) => c.includes('git tag -a'))).toHaveLength(0)
        expect(calls.filter((c) => c.includes('pnpm --filter'))).toHaveLength(0)
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
        // 纯跳过轮次不执行安全门禁
        expect(vi.mocked(execFileSync).mock.calls).toHaveLength(0)
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


describe('planNeedsSecurityGate', () => {
    const item = (action, path = 'packages/core') => [{ pkg: '@dependfix/core', path, action }]

    it('npm 发布 / 新包 tag 需要门禁', () => {
        expect(planNeedsSecurityGate(item('publish'), () => false)).toBe(true)
        expect(planNeedsSecurityGate(item('tag-only'), () => false)).toBe(true)
    })

    it('自愈补 tag 需要门禁；HEAD 不 touch 时不需要', () => {
        expect(planNeedsSecurityGate(item('skip-published'), () => true)).toBe(true)
        expect(planNeedsSecurityGate(item('skip-published'), () => false)).toBe(false)
    })

    it('纯跳过轮次不需要门禁', () => {
        expect(planNeedsSecurityGate(item('skip-tag-exists'), () => true)).toBe(false)
        expect(planNeedsSecurityGate(item('skip-registry-error'), () => true)).toBe(false)
        expect(planNeedsSecurityGate([], () => true)).toBe(false)
    })
})

describe('runSecurityGate', () => {
    it('门禁通过返回 passed 并输出通过行', () => {
        const gate = vi.fn()
        const log = vi.fn()
        expect(runSecurityGate({ gate, log })).toEqual({ status: 'passed' })
        expect(gate).toHaveBeenCalledTimes(1)
        expect(log).toHaveBeenCalledWith(expect.stringContaining('门禁通过'))
    })

    it('门禁非零（抛错）转成可操作错误，保留原始失败摘要', () => {
        const gate = vi.fn(() => {
            throw new Error('critical alert open\nfix it')
        })
        expect(() => runSecurityGate({ gate, log: () => {} })).toThrow(/安全告警门禁未通过.*critical alert open/)
        expect(() => runSecurityGate({ gate, log: () => {} })).toThrow(/--skip-security/)
    })

    it('dry-run / 无实际动作 / 显式理由三种跳过均放行且不调用门禁', () => {
        const gate = vi.fn()
        const log = vi.fn()
        expect(runSecurityGate({ dryRun: true, gate, log }).status).toBe('skipped-dry-run')
        expect(runSecurityGate({ hasReleaseAction: false, gate, log }).status).toBe('skipped-no-action')
        expect(runSecurityGate({ skipReason: '上游无修复版本', gate, log })).toEqual({
            status: 'skipped-by-flag',
            reason: '上游无修复版本',
        })
        expect(gate).not.toHaveBeenCalled()
        expect(log).toHaveBeenCalledWith(expect.stringContaining('上游无修复版本'))
    })
})

describe('发布参数与命令（本地 2FA 发布）', () => {
    it('解析 --otp / --registry / --dry-run（等号与空格）', () => {
        expect(parsePublishArgs(['--dry-run'])).toEqual({
            dryRun: true,
            otp: null,
            registry: DEFAULT_PUBLISH_REGISTRY,
            skipSecurityReason: null,
        })
        expect(parsePublishArgs(['--otp', '123456'])).toMatchObject({ otp: '123456' })
        expect(parsePublishArgs(['--otp=654321'])).toMatchObject({ otp: '654321' })
        expect(parsePublishArgs(['--registry', 'https://registry.npmjs.org/'])).toMatchObject({ registry: 'https://registry.npmjs.org/' })
        expect(parsePublishArgs(['--skip-security=上游无修复版本'])).toMatchObject({ skipSecurityReason: '上游无修复版本' })
        expect(parsePublishArgs(['--skip-security', '  发布窗口紧急  '])).toMatchObject({ skipSecurityReason: '发布窗口紧急' })
    })

    it('--skip-security 理由单行化并限长（防伪造后续日志行）', () => {
        const reason = parsePublishArgs(['--skip-security=紧急\n[security] 发布前安全告警门禁通过']).skipSecurityReason
        expect(reason).toBe('紧急 [security] 发布前安全告警门禁通过')
        expect(reason).not.toContain('\n')
        expect(parsePublishArgs([`--skip-security=${'长'.repeat(300)}`]).skipSecurityReason).toHaveLength(200)
    })

    it('--skip-security 无理由 / 空理由 / 误吞参数均报错', () => {
        expect(() => parsePublishArgs(['--skip-security'])).toThrow(/缺少理由/)
        expect(() => parsePublishArgs(['--skip-security='])).toThrow(/缺少理由/)
        expect(() => parsePublishArgs(['--skip-security', '   '])).toThrow(/缺少理由/)
        expect(() => parsePublishArgs(['--skip-security', '--dry-run'])).toThrow(/缺少理由/)
    })

    it('OTP 非 6-8 位数字 / registry 非 https / 缺值均报错', () => {
        expect(() => parsePublishArgs(['--otp', 'abc'])).toThrow(/6-8 位数字/)
        expect(() => parsePublishArgs(['--otp'])).toThrow(/缺少取值/)
        expect(() => parsePublishArgs(['--registry', 'http://mirror.local'])).toThrow(/https/)
        expect(() => parsePublishArgs(['--registry'])).toThrow(/缺少取值/)
    })

    it('发布参数数组固定显式 registry，并按需附加 otp（不经 shell）', () => {
        expect(buildPublishArgs('@dependfix/core')).toEqual([
            '--filter', '@dependfix/core', 'publish', '--no-git-checks', '--registry', 'https://registry.npmjs.org/',
        ])
        expect(buildPublishArgs('@dependfix/core', { otp: '123456' }).at(-2)).toBe('--otp')
        expect(buildPublishCommand('@dependfix/core')).toContain('--registry https://registry.npmjs.org/')
        expect(() => buildPublishArgs('@dependfix/core', { otp: 'x' })).toThrow(/6-8 位数字/)
    })

    it('registry 校验拒绝非 https / 内嵌凭据 / 空白', () => {
        expect(validateRegistry('https://registry.npmjs.org/')).toBe('https://registry.npmjs.org/')
        expect(() => validateRegistry('http://mirror.local')).toThrow(/https/)
        expect(() => validateRegistry('https://user:pass@registry.npmjs.org/')).toThrow(/内嵌凭据/)
        expect(() => validateRegistry('https://registry.npmjs.org/ path')).toThrow(/空白/)
    })

    it('未知参数 fail-closed（防 --otpp / 拼写错误静默丢参数）', () => {
        expect(() => parsePublishArgs(['--otpp', '123456'])).toThrow(/未知参数/)
        expect(() => parsePublishArgs(['--dryRun'])).toThrow(/未知参数/)
    })

    it('main 透传 otp 到内层 pnpm publish', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404, ok: false }))
        vi.mocked(execSync).mockReset()
        vi.mocked(execSync).mockImplementation((cmd) => {
            const command = String(cmd)
            if (command.includes('rev-parse HEAD') || command.includes('log -1')) {
                return 'abc1234'
            }
            if (command.includes('rev-parse --verify')) {
                throw new Error('tag not found')
            }
            return ''
        })
        vi.spyOn(console, 'log').mockImplementation(() => {})
        const realArgv = process.argv
        process.argv = ['node', 'release-publish.mjs', '--otp', '123456']
        try {
            await main()
            const publishCalls = vi.mocked(execFileSync).mock.calls.filter(([file]) => file === 'pnpm')
            expect(publishCalls.length).toBe(5)
            for (const [, args] of publishCalls) {
                expect(args).toContain('--registry')
                expect(args).toContain('https://registry.npmjs.org/')
                expect(args).toContain('--otp')
                expect(args).toContain('123456')
            }
        } finally {
            process.argv = realArgv
            vi.unstubAllGlobals()
            vi.restoreAllMocks()
        }
    })
})
