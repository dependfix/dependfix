import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildReleasePlan, isEnginesOnlyBreaking, isPreMajor, main, parseCommit, pathToPkg, renderPlan, stripDevTags, toBump } from './create-release-plan.mjs'

// main()/getLatestTag/collectCommits 依赖真实 git 与文件写入（写 repoRoot/release-plan.md），统一 mock；
// readFileSync 保留真实实现（isPreMajor 读 core package.json）
vi.mock('node:child_process', () => ({ execSync: vi.fn() }))
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, writeFileSync: vi.fn(), existsSync: vi.fn(() => false) }
})

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

    it('downgrades engines-only breaking to minor after 1.0.0', () => {
        expect(toBump({ type: 'build', breaking: true, enginesOnly: true }, false)).toBe('minor')
    })
})

describe('isEnginesOnlyBreaking', () => {
    const enginesDiff = [
        'diff --git a/package.json b/package.json',
        'index 1111111..2222222 100644',
        '--- a/package.json',
        '+++ b/package.json',
        '@@ -9 +9 @@',
        '-    "node": "^22.23.4 || ^24.22.1"',
        '+    "node": "^22.23.5 || ^24.22.3"',
    ].join('\n')

    it('accepts manifests whose diff only touches engines.node', () => {
        expect(isEnginesOnlyBreaking(['package.json', 'packages/core/package.json'], enginesDiff)).toBe(true)
    })

    it('accepts adding a new major line', () => {
        const addMajorDiff = [
            '--- a/package.json',
            '+++ b/package.json',
            '@@ -9 +9 @@',
            '-    "node": "^22.23.5 || ^24.22.3"',
            '+    "node": "^22.23.5 || ^24.22.3 || ^26.13.1"',
        ].join('\n')
        expect(isEnginesOnlyBreaking(['package.json'], addMajorDiff)).toBe(true)
    })

    it('rejects adding new engines constraints without replacing a range', () => {
        const newConstraintDiff = [
            '--- a/package.json',
            '+++ b/package.json',
            '@@ -1 +1 @@',
            '+    "node": "^24.22.3"',
        ].join('\n')
        expect(isEnginesOnlyBreaking(['package.json'], newConstraintDiff)).toBe(false)
    })

    it('parses hyphen ranges and keeps both major lines', () => {
        const hyphenDiff = [
            '--- a/package.json',
            '+++ b/package.json',
            '@@ -9 +9 @@',
            '-    "node": "22 - 24.22.1"',
            '+    "node": "22 - 24.22.3"',
        ].join('\n')
        expect(isEnginesOnlyBreaking(['package.json'], hyphenDiff)).toBe(true)
    })

    it('compares majors per file so one file cannot mask a dropped line', () => {
        const maskingDiff = [
            'diff --git a/package.json b/package.json',
            '--- a/package.json',
            '+++ b/package.json',
            '@@ -9 +9 @@',
            '-    "node": "^22.23.5 || ^24.22.3"',
            '+    "node": "^24.22.3"',
            'diff --git a/packages/core/package.json b/packages/core/package.json',
            '--- a/packages/core/package.json',
            '+++ b/packages/core/package.json',
            '@@ -9 +9 @@',
            '-    "node": "^24.22.3"',
            '+    "node": "^22.23.5 || ^24.22.3"',
        ].join('\n')
        expect(isEnginesOnlyBreaking(['package.json', 'packages/core/package.json'], maskingDiff)).toBe(false)
    })

    it('rejects rename-only chunks alongside engines bumps', () => {
        const renameDiff = [
            'diff --git a/packages/old/package.json b/packages/new/package.json',
            'similarity index 100%',
            'rename from packages/old/package.json',
            'rename to packages/new/package.json',
            'diff --git a/package.json b/package.json',
            '--- a/package.json',
            '+++ b/package.json',
            '@@ -9 +9 @@',
            '-    "node": "^22.23.4"',
            '+    "node": "^22.23.5"',
        ].join('\n')
        expect(isEnginesOnlyBreaking(['packages/old/package.json', 'packages/new/package.json'], renameDiff)).toBe(false)
    })

    it('rejects dropping a supported major line', () => {
        const dropMajorDiff = [
            '--- a/package.json',
            '+++ b/package.json',
            '@@ -9 +9 @@',
            '-    "node": "^22.23.5 || ^24.22.3"',
            '+    "node": "^24.22.3"',
        ].join('\n')
        expect(isEnginesOnlyBreaking(['package.json'], dropMajorDiff)).toBe(false)
    })

    it('handles multi-file diffs with hunk headers', () => {
        const multiFileDiff = [
            '--- a/package.json',
            '+++ b/package.json',
            '@@ -9 +9 @@',
            '-    "node": "^22.23.4 || ^24.22.1"',
            '+    "node": "^22.23.5 || ^24.22.3"',
            'diff --git a/packages/core/package.json b/packages/core/package.json',
            '--- a/packages/core/package.json',
            '+++ b/packages/core/package.json',
            '@@ -20 +20 @@',
            '-    "node": "^22.23.4 || ^24.22.1"',
            '+    "node": "^22.23.5 || ^24.22.3"',
        ].join('\n')
        expect(isEnginesOnlyBreaking(['package.json', 'packages/core/package.json'], multiFileDiff)).toBe(true)
    })

    it('rejects commits that also touch source files', () => {
        expect(isEnginesOnlyBreaking(['package.json', 'packages/core/src/a.ts'], enginesDiff)).toBe(false)
    })

    it('rejects manifests carrying non-engines changes', () => {
        const mixedDiff = `${enginesDiff}\n-    "version": "1.0.0",\n+    "version": "1.0.1",`
        expect(isEnginesOnlyBreaking(['package.json'], mixedDiff)).toBe(false)
    })

    it('returns false when no files or no changed lines are present', () => {
        expect(isEnginesOnlyBreaking([], enginesDiff)).toBe(false)
        expect(isEnginesOnlyBreaking(['package.json'], 'diff --git a/package.json b/package.json')).toBe(false)
    })
})

describe('pathToPkg', () => {
    it('maps package paths to publish packages', () => {
        expect(pathToPkg('packages/core/src/utils/index.ts')).toBe('@dependfix/core')
        expect(pathToPkg('packages/core')).toBe('@dependfix/core')
        expect(pathToPkg('packages/cli/package.json')).toBe('dependfix')
        expect(pathToPkg('packages/skills/dependfix-remediator/SKILL.md')).toBe('@dependfix/skills')
        expect(pathToPkg('packages/mcp/src/index.ts')).toBe('@dependfix/mcp')
        // §T1310：apps/platform 也进入发布清单 path-to-pkg 映射
        expect(pathToPkg('apps/platform/src/index.ts')).toBe('@dependfix/platform')
        expect(pathToPkg('apps/platform')).toBe('@dependfix/platform')
    })

    it('returns null for non-package paths', () => {
        expect(pathToPkg('docs/guide/release.md')).toBeNull()
        expect(pathToPkg('package.json')).toBeNull()
        expect(pathToPkg('scripts/changelog.mjs')).toBeNull()
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

describe('renderPlan', () => {
    it('renders frontmatter with single-quoted package names', () => {
        const plan = new Map([
            ['dependfix', 'minor'],
            ['@dependfix/core', 'minor'],
        ])
        expect(renderPlan(plan, 'feat: 新功能')).toBe('---\n\'dependfix\': minor\n\'@dependfix/core\': minor\n---\n\nfeat: 新功能\n')
    })
})

describe('stripDevTags', () => {
    // 注意：以下用例的编号标记是 stripDevTags 清洗功能的输入样例数据，
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
        expect(stripDevTags('feat(cli): 新增能力')).toBe('feat(cli): 新增能力')
    })
})

describe('isPreMajor', () => {
    it('按仓库真实版本判定（0.x 期间为 true，1.x 起为 false）', () => {
        const { version } = JSON.parse(readFileSync(new URL('../packages/core/package.json', import.meta.url), 'utf8'))
        expect(isPreMajor()).toBe(version.startsWith('0.'))
    })

    it('显式版本入参覆盖两个分支', () => {
        expect(isPreMajor('0.7.0')).toBe(true)
        expect(isPreMajor('1.0.0')).toBe(false)
    })
})

describe('main', () => {
    const realArgv = process.argv

    beforeEach(() => {
        vi.mocked(execSync).mockReset()
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('tag --merged')) {
                return ''
            }
            if (c.includes('--grep=')) {
                return ''
            }
            if (c.includes('git log')) {
                return 'abc1234\x1ffix(core): 修复问题\npackages/core/src/a.ts\n'
            }
            return ''
        })
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        process.argv = realArgv
        vi.restoreAllMocks()
    })

    it('reports no changes when git log is empty (no commits)', async () => {
        vi.mocked(execSync).mockImplementation((cmd) => {
            if (String(cmd).includes('git log')) {
                return ''
            }
            return ''
        })
        main()
        expect(console.log).toHaveBeenCalledWith('未发现需要提升版本的变更，不生成发布计划')
        expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('generates plan file and prints bump lines for changed packages', async () => {
        main()
        expect(console.log).toHaveBeenCalledWith('基线 tag：无（使用全量历史）')
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('generated'))
        expect(writeFileSync).toHaveBeenCalledOnce()
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('@dependfix/core: patch'))
        expect(vi.mocked(writeFileSync).mock.lastCall?.[1]).not.toContain('engines-only breaking')
    })

    it('treats engines-only breaking as minor and records support-surface note', async () => {
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('tag --merged')) {
                return ''
            }
            if (c.includes('--grep=')) {
                return 'abc1234'
            }
            if (c.includes('show') && c.includes('--name-only')) {
                return 'package.json\npackages/core/package.json\n'
            }
            if (c.includes('show') && c.includes('--unified=0')) {
                return [
                    'diff --git a/package.json b/package.json',
                    '--- a/package.json',
                    '+++ b/package.json',
                    '@@ -9 +9 @@',
                    '-    "node": "^22.23.4 || ^24.22.1"',
                    '+    "node": "^22.23.5 || ^24.22.3"',
                ].join('\n')
            }
            if (c.includes('git log')) {
                return 'abc1234\x1fbuild(deps)!: 提升 Node 基线\npackage.json\npackages/core/package.json\n'
            }
            return ''
        })
        main()
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('@dependfix/core: minor'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('engines-only breaking 按 minor 处理：abc1234'))
        expect(vi.mocked(writeFileSync).mock.lastCall?.[1]).toContain('engines-only breaking 按 minor 处理')
    })

    it('uses latest merged tag as baseline when present', async () => {
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('tag --merged')) {
                return 'v0.2.1'
            }
            if (c.includes('--grep=')) {
                return ''
            }
            if (c.includes('git log')) {
                return 'abc1234\x1ffeat(core): 新功能\npackages/core/src/b.ts\n'
            }
            return ''
        })
        main()
        expect(console.log).toHaveBeenCalledWith('基线 tag：v0.2.1')
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('@dependfix/core: minor'))
    })

    it('skips rolling alias tags (v1) when picking the baseline', async () => {
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('tag --merged')) {
                return 'v1\nv1.0.0\n@dependfix/core@1.0.0'
            }
            if (c.includes('--grep=')) {
                return ''
            }
            if (c.includes('git log')) {
                return 'abc1234\x1ffeat(core): 新功能\npackages/core/src/b.ts\n'
            }
            return ''
        })
        main()
        expect(console.log).toHaveBeenCalledWith('基线 tag：v1.0.0')
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('@dependfix/core: minor'))
    })

    it('falls back to full history when only rolling alias tags exist', async () => {
        vi.mocked(execSync).mockImplementation((cmd) => {
            const c = String(cmd)
            if (c.includes('tag --merged')) {
                return 'v1'
            }
            if (c.includes('--grep=')) {
                return ''
            }
            if (c.includes('git log')) {
                return 'abc1234\x1ffeat(core): 新功能\npackages/core/src/b.ts\n'
            }
            return ''
        })
        main()
        expect(console.log).toHaveBeenCalledWith('基线 tag：无（使用全量历史）')
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('::warning::仅存在滚动别名 tag'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('@dependfix/core: minor'))
    })

    it('exits 1 when plan file already exists', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})
        vi.mocked(existsSync).mockReturnValue(true)
        main()
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('已存在'))
        expect(exitSpy).toHaveBeenCalledWith(1)
    })
})
