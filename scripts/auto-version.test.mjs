import { describe, expect, it } from 'vitest'
import { buildChangelogByPkg, getChangedPackages, hasStagedChanges, readHeadFile, resolveNotes, run } from './auto-version.mjs'

// 模拟发布包清单（结构对齐 packages.config.mjs）
const packages = [
    { path: 'packages/core', pkg: '@dependfix/core', changelog: 'packages/core/CHANGELOG.md' },
    { path: 'packages/cli', pkg: 'dependfix', changelog: 'packages/cli/CHANGELOG.md', rootChangelog: true },
    { path: 'packages/mcp', pkg: '@dependfix/mcp', changelog: 'packages/mcp/CHANGELOG.md' },
]

const rootChangelog = [
    '# dependfix',
    '',
    '# [0.2.0](https://github.com/dependfix/dependfix/compare/0.1.0...0.2.0) (2026-08-08)',
    '',
    '### ✨ 新功能',
    '',
    '* **cli:** 新增能力 ([def5678](https://github.com/dependfix/dependfix/commit/def5678))',
    '',
].join('\n')

const coreChangelog = [
    '# @dependfix/core',
    '',
    '# [0.3.0](https://github.com/dependfix/dependfix/compare/0.2.0...0.3.0) (2026-08-10)',
    '',
    '### ✨ 新功能',
    '',
    '* **core:** 新 API ([aaa1111](https://github.com/dependfix/dependfix/commit/aaa1111))',
    '',
].join('\n')

describe('getChangedPackages', () => {
    it('lists packages whose workspace version differs from HEAD', () => {
        const changed = getChangedPackages(
            (path) => (path === 'packages/core' ? '0.3.0' : '0.2.0'),
            (path) => '0.2.0',
            packages,
        )
        expect(changed).toEqual([{ pkg: '@dependfix/core', version: '0.3.0' }])
    })

    it('treats missing HEAD package as 0.0.0 (new package)', () => {
        const changed = getChangedPackages(
            (path) => '0.1.0',
            (path) => null,
            packages,
        )
        expect(changed).toHaveLength(3)
    })

    it('returns empty when versions match', () => {
        const changed = getChangedPackages(() => '0.2.0', () => '0.2.0', packages)
        expect(changed).toEqual([])
    })
})

describe('readHeadFile', () => {
    it('returns content when HEAD has the file', () => {
        const git = (args) => (args.startsWith('show HEAD:') ? '{"version":"0.2.0"}' : '')
        expect(readHeadFile(git, 'packages/cli/package.json')).toBe('{"version":"0.2.0"}')
    })

    it('returns null when HEAD lacks the file', () => {
        const git = (args) => {
            if (args.startsWith('show HEAD:')) {
                throw new Error('path does not exist')
            }
            return ''
        }
        expect(readHeadFile(git, 'packages/mcp/package.json')).toBeNull()
    })
})

describe('hasStagedChanges', () => {
    it('returns false when git diff --cached --quiet exits 0', () => {
        expect(hasStagedChanges(() => '')).toBe(false)
    })

    it('returns true when git diff --cached --quiet exits non-zero', () => {
        const git = () => {
            throw new Error('exit 1')
        }
        expect(hasStagedChanges(git)).toBe(true)
    })
})

describe('resolveNotes', () => {
    const files = { byPkg: { '@dependfix/core': 'packages/core/CHANGELOG.md' } }
    const readFile = (path) => (path === files.byPkg['@dependfix/core'] ? coreChangelog : '')

    it('prefers root changelog section', () => {
        const notes = resolveNotes(rootChangelog, files, { pkg: 'dependfix', version: '0.2.0' }, readFile)
        expect(notes).toContain('# [0.2.0]')
        expect(notes).toContain('新增能力')
    })

    it('falls back to anchor package changelog when root section missing (core-only)', () => {
        const notes = resolveNotes(rootChangelog, files, { pkg: '@dependfix/core', version: '0.3.0' }, readFile)
        expect(notes).toContain('新 API')
    })

    it('returns null when neither root nor package changelog has the version', () => {
        const notes = resolveNotes(rootChangelog, files, { pkg: '@dependfix/core', version: '9.9.9' }, readFile)
        expect(notes).toBeNull()
    })
})

describe('buildChangelogByPkg', () => {
    it('maps publishable packages with changelog to their paths', () => {
        const byPkg = buildChangelogByPkg()
        expect(byPkg['@dependfix/core']).toBe('packages/core/CHANGELOG.md')
        expect(byPkg.dependfix).toBe('packages/cli/CHANGELOG.md')
        expect(Object.keys(byPkg)).toContain('@dependfix/mcp')
    })
})

describe('run', () => {
    // run() 依赖注入 fixture：真实 PUBLISHABLE_PACKAGES（5 包），cli 为 rootChangelog 锚包
    const cliVersion = { current: '0.3.0', head: '0.1.0' }
    const changelogBody = [
        '# dependfix',
        '',
        '# [0.3.0](https://github.com/dependfix/dependfix/compare/0.2.0...0.3.0) (2026-08-12)',
        '',
        '### ✨ 新功能',
        '',
        '* **cli:** 发布能力 ([abc1234](https://github.com/dependfix/dependfix/commit/abc1234))',
        '',
    ].join('\n')

    const makeDeps = (overrides = {}) => {
        const calls = { exec: [], git: [] }
        const files = new Map([
            ['packages/cli/package.json', JSON.stringify({ version: cliVersion.current })],
            ['CHANGELOG.md', changelogBody],
        ])
        const deps = {
            planFile: 'release-plan.md',
            exec: (cmd) => calls.exec.push(cmd),
            readFile: (path) => files.get(path) ?? JSON.stringify({ version: '0.1.0' }),
            exists: (path) => files.has(path),
            unlink: (path) => files.delete(path),
            writeFile: (path, content) => {
                calls.msgFile = content
                calls.msgPath = path
            },
            tmpFile: 'release-msg.txt',
            git: (args) => {
                calls.git.push(args)
                if (args.startsWith('show HEAD:packages/cli/package.json')) {
                    return JSON.stringify({ version: cliVersion.head })
                }
                if (args.startsWith('show HEAD:')) {
                    return JSON.stringify({ version: '0.1.0' })
                }
                if (args === 'diff --cached --quiet') {
                    // 默认有变更（抛出 → hasStagedChanges 为 true）
                    throw new Error('exit 1')
                }
                return ''
            },
            ...overrides,
        }
        return { deps, calls }
    }

    it('no-ops when no staged changes after plan/changelog', () => {
        const { deps, calls } = makeDeps({
            git: (args) => {
                calls.git.push(args)
                if (args === 'diff --cached --quiet') {
                    return ''
                }
                return ''
            },
        })
        run({ git: deps.git, token: 't', repository: 'r/r' }, deps)

        expect(calls.exec).toEqual(['pnpm release:plan', 'pnpm changelog'])
        // hasStagedChanges 内部也会调用 git('diff --cached --quiet')
        expect(calls.git).toEqual(['add -A', 'diff --cached --quiet'])
        expect(calls.msgFile).toBeUndefined()
    })

    it('skips release:version when no plan file is generated', () => {
        const { deps, calls } = makeDeps()
        run({ git: deps.git, token: 't', repository: 'r/r' }, deps)

        // plan 文件不存在（fixture 未放入）→ 无 release:version 调用
        expect(calls.exec).toContain('pnpm release:plan')
        expect(calls.exec).not.toContain('pnpm release:version')
    })

    it('runs release:version when plan file exists and pushes release commit', () => {
        const { deps, calls } = makeDeps({
            exists: (path) => path === 'release-plan.md' || path === 'CHANGELOG.md',
        })
        run({ git: deps.git, token: 'tok', repository: 'dependfix/dependfix' }, deps)

        expect(calls.exec).toEqual(['pnpm release:plan', 'pnpm release:version', 'pnpm changelog'])
        expect(calls.git).toContain('config user.name "github-actions[bot]"')
        expect(calls.git).toContain('config user.email "41898282+github-actions[bot]@users.noreply.github.com"')
        expect(calls.git).toContain('commit -F "release-msg.txt"')
        expect(calls.git).toContain('push "https://x-access-token:tok@github.com/dependfix/dependfix.git" master')
        expect(calls.msgFile).toContain('chore(release): 0.3.0 [skip ci]')
        expect(calls.msgFile).toContain('发布能力')
    })

    it('falls back to package changelog when root section missing (core-only)', () => {
        const { deps, calls } = makeDeps({
            readFile: (path) => {
                if (path === 'packages/core/package.json') {
                    return JSON.stringify({ version: '0.4.0' })
                }
                if (path === 'packages/cli/package.json') {
                    return JSON.stringify({ version: '0.1.0' })
                }
                if (path === 'CHANGELOG.md') {
                    return '# dependfix\n' // 无 0.4.0 段
                }
                if (path === 'packages/core/CHANGELOG.md') {
                    return [
                        '# @dependfix/core',
                        '',
                        '# [0.4.0](https://github.com/dependfix/dependfix/compare/0.3.0...0.4.0) (2026-08-12)',
                        '',
                        '### ✨ 新功能',
                        '',
                        '* **core:** 新 API ([aaa1111](https://github.com/dependfix/dependfix/commit/aaa1111))',
                        '',
                    ].join('\n')
                }
                return JSON.stringify({ version: '0.1.0' })
            },
            exists: (path) => path === 'release-plan.md',
            git: (args) => {
                calls.git.push(args)
                if (args.startsWith('show HEAD:packages/core/package.json')) {
                    return JSON.stringify({ version: '0.3.0' })
                }
                if (args.startsWith('show HEAD:')) {
                    return JSON.stringify({ version: '0.1.0' })
                }
                if (args === 'diff --cached --quiet') {
                    throw new Error('exit 1')
                }
                return ''
            },
        })
        run({ git: deps.git, token: 'tok', repository: 'dependfix/dependfix' }, deps)

        expect(calls.msgFile).toContain('chore(release): 0.4.0 [skip ci]')
        expect(calls.msgFile).toContain('新 API')
    })

    it('throws when no version change among packages despite staged changes', () => {
        const { deps } = makeDeps({
            readFile: () => JSON.stringify({ version: '0.1.0' }),
        })
        expect(() => run({ git: deps.git, token: 't', repository: 'r/r' }, deps)).toThrow('无法确定发布版本')
    })

    it('throws when changelog section is missing', () => {
        const { deps } = makeDeps({
            readFile: (path) => (path === 'CHANGELOG.md' ? '# dependfix\n' : JSON.stringify({ version: '0.3.0' })),
        })
        expect(() => run({ git: deps.git, token: 't', repository: 'r/r' }, deps)).toThrow('缺少版本段 0.3.0')
    })

    it('cleans up temp message file in finally even when commit fails', () => {
        const { deps, calls } = makeDeps({
            exists: (path) => path === 'release-plan.md' || path === 'CHANGELOG.md',
            git: (args) => {
                calls.git.push(args)
                if (args.startsWith('show HEAD:packages/cli/package.json')) {
                    return JSON.stringify({ version: '0.1.0' })
                }
                if (args.startsWith('show HEAD:')) {
                    return JSON.stringify({ version: '0.1.0' })
                }
                if (args === 'diff --cached --quiet') {
                    throw new Error('exit 1')
                }
                if (args.startsWith('commit')) {
                    throw new Error('commit failed: fatal')
                }
                return ''
            },
            unlink: (path) => {
                calls.unlinked = path
            },
        })
        expect(() => run({ git: deps.git, token: 't', repository: 'r/r' }, deps)).toThrow('commit failed')
        expect(calls.unlinked).toBe('release-msg.txt')
    })
})
