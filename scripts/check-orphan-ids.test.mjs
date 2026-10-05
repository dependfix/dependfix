import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    analyzeContent,
    collectFiles,
    extractCommentUnits,
    extractTrailingComment,
    findOrphanIds,
    formatReport,
} from './check-orphan-ids.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orphan-ids-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
}

describe('extractCommentUnits', () => {
    it('把连续行注释归为一个块', () => {
        const units = extractCommentUnits('// a\n// b\nconst x = 1\n', '.ts')
        expect(units).toHaveLength(1)
        expect(units[0].lines).toHaveLength(2)
    })

    it('把多行块注释归为一个块', () => {
        const units = extractCommentUnits('/**\n * a\n */\nconst x = 1\n', '.ts')
        expect(units).toHaveLength(1)
        expect(units[0].lines).toHaveLength(3)
    })

    it('识别测试名单元', () => {
        const units = extractCommentUnits('it(\'x\', () => {})\n', '.ts')
        expect(units).toHaveLength(1)
        expect(units[0].kind).toBe('test-name')
    })

    it('识别 hash 行注释（yml）', () => {
        const units = extractCommentUnits('# a\n# b\nname: x\n', '.yml')
        expect(units).toHaveLength(1)
        expect(units[0].lines).toHaveLength(2)
    })
})

describe('extractTrailingComment', () => {
    it('提取行尾随 // 注释', () => {
        expect(extractTrailingComment('const a = 1 // M20 调整')).toBe('// M20 调整')
    })

    it('不把 URL 的 :// 当注释', () => {
        expect(extractTrailingComment('const url = \'https://example.com\'')).toBeNull()
    })

    it('URL 后的行尾注释仍可提取', () => {
        expect(extractTrailingComment('const url = \'https://example.com\' // M20')).toBe('// M20')
    })

    it('提取行内块注释', () => {
        expect(extractTrailingComment('const a = 1 /* M20 */')).toBe('/* M20 */')
    })
})

describe('analyzeContent', () => {
    it('无文档指针的孤立编号判为违规', () => {
        const { hits } = analyzeContent('// 上游告警唯一 ID（M20 新增）。\n', '.ts')
        expect(hits).toHaveLength(1)
        expect(hits[0].ids).toContain('M20')
    })

    it('带文档指针的导航编号合规', () => {
        const { hits, compliantIds } = analyzeContent('// M20 调整（见 docs/plan/todo.md）\n', '.ts')
        expect(hits).toHaveLength(0)
        expect(compliantIds).toContain('M20')
    })

    it('块级：块内任一指针令整块合规', () => {
        const source = '/**\n * M20 调整\n * 背景见 backlog.md\n */\n'
        const { hits } = analyzeContent(source, '.ts')
        expect(hits).toHaveLength(0)
    })

    it('真常量白名单命中忽略', () => {
        const { hits } = analyzeContent('// 使用 Cloudflare R2 存储\n', '.ts')
        expect(hits).toHaveLength(0)
    })

    it('测试名中的编号同样检测', () => {
        const { hits } = analyzeContent('it(\'默认响应包含 M20.3 新增字段\', () => {})\n', '.ts')
        expect(hits).toHaveLength(1)
        expect(hits[0].ids).toContain('M20.3')
    })

    it('命中精确到行号', () => {
        const { hits } = analyzeContent('// 标题\n// 次行 M20.3\n', '.ts')
        expect(hits).toHaveLength(1)
        expect(hits[0].line).toBe(2)
    })

    it('检测代码行尾随注释中的编号', () => {
        const { hits } = analyzeContent('const code = \'SCAN_PENDING_MERGED\', // M18.x 治理批次\n', '.ts')
        expect(hits).toHaveLength(1)
        expect(hits[0].ids.some((id) => id.startsWith('M18'))).toBe(true)
    })

    it('检测审计 / 决策编号（RG / D / S）', () => {
        expect(analyzeContent('// RG-B01 修复：重复计数\n', '.ts').hits).toHaveLength(1)
        expect(analyzeContent('// 关键决策 D6 per-org scope\n', '.ts').hits).toHaveLength(1)
        expect(analyzeContent('// S-5 治理批次删除死代码\n', '.ts').hits).toHaveLength(1)
    })

    it('检测裸警告 / 建议编号（W / S，兼容带连字符与裸写法）', () => {
        expect(analyzeContent('// W2 大小写兼容：URL query\n', '.ts').hits).toHaveLength(1)
        expect(analyzeContent('it(\'W10 教训：selectedRows 不被排序重置\', () => {})\n', '.ts').hits).toHaveLength(1)
        expect(analyzeContent('// S2 回归：locale 优先级\n', '.ts').hits).toHaveLength(1)
        expect(analyzeContent('// S-5 治理批次删除死代码\n', '.ts').hits).toHaveLength(1)
    })

    it('不误伤 RG 前缀项与 W3C 等单词', () => {
        expect(analyzeContent('// RG-W04 修复：aria-label\n', '.ts').hits).toHaveLength(1)
        expect(analyzeContent('// RG-W04 修复：aria-label\n', '.ts').hits[0].ids).toEqual(['RG-W04'])
        expect(analyzeContent('// 遵循 W3C 规范\n', '.ts').hits).toHaveLength(0)
    })

    it('已知边界：裸 PR 编号不在检测面', () => {
        const { hits } = analyzeContent('// PR1 W10 教训\n', '.ts')
        expect(hits).toHaveLength(1)
        expect(hits[0].ids).toEqual(['W10'])
    })
})

describe('collectFiles / findOrphanIds', () => {
    it('跳过 docs 与排除目录，仅收扩展名白名单', () => {
        write('src/a.ts', '// ok\n')
        write('docs/b.ts', '// M20\n')
        write('node_modules/c.ts', '// M20\n')
        write('src/d.md', '// M20\n')
        const files = collectFiles(root).map((file) => file.slice(root.length + 1).split('\\').join('/'))
        expect(files).toContain('src/a.ts')
        expect(files).not.toContain('docs/b.ts')
        expect(files).not.toContain('node_modules/c.ts')
        expect(files).not.toContain('src/d.md')
    })

    it('findOrphanIds 汇总并按文件与行排序', () => {
        write('a.ts', '// M20\n')
        write('b.ts', '// ok\n// M23.3\n')
        const { findings, scannedFiles } = findOrphanIds(root)
        expect(scannedFiles).toBe(2)
        expect(findings.map((finding) => `${finding.file}:${finding.line}`)).toEqual(['a.ts:1', 'b.ts:2'])
    })
})

describe('formatReport', () => {
    it('输出文件数与命中数', () => {
        const text = formatReport({
            scannedFiles: 3,
            findings: [{ file: 'a.ts', line: 1, ids: ['M20'], text: '// M20' }],
        })
        expect(text).toContain('a.ts')
        expect(text).toContain('M20')
    })
})
