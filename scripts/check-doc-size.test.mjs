/**
 * check-doc-size 测试：阈值表解析 + 目标解析 + 四态判定（健康 / warning / 超阈值 / 豁免）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    checkDocSize,
    collectDocFiles,
    formatReport,
    globToRegExp,
    parseThresholdTable,
    resolveTargets,
} from './check-doc-size.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'doc-size-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
}

const table = (rows) => `# 文档规范

## 3. 文档行数阈值

| 文档 | 健康窗口 | warning 触发 | 强制分片 |
|------|:-------:|:-----------:|:-------:|
${rows.join('\n')}

超阈值时优先拆分到 \`archive/\` 分片。
`

const md = (lines) => `${Array.from({ length: lines }, (_, i) => `行 ${i}`).join('\n')}\n`

describe('parseThresholdTable', () => {
    it('解析行并提取阈值数字', () => {
        const rows = parseThresholdTable(table(['| README | <= 300 行 | 301-400 | > 400 行 |']))
        expect(rows).toEqual([{ doc: 'README', warning: 300, split: 400 }])
    })

    it('跳过表头分隔行与反引号', () => {
        const rows = parseThresholdTable(table(['| `roadmap.md` | <= 800 行 | 801-900 | > 900 行 |']))
        expect(rows[0].doc).toBe('roadmap.md')
        expect(rows[0].warning).toBe(800)
        expect(rows[0].split).toBe(900)
    })

    it('剥离文档列的类型括注（如 `x.md`（规范））并跳过表头「文档类型」', () => {
        const rows = parseThresholdTable(table([
            '| 文档类型 | 健康窗口 | warning 触发 | 强制分片 |',
            '',
            '| `docs/standards/*.md`（规范） | <= 200 行 | 201-400 | > 400 行 |',
        ]))
        expect(rows).toEqual([{ doc: 'docs/standards/*.md', warning: 200, split: 400 }])
    })

    it('缺少阈值表标题时抛错', () => {
        expect(() => parseThresholdTable('# 无表')).toThrow(/未找到阈值表标题/)
    })

    it('表为空时抛错', () => {
        expect(() => parseThresholdTable('## 3. 文档行数阈值\n\n无表行\n')).toThrow(/阈值表解析为空/)
    })
})

describe('globToRegExp / resolveTargets', () => {
    it('支持 ** 与 * 与 ?', () => {
        expect(globToRegExp('docs/standards/*.md').test('docs/standards/git.md')).toBe(true)
        expect(globToRegExp('docs/standards/*.md').test('docs/standards/sub/git.md')).toBe(false)
        expect(globToRegExp('docs/design/**/*.md').test('docs/design/a/b/c.md')).toBe(true)
        expect(globToRegExp('README?.md').test('README1.md')).toBe(true)
    })

    it('plain 名称按 basename 匹配（含无扩展名写法）', () => {
        const files = ['README.md', 'docs/plan/roadmap.md', 'docs/i18n/en-US/roadmap.md']
        expect(resolveTargets('roadmap.md', files)).toEqual(['docs/plan/roadmap.md', 'docs/i18n/en-US/roadmap.md'])
    })

    it('plain 名称优先解析仓库根同名文件（避免通用名误命中子目录）', () => {
        const files = ['README.md', 'apps/platform/server/database/scripts/README.md']
        expect(resolveTargets('README', files)).toEqual(['README.md'])
    })

    it('含 / 或 * 时按 glob 匹配', () => {
        const files = ['docs/standards/git.md', 'docs/standards/platform.md', 'docs/plan/todo.md']
        expect(resolveTargets('docs/standards/*.md', files)).toEqual(['docs/standards/git.md', 'docs/standards/platform.md'])
    })
})

describe('checkDocSize 四态', () => {
    const setup = (rows, files) => {
        write('docs/standards/documentation.md', table(rows))
        for (const [rel, lines] of Object.entries(files)) {
            write(rel, md(lines))
        }
    }

    it('健康窗口 → healthy', () => {
        setup(['| README | <= 300 行 | 301-400 | > 400 行 |'], { 'README.md': 100 })
        const [r] = checkDocSize(root, [])
        expect(r).toMatchObject({ path: 'README.md', lines: 100, verdict: 'healthy' })
    })

    it('warning 带 → warning 且不阻断', () => {
        setup(['| README | <= 300 行 | 301-400 | > 400 行 |'], { 'README.md': 350 })
        const results = checkDocSize(root, [])
        expect(results[0].verdict).toBe('warning')
        expect(formatReport(results)).toContain('warning')
    })

    it('超强制分片阈值 → over-split（阻断）', () => {
        setup(['| README | <= 300 行 | 301-400 | > 400 行 |'], { 'README.md': 401 })
        const results = checkDocSize(root, [])
        expect(results[0].verdict).toBe('over-split')
    })

    it('豁免登记后 → exempt（不阻断）', () => {
        setup(['| README | <= 300 行 | 301-400 | > 400 行 |'], { 'README.md': 500 })
        const results = checkDocSize(root, [{ path: 'README.md', reason: '存量待拆分' }])
        expect(results[0].verdict).toBe('exempt')
        expect(formatReport(results)).toContain('豁免 1')
    })

    it('glob 行覆盖多文件（文档站分片场景）', () => {
        setup(['| `docs/standards/*.md` | <= 200 行 | 201-400 | > 400 行 |'], {
            'docs/standards/a.md': 10,
            'docs/standards/b.md': 500,
        })
        const results = checkDocSize(root, [])
        // 该行同时命中阈值表所在文件 documentation.md（健康）
        expect(results.map((r) => r.verdict).sort()).toEqual(['healthy', 'healthy', 'over-split'])
    })

    it('阈值表行未匹配到文件 → missing-row-target', () => {
        setup(['| 不存在的文档 | <= 10 行 | 11-20 | > 20 行 |'], { 'README.md': 1 })
        const [r] = checkDocSize(root, [])
        expect(r.verdict).toBe('missing-row-target')
    })
})

describe('collectDocFiles', () => {
    it('排除构建产物与依赖目录', () => {
        write('docs/a.md', '# a\n')
        write('node_modules/pkg/README.md', '# x\n')
        write('coverage/report.md', '# x\n')
        expect(collectDocFiles(root)).toEqual(['docs/a.md'])
    })
})
