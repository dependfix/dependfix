import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildVerifySpecs,
    collectFailures,
    collectFreshnessFailures,
    compareSectionEntries,
    createFreshCompute,
    detectFreshPrerequisites,
    describeDiff,
    isReleasedSection,
    main,
    parseVerifyArgs,
    sectionEntries,
    verifyChangelog,
} from './verify-changelog.mjs'

// main() 依赖真实 fs（readFileSync 读 package.json 与 changelog），统一 mock
vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))

// 模拟 changelog 内容（minor 段 + patch 段 + 历史段，与 create-github-release.test.mjs 同款形态）
const changelog = [
    '# dependfix',
    '',
    '## [0.2.1](https://github.com/dependfix/dependfix/compare/0.2.0...0.2.1) (2026-08-10)',
    '',
    '### 🐛 Bug 修复',
    '',
    '* **cli:** 修复问题 ([abc1234](https://github.com/dependfix/dependfix/commit/abc1234))',
    '',
    '# [0.2.0](https://github.com/dependfix/dependfix/compare/0.1.0...0.2.0) (2026-08-08)',
    '',
    '### ✨ 新功能',
    '',
    '* **cli:** 新增能力 ([def5678](https://github.com/dependfix/dependfix/commit/def5678))',
    '',
].join('\n')

describe('verifyChangelog', () => {
    it('passes when the version section exists (minor heading)', () => {
        expect(verifyChangelog(changelog, '0.2.0')).toBe(true)
    })

    it('passes when the version section exists (patch heading)', () => {
        expect(verifyChangelog(changelog, '0.2.1')).toBe(true)
    })

    it('fails when the version section is missing', () => {
        expect(verifyChangelog(changelog, '0.3.0')).toBe(false)
    })

    it('fails for empty content', () => {
        expect(verifyChangelog('', '0.2.0')).toBe(false)
    })
})

describe('buildVerifySpecs', () => {
    const packages = [
        { path: 'packages/core', pkg: '@dependfix/core', changelog: 'packages/core/CHANGELOG.md' },
        { path: 'packages/cli', pkg: 'dependfix', changelog: 'packages/cli/CHANGELOG.md', rootChangelog: true },
        { path: 'packages/mcp', pkg: '@dependfix/mcp', changelog: 'packages/mcp/CHANGELOG.md' },
    ]

    it('builds specs for each package changelog plus root', () => {
        const specs = buildVerifySpecs(packages, (path) => (path === 'packages/cli' ? '0.2.1' : '0.1.0'))
        expect(specs).toEqual([
            { file: 'packages/core/CHANGELOG.md', version: '0.1.0' },
            { file: 'packages/cli/CHANGELOG.md', version: '0.2.1' },
            { file: 'packages/mcp/CHANGELOG.md', version: '0.1.0' },
            // 根级 CHANGELOG 锚 = 主交付物（rootChangelog 包）版本
            { file: 'CHANGELOG.md', version: '0.2.1' },
        ])
    })
})

describe('collectFailures', () => {
    const specs = [
        { file: 'packages/core/CHANGELOG.md', version: '0.2.0' },
        { file: 'packages/cli/CHANGELOG.md', version: '0.3.0' },
        { file: 'missing/CHANGELOG.md', version: '0.1.0' },
    ]
    const readFile = (file) => {
        if (file === 'missing/CHANGELOG.md') {
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }
        return changelog
    }

    it('collects missing-section failures', () => {
        // 仅缺段场景（不含缺失文件，ENOENT 单独用例覆盖）
        const okSpecs = [{ file: 'packages/core/CHANGELOG.md', version: '0.2.0' }, { file: 'packages/cli/CHANGELOG.md', version: '0.3.0' }]
        const failures = collectFailures(okSpecs, readFile)
        expect(failures).toHaveLength(1)
        expect(failures[0]).toContain('packages/cli/CHANGELOG.md 缺少版本段 0.3.0')
    })

    it('reports missing file separately with ENOENT message', () => {
        const failures = collectFailures(specs, readFile)
        expect(failures.some((f) => f.includes('missing/CHANGELOG.md 不存在'))).toBe(true)
        // 缺段 + 不存在各计一项（specs 全量场景共 2 项）
        expect(failures).toHaveLength(2)
    })

    it('returns empty when all pass', () => {
        const okSpecs = [{ file: 'packages/core/CHANGELOG.md', version: '0.2.0' }]
        expect(collectFailures(okSpecs, readFile)).toEqual([])
    })

    it('rethrows non-ENOENT read errors (fail-closed, not silently skipped)', () => {
        const readFile = () => {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
        }
        expect(() => collectFailures([{ file: 'packages/core/CHANGELOG.md', version: '0.2.0' }], readFile)).toThrow('permission denied')
    })
})

describe('--fresh 新鲜度比对', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const sectionOf = (entries) =>
        ['## [1.0.0](https://example.com/compare) (2026-11-12)', '', '### 新功能', '', ...entries.map((e) => `* ${e}`), ''].join('\n')

    it('sectionEntries 只取条目行并归一空白', () => {
        expect(sectionEntries('## 1.0.0\n\n### 分组\n\n* a\n*   b   c  \nnot-entry\n')).toEqual(['* a', '* b c'])
        expect(sectionEntries(null)).toEqual([])
    })

    it('compareSectionEntries 标出缺失 / 多余，并按次数处理重复条目', () => {
        expect(compareSectionEntries('* a\n* b', '* a\n* b').fresh).toBe(true)
        expect(compareSectionEntries('* a\n* b', '* a')).toMatchObject({ fresh: false, missing: ['* b'], extra: [] })
        expect(compareSectionEntries('* a', '* a\n* c')).toMatchObject({ fresh: false, missing: [], extra: ['* c'] })
        expect(compareSectionEntries('* a\n* a', '* a')).toMatchObject({ fresh: false, missing: ['* a'], extra: [] })
    })

    it('describeDiff 限制示例数量', () => {
        const diff = compareSectionEntries('* a\n* b\n* c', '* x\n* y\n* z')
        const text = describeDiff(diff)
        expect(text).toContain('缺少 3 项')
        expect(text).toContain('多出 3 项')
        expect(text.split(' / ').length).toBeLessThanOrEqual(3)
    })

    it('collectFreshnessFailures：一致通过 / 陈旧失败 / 空重算通过 / 缺文件与缺段分流', async () => {
        const specs = [{ file: 'CHANGELOG.md', version: '1.0.0' }]
        const freshSection = sectionOf(['a'])
        await expect(
            collectFreshnessFailures(specs, { readFile: () => freshSection, compute: async () => freshSection }),
        ).resolves.toEqual([])
        const stale = await collectFreshnessFailures(specs, {
            readFile: () => freshSection,
            compute: async () => sectionOf(['a', 'b']),
        })
        expect(stale).toHaveLength(1)
        expect(stale[0]).toContain('CHANGELOG.md')
        expect(stale[0]).toContain('缺少 1 项')
        // 已发布版本无未发布内容 → 无重算段，视为通过
        await expect(
            collectFreshnessFailures(specs, { readFile: () => freshSection, compute: async () => '' }),
        ).resolves.toEqual([])
        const missingFile = await collectFreshnessFailures(specs, {
            readFile: () => {
                throw Object.assign(new Error('nope'), { code: 'ENOENT' })
            },
            compute: async () => '',
        })
        expect(missingFile[0]).toContain('不存在')
        const missingSection = await collectFreshnessFailures(specs, {
            readFile: () => '# other\n\n## 9.9.9\n',
            compute: async () => '',
        })
        expect(missingSection[0]).toContain('缺少版本段')
        await expect(
            collectFreshnessFailures(specs, {
                readFile: () => {
                    throw new Error('permission denied')
                },
                compute: async () => '',
            }),
        ).rejects.toThrow('permission denied')
    })

    it('parseVerifyArgs 解析 --fresh / --help，未知参数 fail-closed', () => {
        expect(parseVerifyArgs([])).toEqual({ fresh: false, help: false })
        expect(parseVerifyArgs(['--fresh'])).toEqual({ fresh: true, help: false })
        expect(parseVerifyArgs(['--help'])).toEqual({ fresh: false, help: true })
        expect(() => parseVerifyArgs(['--freshh'])).toThrow(/未知参数/)
    })

    it('detectFreshPrerequisites 识别浅克隆 / 无 tag / 正常', () => {
        expect(detectFreshPrerequisites(() => 'true')).toEqual({ ok: false, reason: 'shallow-clone' })
        expect(detectFreshPrerequisites((args) => (args[0] === 'tag' ? '' : 'false'))).toEqual({
            ok: false,
            reason: 'no-tags',
        })
        expect(detectFreshPrerequisites((args) => (args[0] === 'tag' ? 'v1.0.0' : 'false'))).toEqual({ ok: true })
    })

    it('isReleasedSection 按本地 tag 识别已发布段', () => {
        const target = { tags: { prefix: 'pkg@' } }
        expect(isReleasedSection(target, '1.0.0', (args) => (args.includes('pkg@1.0.0') ? 'tag-sha' : ''))).toBe(true)
        expect(
            isReleasedSection(target, '1.0.0', () => {
                throw new Error('not found')
            }),
        ).toBe(false)
    })

    it('createFreshCompute：已发布段跳过重算（误报护栏），未发布段交给生成器', async () => {
        const computeUnreleasedSection = vi.fn(async () => sectionOf(['b']))
        const loadGenerator = async () => ({
            CHANGELOG_TARGETS: [{ file: 'CHANGELOG.md', tags: { prefix: 'v' }, pkg: 'package.json' }],
            computeUnreleasedSection,
        })
        const readFile = () => JSON.stringify({ version: '1.0.0' })
        const readGitReleased = (args) => {
            if (args[0] === 'rev-parse') {
                return 'tag-sha'
            }
            if (args[0] === 'log') {
                return '2026-11-12T00:00:00Z'
            }
            throw new Error('no remote')
        }
        const released = await createFreshCompute({ readGit: readGitReleased, readFile, loadGenerator })
        await expect(released({ file: 'CHANGELOG.md', version: '1.0.0' })).resolves.toBe('')
        expect(computeUnreleasedSection).not.toHaveBeenCalled()

        const readGitUnreleased = (args) => {
            if (args[0] === 'rev-parse') {
                throw new Error('not found')
            }
            if (args[0] === 'log') {
                return '2026-11-12T00:00:00Z'
            }
            throw new Error('no remote')
        }
        const unreleased = await createFreshCompute({ readGit: readGitUnreleased, readFile, loadGenerator })
        await expect(unreleased({ file: 'CHANGELOG.md', version: '1.0.1' })).resolves.toBe(sectionOf(['b']))
        expect(computeUnreleasedSection).toHaveBeenCalledTimes(1)
    })

    it('main 未知参数退出 2（fail-closed）', async () => {
        const code = await main({ argv: ['--bogus'] })
        expect(code).toBe(2)
    })

    it('main --fresh 在浅克隆但缺版本段时仍退出 1（存在性不被 fail-open 吞掉）', async () => {
        vi.mocked(readFileSync).mockImplementation((file) => {
            if (String(file).endsWith('package.json')) {
                return JSON.stringify({ version: '2.0.0' })
            }
            return sectionOf(['a'])
        })
        const code = await main({
            argv: ['--fresh'],
            deps: { detectPrerequisites: () => ({ ok: false, reason: 'shallow-clone' }) },
        })
        expect(code).toBe(1)
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('缺少版本段'))
    })

    it('main --fresh 在浅克隆时告警放行（fail-open 但不作为通过证据）', async () => {
        vi.mocked(readFileSync).mockImplementation((file) => {
            if (String(file).endsWith('package.json')) {
                return JSON.stringify({ version: '1.0.0' })
            }
            return sectionOf(['a'])
        })
        const code = await main({
            argv: ['--fresh'],
            deps: { detectPrerequisites: () => ({ ok: false, reason: 'shallow-clone' }) },
        })
        expect(code).toBe(0)
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('::warning::'))
    })

    it('main --fresh 陈旧时退出 1 并指出文件', async () => {
        vi.mocked(readFileSync).mockImplementation((file) => {
            if (String(file).endsWith('package.json')) {
                return JSON.stringify({ version: '1.0.0' })
            }
            return sectionOf(['a'])
        })
        const code = await main({
            argv: ['--fresh'],
            deps: {
                detectPrerequisites: () => ({ ok: true }),
                computeSpec: async () => sectionOf(['a', 'b']),
            },
        })
        expect(code).toBe(1)
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('::error::'))
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('缺少 1 项'))
    })
})

describe('main', () => {
    const changelogWithSection = [
        '# dependfix',
        '',
        '## [0.2.1](https://github.com/dependfix/dependfix/compare/0.2.0...0.2.1) (2026-08-12)',
        '',
        '### ✨ 新功能',
        '',
        '* **cli:** 发布能力 ([abc1234](https://github.com/dependfix/dependfix/commit/abc1234))',
        '',
    ].join('\n')

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('passes when all package and root changelogs contain the version sections', async () => {
        vi.mocked(readFileSync).mockImplementation((file) => {
            if (String(file).endsWith('package.json')) {
                return JSON.stringify({ version: '0.2.1' })
            }
            return changelogWithSection
        })
        const code = await main({ argv: [] })
        expect(code).toBe(0)
        expect(console.log).toHaveBeenCalledWith('changelog is up to date')
        expect(console.error).not.toHaveBeenCalled()
    })

    it('reports failures with ::error:: and exits 1 when a section is missing', async () => {
        vi.mocked(readFileSync).mockImplementation((file) => {
            if (String(file).endsWith('package.json')) {
                return JSON.stringify({ version: '9.9.9' })
            }
            return changelogWithSection
        })
        const code = await main({ argv: [] })
        expect(code).toBe(1)
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('::error::'))
    })
})
