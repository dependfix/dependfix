/**
 * check-standards-redundant 测试：验证 scanFile / scanStandards 行为
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanFile, scanStandards, DEFAULT_KEYWORDS, OPTIONAL_KEYWORDS } from './check-standards-redundant.mjs'

describe('scanFile', () => {
    it('returns empty for clean file', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'csr-'))
        try {
            const file = join(tmp, 'clean.md')
            writeFileSync(file, '# 标题\n\n## 做什么\n\n仅写规则本身。\n')
            expect(scanFile(file)).toEqual([])
        } finally {
            rmSync(tmp, { recursive: true })
        }
    })

    it('detects 教训 keyword in body', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'csr-'))
        try {
            const file = join(tmp, 'rule.md')
            writeFileSync(file, '## 5.1 规则\n\n- 必须遵守。教训见附录。\n')
            const hits = scanFile(file)
            expect(hits).toHaveLength(1)
            expect(hits[0]).toMatchObject({ line: 3, col: 8, keyword: '教训' })
        } finally {
            rmSync(tmp, { recursive: true })
        }
    })

    it('skips fenced code blocks', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'csr-'))
        try {
            const file = join(tmp, 'code.md')
            writeFileSync(file, [
                '## 5.1 规则',
                '',
                '```bash',
                '# 教训：示例代码',
                '```',
                '',
                '- 正文不含关键词。',
            ].join('\n'))
            expect(scanFile(file)).toEqual([])
        } finally {
            rmSync(tmp, { recursive: true })
        }
    })

    it('detects multiple keywords in one line', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'csr-'))
        try {
            const file = join(tmp, 'multi.md')
            writeFileSync(file, '## 5.1 教训：经验+实证混合内容\n')
            const hits = scanFile(file)
            const kws = hits.map((h) => h.keyword)
            expect(kws).toContain('教训')
            expect(kws).toContain('经验')
            expect(kws).toContain('实证')
        } finally {
            rmSync(tmp, { recursive: true })
        }
    })

    it('respects custom keywords', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'csr-'))
        try {
            const file = join(tmp, 'sediment.md')
            writeFileSync(file, '## 5.1 沉淀为 skill\n')
            // 默认关键词不含"沉淀" → 不命中
            expect(scanFile(file)).toEqual([])
            // 显式传入"沉淀" → 命中
            const hits = scanFile(file, [...DEFAULT_KEYWORDS, ...OPTIONAL_KEYWORDS])
            expect(hits).toHaveLength(1)
            expect(hits[0].keyword).toBe('沉淀')
        } finally {
            rmSync(tmp, { recursive: true })
        }
    })
})

describe('scanStandards', () => {
    it('scans all .md files under docs/standards/', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'csr-'))
        try {
            const stdDir = join(tmp, 'docs/standards')
            mkdirSync(stdDir, { recursive: true })
            writeFileSync(join(stdDir, 'a.md'), '## 5.1 教训\n')
            writeFileSync(join(stdDir, 'b.md'), '## 5.1 经验\n')
            writeFileSync(join(stdDir, 'c.md'), '# clean\n')
            const results = scanStandards(tmp)
            expect(results).toHaveLength(2)
            expect(results.map((r) => r.file).sort()).toEqual(['docs/standards/a.md', 'docs/standards/b.md'])
        } finally {
            rmSync(tmp, { recursive: true })
        }
    })

    it('respects includeSediment option', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'csr-'))
        try {
            const stdDir = join(tmp, 'docs/standards')
            mkdirSync(stdDir, { recursive: true })
            writeFileSync(join(stdDir, 'sed.md'), '## 5.1 沉淀为 skill\n')
            // 默认不扫"沉淀"
            expect(scanStandards(tmp)).toEqual([])
            // 启用后命中
            const results = scanStandards(tmp, { includeSediment: true })
            expect(results).toHaveLength(1)
        } finally {
            rmSync(tmp, { recursive: true })
        }
    })
})