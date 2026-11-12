/**
 * verify-changelog --fresh 的临时仓库集成用例：
 * 用真实 changelog 生成器在临时 git 仓库重算版本段，验证「生成后又加 commit」可被发现，
 * 且重算本身不写盘（acceptance：生成 → 追加 feat → --fresh 非零并指出文件 → 还原后 0）。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHANGELOG_TARGETS, computeUnreleasedSection } from './changelog.mjs'
import { buildVerifySpecs, collectFreshnessFailures } from './verify-changelog.mjs'
import { PUBLISHABLE_PACKAGES } from './packages.config.mjs'

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()

function createRepo() {
    const root = mkdtempSync(join(tmpdir(), 'dependfix-fresh-'))
    git(root, ['init', '-q'])
    git(root, ['config', 'user.email', 'fixture@example.com'])
    git(root, ['config', 'user.name', 'fixture'])
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.1.0' }, null, 2)}\n`)
    writeFileSync(join(root, 'src.txt'), 'one\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-q', '-m', 'feat: first feature'])
    git(root, ['tag', 'v1.0.0'])
    writeFileSync(join(root, 'src.txt'), 'two\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-q', '-m', 'feat: second feature'])
    return root
}

const target = {
    file: 'CHANGELOG.md',
    title: 'fixture',
    commits: {},
    tags: { prefix: 'v' },
    pkg: 'package.json',
    npmPublishable: true,
}

function compute(root) {
    return computeUnreleasedSection(target, {
        version: '1.1.0',
        currentPkgJson: { version: '1.1.0' },
        repo: null,
        headDate: '2026-11-12',
        root,
    })
}

describe('verify-changelog --fresh（临时 git 仓库）', () => {
    it('发布包的 changelog 文件集合全部有对应 target（新鲜度不会被静默跳过）', () => {
        const targets = new Set(CHANGELOG_TARGETS.map((target) => target.file))
        for (const spec of buildVerifySpecs(PUBLISHABLE_PACKAGES, () => '1.0.0')) {
            expect(targets.has(spec.file)).toBe(true)
        }
    })

    it(
        '生成后追加 feat commit → 判定陈旧并指出文件；重算不写盘',
        async () => {
            const root = createRepo()
            const generated = await compute(root)
            expect(generated).toContain('second feature')
            expect(generated).not.toContain('first feature')

            const changelogPath = join(root, 'CHANGELOG.md')
            writeFileSync(changelogPath, `# fixture\n\n${generated}`)
            const before = readFileSync(changelogPath, 'utf8')
            const specs = [{ file: 'CHANGELOG.md', version: '1.1.0' }]
            const readFile = () => readFileSync(changelogPath, 'utf8')

            // 与磁盘一致 → 通过
            await expect(
                collectFreshnessFailures(specs, { readFile, compute: async () => compute(root) }),
            ).resolves.toEqual([])

            // 追加 commit 后版本段未重生成 → 陈旧
            writeFileSync(join(root, 'src.txt'), 'three\n')
            git(root, ['add', '.'])
            git(root, ['commit', '-q', '-m', 'feat: third feature'])
            const failures = await collectFreshnessFailures(specs, {
                readFile,
                compute: async () => compute(root),
            })
            expect(failures).toHaveLength(1)
            expect(failures[0]).toContain('CHANGELOG.md 的版本段 1.1.0 不是最新')
            expect(failures[0]).toContain('third feature')

            // 重算全程不写盘
            expect(readFileSync(changelogPath, 'utf8')).toBe(before)
        },
        60_000,
    )
})
