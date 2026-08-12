import { describe, expect, it, vi } from 'vitest'
import { cleanupUnreleasedSections, mergeUnreleased, versionLt } from './changelog.mjs'

describe('versionLt', () => {
    it('compares numeric segments (0.9.0 < 0.10.0)', () => {
        expect(versionLt('0.9.0', '0.10.0')).toBe(true)
        expect(versionLt('0.3.0', '0.3.1')).toBe(true)
        expect(versionLt('0.3.1', '0.3.0')).toBe(false)
        expect(versionLt('0.3.1', '0.3.1')).toBe(false)
    })
})

// 样例：头部 + 当前版本段（0.3.1）+ 残留段（0.3.0）+ 已发布段（0.2.0，有 tag）
const sample = [
    '# dependfix',
    '',
    '## [0.3.1](https://github.com/dependfix/dependfix/compare/dependfix@0.2.0...dependfix@0.3.1) (2026-08-12)',
    '',
    '### ✨ 新功能',
    '',
    '* **mcp:** 实施能力补充 ([62a655e](https://github.com/dependfix/dependfix/commit/62a655e))',
    '',
    '# [0.3.0](https://github.com/dependfix/dependfix/compare/dependfix@0.2.0...dependfix@0.3.0) (2026-08-12)',
    '',
    '### ✨ 新功能',
    '',
    '* **mcp:** 实施能力补充 ([62a655e](https://github.com/dependfix/dependfix/commit/62a655e))',
    '',
    '# [0.2.0](https://github.com/dependfix/dependfix/compare/dependfix@0.1.0...dependfix@0.2.0) (2026-08-07)',
    '',
    '### ✨ 新功能',
    '',
    '* 多版本共存分别 overrides 修复链路 ([89d8c50](https://github.com/dependfix/dependfix/commit/89d8c50))',
    '',
].join('\n')

const baseDeps = {
    version: '0.3.1',
    prefix: 'dependfix@',
    pkgName: 'dependfix',
    hasTag: (tagName) => tagName === 'dependfix@0.2.0',
    isPublished: async () => false,
}

describe('cleanupUnreleasedSections', () => {
    it('removes unreleased residue sections below current version', async () => {
        const isPublished = vi.fn(async () => false)
        const out = await cleanupUnreleasedSections(sample, { ...baseDeps, isPublished })
        expect(out).not.toContain('[0.3.0](')
        expect(out).toContain('## [0.3.1](')
        expect(out).toContain('# [0.2.0](')
        // 0.3.0 查过 npm；0.2.0 因本地 tag 短路不查
        expect(isPublished).toHaveBeenCalledWith('dependfix', '0.3.0')
        expect(isPublished).toHaveBeenCalledTimes(1)
    })

    it('keeps section when npm already published (manual publish without tag)', async () => {
        const out = await cleanupUnreleasedSections(sample, {
            ...baseDeps,
            isPublished: async (pkg, ver) => ver === '0.3.0',
        })
        expect(out).toContain('[0.3.0](')
        expect(out).toContain('[0.2.0](')
    })

    it('keeps sections conservatively on registry query failure', async () => {
        const out = await cleanupUnreleasedSections(sample, { ...baseDeps, isPublished: async () => null })
        expect(out).toBe(sample)
    })

    it('returns same reference when nothing to clean', async () => {
        const out = await cleanupUnreleasedSections(sample, {
            ...baseDeps,
            hasTag: (t) => t === 'dependfix@0.2.0' || t === 'dependfix@0.3.0',
        })
        expect(out).toBe(sample)
    })

    it('normalizes blank lines and file tail after removal', async () => {
        const out = await cleanupUnreleasedSections(sample, baseDeps)
        expect(out).not.toMatch(/\n{3,}/)
        expect(out.endsWith('\n')).toBe(true)
    })

    it('compresses excess blank lines around removed sections (strong assertion)', async () => {
        // 残留段前后各插入两个空行（\n\n\n\n），删除后应压缩为段间单个空行
        const padded = sample.replace('# [0.3.0](', '\n\n\n# [0.3.0](').replace(/\n# \[0\.2\.0\]\(/, '\n\n\n# [0.2.0](')
        expect(padded).toMatch(/\n{4,}/)
        const out = await cleanupUnreleasedSections(padded, baseDeps)
        expect(out).not.toMatch(/\n{3,}/)
        expect(out).toContain('([62a655e](https://github.com/dependfix/dependfix/commit/62a655e))\n\n# [0.2.0](')
    })

    it('returns same reference when file has no version sections', async () => {
        const noSections = '# dependfix\n\n一些说明文字\n'
        const out = await cleanupUnreleasedSections(noSections, baseDeps)
        expect(out).toBe(noSections)
    })

    it('removes residue section at file head and keeps title formatting', async () => {
        // 头部标题后直接是残留段（0.3.0），删除后标题与当前段之间格式正常
        const headResidue = `# dependfix\n\n# [0.3.0](https://github.com/dependfix/dependfix/compare/dependfix@0.2.0...dependfix@0.3.0) (2026-08-12)\n\n### ✨ 新功能\n\n* 旧条目 ([0000000](https://github.com/dependfix/dependfix/commit/0000000))\n`
        const out = await cleanupUnreleasedSections(headResidue, baseDeps)
        // 全部段删除后文件尾空白收敛为单个换行（与 mergeUnreleased 同款口径）
        expect(out).toBe('# dependfix\n')
        expect(out).not.toMatch(/\n{3,}/)
    })

    it('removes multiple residue sections at once', async () => {
        const out = await cleanupUnreleasedSections(sample, {
            ...baseDeps,
            hasTag: (t) => t === 'dependfix@0.1.0',
        })
        expect(out).not.toContain('[0.3.0](')
        expect(out).not.toContain('[0.2.0](')
        expect(out).toContain('## [0.3.1](')
        expect(out).not.toMatch(/\n{3,}/)
    })
})

describe('mergeUnreleased', () => {
    const unreleased = '## [0.2.1](https://github.com/dependfix/dependfix/compare/dependfix@0.2.0...dependfix@0.2.1) (2026-08-12)\n\n### ✨ 新功能\n\n* **cli:** 新条目 ([abc1234](https://github.com/dependfix/dependfix/commit/abc1234))\n'
    const oldSection = '# [0.2.1](https://github.com/dependfix/dependfix/compare/dependfix@0.2.0...dependfix@0.2.1) (2026-08-10)\n\n### ✨ 新功能\n\n* **cli:** 旧条目 ([def5678](https://github.com/dependfix/dependfix/commit/def5678))\n'
    const historySection = '# [0.2.0](https://github.com/dependfix/dependfix/compare/dependfix@0.1.0...dependfix@0.2.0) (2026-08-09)\n\n### ✨ 新功能\n\n* **cli:** 历史条目 ([feed001](https://github.com/dependfix/dependfix/commit/feed001))\n'

    it('appends after title when file has no version sections', () => {
        const existing = '# dependfix\n\n'
        const out = mergeUnreleased(existing, '0.2.1', unreleased)
        expect(out).toBe(`# dependfix\n\n${unreleased}`)
    })

    it('replaces the top same-version section keeping later history', () => {
        const existing = `# dependfix\n\n${oldSection}\n${historySection}`
        const out = mergeUnreleased(existing, '0.2.1', unreleased)
        expect(out).toContain(unreleased)
        expect(out).not.toContain('旧条目')
        expect(out).toContain('历史条目')
        // 新段 + 历史段完整保留
        expect(out).toBe(`# dependfix\n\n${unreleased}\n${historySection}`)
    })

    it('replaces to end of file when top section is the only section', () => {
        const existing = `# dependfix\n\n${oldSection}`
        const out = mergeUnreleased(existing, '0.2.1', unreleased)
        expect(out).toBe(`# dependfix\n\n${unreleased}\n`)
    })

    it('inserts before the first version section when top version differs', () => {
        const existing = `# dependfix\n\n${historySection}`
        const out = mergeUnreleased(existing, '0.2.1', unreleased)
        expect(out).toBe(`# dependfix\n\n${unreleased}\n${historySection}`)
    })
})
