import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    _internals,
    anchorLeadingNumber,
    checkAnchorIds,
    checkArchiveAnchors,
    checkEmphasis,
    checkLinkSyntax,
    checkLinkText,
    checkLinks,
    checkSiteLinks,
    checkVueInterp,
    chineseNumeralToNumber,
    collectTitles,
    looseNorm,
    normAnchor,
    scanVueInterp,
    stripInline,
    textSectionNumbers,
} from './check-docs.mjs'

let root

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'check-docs-test-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const write = (rel, content) => {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
}

// ============================================================
// ============       共享 / 工具函数测试              =========
// ============================================================

describe('looseNorm', () => {
    it('lowercases and strips punctuation/symbol/whitespace', () => {
        expect(looseNorm('Hello, World!')).toBe('helloworld')
        expect(looseNorm('  中 文 标点，。！')).toBe('中文标点')
    })

    it('strips emoji and mixed symbols', () => {
        expect(looseNorm('M7.2 ✅ 已归档')).toBe('m72已归档')
    })
})

describe('normAnchor', () => {
    it('decodes URL-encoded anchors before normalization', () => {
        expect(normAnchor('hello%20world')).toBe('helloworld')
    })

    it('falls back to raw anchor on invalid encoding', () => {
        expect(normAnchor('%E0%A4%A')).toBe('e0a4a')
    })
})

describe('collectTitles', () => {
    it('标题文本与 VitePress 同源：行内代码内容参与、链接取文本、强调标记剥离', () => {
        write('t.md', [
            '# 标题 一',
            '## 标题 `code` 二',
            '## 标题 [链接](x.md) 三',
            '### 标题 _强调_ *斜体* ~删除~ 四',
            '',
        ].join('\n'))
        const titles = collectTitles(join(root, 't.md'))
        expect(titles.has('标题一')).toBe(true)
        // 行内代码的内容参与 slug（历史实现整体剥离，会让产物 id 锚点反被判死）
        expect(titles.has('标题code二')).toBe(true)
        expect(titles.has('标题链接三')).toBe(true)
        // 强调标记属标点，宽松归一化后消失
        expect(titles.has('标题强调斜体删除四')).toBe(true)
    })

    it('skips headings inside fenced code blocks', () => {
        write('t.md', ['```md', '# 代码块里的标题', '```', '# 真实标题'].join('\n'))
        const titles = collectTitles(join(root, 't.md'))
        expect(titles.has('真实标题')).toBe(true)
        expect(titles.has('代码块里的标题')).toBe(false)
    })
})

// ============================================================
// ============         links 规则测试                =========
// ============================================================

describe('checkLinks', () => {
    it('passes valid relative links with existing anchors', () => {
        write('docs/a.md', '[b](b.md#标题二)\n\n[b2](./b.md)')
        write('docs/b.md', '# 标题一\n\n## 标题二')
        const { files, errors } = checkLinks(root)
        expect(files).toHaveLength(2)
        expect(errors).toEqual([])
    })

    it('reports broken relative links', () => {
        write('docs/a.md', '[missing](missing.md)')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('链接目标不存在: missing.md')
    })

    it('reports invalid in-file anchors', () => {
        write('docs/a.md', '[top](#不存在的标题)')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('站内锚点 "#不存在的标题" 在文件中找不到对应标题')
    })

    it('reports anchors missing in the target file', () => {
        write('docs/a.md', '[b](b.md#不存在的锚点)')
        write('docs/b.md', '# 标题')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('锚点 "#不存在的锚点" 在 b.md 中找不到对应标题')
    })

    it('rejects local absolute paths', () => {
        write('docs/a.md', '[abs](C:/Users/foo/file.md)\n\n[unix](/etc/hosts)')
        const { errors } = checkLinks(root)
        expect(errors.some((e) => e.includes('本地绝对路径') && e.includes('C:/Users/foo/file.md'))).toBe(true)
        expect(errors.some((e) => e.includes('本地绝对路径') && e.includes('/etc/hosts'))).toBe(true)
    })

    it('rejects path traversal beyond repo root', () => {
        write('docs/a.md', '[out](../../../outside.md)')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('路径穿越')
    })

    it('rejects personal machine paths in body text', () => {
        write('docs/a.md', '本地路径 C:\\Users\\foo\\file 见说明')
        const { errors } = checkLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('正文包含本地绝对路径')
    })

    it('ignores https/mailto links and code content', () => {
        write('docs/a.md', [
            '[site](https://example.com)',
            '[mail](mailto:a@b.c)',
            '',
            '行内代码 `参见 docs/not-exist.md` 不应检查',
            '',
            '```md',
            '[fenced](also-not-exist.md)',
            '```',
            '',
        ].join('\n'))
        const { errors } = checkLinks(root)
        expect(errors).toEqual([])
    })

    it('excludes node_modules/.git/archive dirs and non-md files from walk', () => {
        write('node_modules/pkg/README.md', '[x](missing.md)')
        write('.git/hooks/readme.md', '[x](missing.md)')
        write('docs/plan/archive/x.md', '[x](missing.md)')
        write('docs/note.txt', '[x](missing.md)')
        write('docs/real.md', '正常内容')
        const { files, errors } = checkLinks(root)
        expect(files).toEqual([join(root, 'docs', 'real.md')])
        expect(errors).toEqual([])
    })

    it('excludes the platform runtime data dir (gitignored scan-run artifacts)', () => {
        write('apps/platform/data/notes.md', '[死链](missing.md)')
        write('apps/platform/data/runs/run-1/README.md', '[死链](missing.md)')
        write('docs/real.md', '[死链](missing.md)')
        const { files, errors } = checkLinks(root)
        // 运行时目录整体剪枝：既不收集其 .md，也不产生与环境无关的报错
        expect(files.some((f) => f.includes('apps/platform/data'))).toBe(false)
        expect(errors.some((e) => e.includes('apps/platform/data'))).toBe(false)
        // 未过度排除：普通目录仍被扫描并报错
        expect(errors.some((e) => e.includes('docs/real.md'))).toBe(true)
    })

    it('excludes Playwright artifacts (playwright-report / test-results) from walk', () => {
        write('apps/platform/playwright-report/trace/index.html', 'x')
        write('apps/platform/test-results/case/error-context.md', '[死链](missing.md)')
        write('playwright-report/report.md', '[死链](missing.md)')
        write('test-results/run/notes.md', '[死链](missing.md)')
        write('docs/real.md', '正常内容')
        const { files, errors } = checkLinks(root)
        // 本地跑过 e2e / 视觉用例后生成的产物目录整体剪枝：既不收集其 .md，也不产生误报
        expect(files.some((f) => f.includes('playwright-report'))).toBe(false)
        expect(files.some((f) => f.includes('test-results'))).toBe(false)
        expect(errors.some((e) => e.includes('playwright-report') || e.includes('test-results'))).toBe(false)
        // 未过度排除：普通目录仍被扫描
        expect(files).toContain(join(root, 'docs', 'real.md'))
    })

    it('treats the runtime data exclusion as a path prefix, not a name prefix', () => {
        // `apps/platform/database` 与 `apps/platform/data` 前缀相邻：朴素的 startsWith(prefix) 会误伤
        write('apps/platform/database/notes.md', '[死链](missing.md)')
        // `docs/data` 与目标目录同名但不在排除路径下：按目录名排除（把 data 塞进 MD_EXCLUDED_DIRS）会误伤
        write('docs/data/notes.md', '[死链](missing.md)')
        const { files, errors } = checkLinks(root)
        expect(files.some((f) => f.includes('apps/platform/database'))).toBe(true)
        expect(errors.some((e) => e.includes('apps/platform/database'))).toBe(true)
        expect(files.some((f) => f.includes('docs/data'))).toBe(true)
        expect(errors.some((e) => e.includes('docs/data'))).toBe(true)
    })
})

// ============================================================
// ============     vue-interp 规则测试              =========
// ============================================================

describe('scanVueInterp - 正例', () => {
    it('普通 inline code 无 mustache：通过', () => {
        const errors = scanVueInterp('普通 `hello world` 与 `code`', 'x.md')
        expect(errors).toEqual([])
    })

    it('多 inline code 全部正常：通过', () => {
        const content = [
            '## 标题',
            '',
            '`--format` 包名 / `setuptool.sh` / `systemctl --user`',
            '普通中文 + `backtick` 段',
        ].join('\n')
        expect(scanVueInterp(content, 'x.md')).toEqual([])
    })

    it('fenced code block 内含 mustache：天然安全，不报错', () => {
        const content = [
            '```bash',
            'docker info --format \'{{.ServerVersion}}\'',
            '```',
            '上面是合法示例',
        ].join('\n')
        expect(scanVueInterp(content, 'x.md')).toEqual([])
    })

    it('fenced code block 紧邻正文含 mustache inline code：仍报错', () => {
        const content = [
            '```bash',
            'echo \'{{.x}}\'',
            '```',
            '正文里 `{{.y}}\'`  仍然违规',
        ].join('\n')
        const errors = scanVueInterp(content, 'x.md')
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('{{.y}}')
    })

    it('v-pre span 包裹的 inline code：豁免', () => {
        const content = [
            '前面 `normal code`',
            '',
            '<span v-pre>`{{.ServerVersion}}`</span>',
            '',
            '后面 `also normal`',
        ].join('\n')
        expect(scanVueInterp(content, 'x.md')).toEqual([])
    })

    it('v-pre span 跨多行：span 内 inline code 豁免，span 外仍报错', () => {
        const content = [
            '<span v-pre>',
            '这里是豁免区 `{{.ServerVersion}}`',
            '</span>',
            '这里是普通区 `{{.OtherField}}`',
        ].join('\n')
        const errors = scanVueInterp(content, 'x.md')
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('{{.OtherField}}')
        expect(errors[0]).toContain('x.md:4')
    })

    it('HTML 注释内含 mustache inline code：豁免', () => {
        const content = [
            '正文。',
            '',
            '<!-- 注释里 `{{.ServerVersion}}` 是示例 -->',
            '',
            '结尾。',
        ].join('\n')
        expect(scanVueInterp(content, 'x.md')).toEqual([])
    })

    it('HTML 注释 + 正文中行内代码混合：仅正文报错', () => {
        const content = [
            '<!-- 注释 `{{.x}}` -->',
            '正文里 `{{.y}}`',
        ].join('\n')
        const errors = scanVueInterp(content, 'x.md')
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('{{.y}}')
    })
})

describe('scanVueInterp - 反例', () => {
    it('单处 inline code mustache：报错并定位行号列号', () => {
        const content = '这是行 `{{.ServerVersion}}` 错误'
        const errors = scanVueInterp(content, 'x.md')
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/^x\.md:1:\d+ /)
        expect(errors[0]).toContain('{{.ServerVersion}}')
    })

    it('多处 inline code mustache：分别报错', () => {
        const content = [
            '行1：`{{.A}}`',
            '行2：`{{.B}}`',
            '行3：`{{.C}}`',
        ].join('\n')
        const errors = scanVueInterp(content, 'x.md')
        expect(errors).toHaveLength(3)
        expect(errors[0]).toContain('x.md:1')
        expect(errors[1]).toContain('x.md:2')
        expect(errors[2]).toContain('x.md:3')
    })

    it('只含 }} 不含 {{：仍报错（Vue 编译失败模式更复杂）', () => {
        const content = '这是行 `}}` 错误'
        const errors = scanVueInterp(content, 'x.md')
        expect(errors).toHaveLength(1)
    })

    it('反斜杠转义 \\{{ 不豁免：仍报错', () => {
        const content = '转义写法 `\\{{.x}}` 仍然违规'
        const errors = scanVueInterp(content, 'x.md')
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('{{.x}}')
    })
})

describe('checkVueInterp - docs/ 扫描', () => {
    it('docs/ 不存在：返回空集合，不抛', () => {
        const errors = checkVueInterp(root)
        expect(errors.files).toEqual([])
        expect(errors.errors).toEqual([])
    })

    it('docs/ 下无 md：返回空集合', () => {
        mkdirSync(join(root, 'docs'), { recursive: true })
        writeFileSync(join(root, 'docs', 'empty.txt'), 'not md')
        const { files, errors } = checkVueInterp(root)
        expect(files).toEqual([])
        expect(errors).toEqual([])
    })

    it('docs/ 全合规：返回 0 错误', () => {
        write('docs/a.md', '普通 `code`')
        write('docs/b/b.md', ['```bash', 'safe `{{.x}}`', '```', ''].join('\n'))
        const { files, errors } = checkVueInterp(root)
        expect(files).toHaveLength(2)
        expect(errors).toEqual([])
    })

    it('docs/ 有违规：返回所有错误', () => {
        write('docs/a.md', '合规 `code`')
        write('docs/b/bad.md', '违规 `{{.X}}`')
        const { files, errors } = checkVueInterp(root)
        expect(files).toHaveLength(2)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('b/bad.md')
    })

    it('排除 node_modules / .vitepress / dist / archive / artifacts / playwright-report / test-results', () => {
        write('docs/a.md', '合规 `code`')
        for (const dir of ['node_modules', '.vitepress', 'dist', 'archive', 'artifacts', 'playwright-report', 'test-results']) {
            mkdirSync(join(root, 'docs', dir), { recursive: true })
            writeFileSync(join(root, 'docs', dir, 'x.md'), '违规 `{{.Y}}`')
        }
        const { errors } = checkVueInterp(root)
        expect(errors).toEqual([])
    })
})

// ============================================================
// ============   link-text / link-syntax / emphasis 规则测试   ====
// ============================================================

describe('chineseNumeralToNumber', () => {
    it('解析十位 / 百位组合', () => {
        expect(chineseNumeralToNumber('五十六')).toBe(56)
        expect(chineseNumeralToNumber('七十二')).toBe(72)
        expect(chineseNumeralToNumber('十九')).toBe(19)
        expect(chineseNumeralToNumber('十')).toBe(10)
        expect(chineseNumeralToNumber('一百')).toBe(100)
        expect(chineseNumeralToNumber('八')).toBe(8)
    })

    it('非纯中文数字返回 null', () => {
        expect(chineseNumeralToNumber('56')).toBeNull()
        expect(chineseNumeralToNumber('五十六、')).toBeNull()
        expect(chineseNumeralToNumber('')).toBeNull()
    })
})

describe('textSectionNumbers', () => {
    it('解析阿拉伯链与中文数字', () => {
        expect([...textSectionNumbers('见 §5.1.22 条款')]).toEqual(['5122'])
        expect([...textSectionNumbers('见 §五十六 条款')]).toEqual(['56'])
    })

    it('末尾 .x 记为前缀匹配项', () => {
        expect([...textSectionNumbers('见 §5.1.x 条款')]).toEqual(['^51'])
    })

    it('多 § 引用返回多项（调用方据此跳过比对）', () => {
        const numbers = textSectionNumbers('见 §5.1.4 / §5.1.11')
        expect(numbers.size).toBe(2)
    })

    it('无 § 编号返回空集合', () => {
        expect(textSectionNumbers('见 planning.md').size).toBe(0)
    })
})

describe('anchorLeadingNumber', () => {
    it('解析阿拉伯与中文前导编号', () => {
        expect(anchorLeadingNumber('44-大批量归档批次操作规范')).toBe('44')
        expect(anchorLeadingNumber('5122-baseline-lint-治理路径')).toBe('5122')
        expect(anchorLeadingNumber('五十六m24-归档批次蒸馏')).toBe('56')
    })

    it('URL 编码锚点先解码', () => {
        expect(anchorLeadingNumber('44%20规则')).toBe('44')
    })

    it('兼容产物 id：剥 `_` 前缀并合并 `-` 分隔的编号段', () => {
        expect(anchorLeadingNumber('_5-1-15-工程实践规则')).toBe('5115')
        expect(anchorLeadingNumber('_3-1-新需求默认走-评估-backlog-原则-hard-requirement')).toBe('31')
        expect(anchorLeadingNumber('_6-2-运行失败分类口径-failure-code')).toBe('62')
    })

    it('无前导编号返回 null', () => {
        expect(anchorLeadingNumber('主要风险与应对')).toBeNull()
        expect(anchorLeadingNumber('')).toBeNull()
    })
})

describe('stripInline', () => {
    it('剥离 inline code、链接与图片', () => {
        expect(stripInline('见 `code](` 与 [文本](a.md)')).toBe('见  与 <LINK>')
        expect(stripInline('图 ![alt](img.png) 尾部')).toBe('图 <IMG> 尾部')
    })

    it('剥离「图片作为链接文本」的嵌套形态', () => {
        expect(stripInline('[![Chart](https://api.example.com/svg)](https://example.com)')).toBe('<LINK>')
    })
})

describe('checkLinkText', () => {
    it('文本 §N 与锚点编号一致：通过', () => {
        write('docs/a.md', '[§4.4 规范](b.md#44-规则)\n\n[§五十六 经验](b.md#五十六某个标题)')
        write('docs/b.md', '## 4.4 规则')
        const { errors } = checkLinkText(root)
        expect(errors).toEqual([])
    })

    it('锚点为父级章节（文本编号以锚点编号为前缀）：通过', () => {
        write('docs/a.md', '[§5.1.15 条款](b.md#51-工程实践规则)')
        const { errors } = checkLinkText(root)
        expect(errors).toEqual([])
    })

    it('锚点编号比文本更深（同段相邻漂移）：报错', () => {
        // `§5.1.1` → `#5115-…`：展平后 "511" 是 "5115" 的前缀，但按段切分属编号漂移——不反向容忍
        write('docs/a.md', '[§5.1.1 条款](b.md#5115-别的叶子)')
        const { errors } = checkLinkText(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('不一致')
    })

    it('文本 §5.1.x 前缀通配：通过', () => {
        write('docs/a.md', '[§5.1.x 条款](b.md#51-工程实践规则)')
        const { errors } = checkLinkText(root)
        expect(errors).toEqual([])
    })

    it('编号不一致：报错并定位', () => {
        write('docs/a.md', '[§4.4 规范](b.md#43-别的章节)')
        const { errors } = checkLinkText(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('docs/a.md:1')
        expect(errors[0]).toContain('链接文本章节号与目标锚点不一致')
    })

    it('中文数字与阿拉伯锚点比对', () => {
        write('docs/a.md', '[§五十六 经验](b.md#57-另一节)')
        const { errors } = checkLinkText(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('不一致')
    })

    it('多 § 引用 / 无编号锚点 / 外链：跳过', () => {
        write('docs/a.md', [
            '[§5.1.4 / §5.1.11](b.md#51-工程实践规则)',
            '[§3.1 原则](b.md#主要风险与应对)',
            '[§7.7](https://example.com#77)',
        ].join('\n\n'))
        const { errors } = checkLinkText(root)
        expect(errors).toEqual([])
    })

    it('fenced code block 与 inline code 内的链接不参与', () => {
        write('docs/a.md', ['`[§4.4](b.md#43-x)`', '', '```md', '[§4.4](b.md#43-x)', '```'].join('\n'))
        const { errors } = checkLinkText(root)
        expect(errors).toEqual([])
    })
})

describe('checkLinkSyntax', () => {
    it('合法链接（含嵌套图片）与行内代码：通过', () => {
        write('docs/a.md', [
            '[文本](b.md)',
            '[![Chart](https://api.example.com/svg?repos=a/b)](https://example.com)',
            '`code](` 在行内代码内不检查',
            '正文（含半角括号如 pg 与 pnpm-lock.yaml) 属正常文本',
        ].join('\n\n'))
        const { errors } = checkLinkSyntax(root)
        expect(errors).toEqual([])
    })

    it('残留 "]( "：报错', () => {
        write('docs/a.md', '见 [broken]( 结尾')
        const { errors } = checkLinkSyntax(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('docs/a.md:1')
        expect(errors[0]).toContain('链接括号未成对')
    })

    it('孤立「.md#锚点 + )」片段：报错', () => {
        write('docs/a.md', '见 errance/foo-§49-§57.md#五十六) + 其它')
        const { errors } = checkLinkSyntax(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('疑似畸形链接')
    })

    it('半角括号包裹的路径引用（正文引用形态）：不报', () => {
        write('docs/a.md', ['参考 (docs/guide/x.md#标题) 与 [正常](y.md)', '', '英文页 (see specs.md#anchor) 亦然'].join('\n'))
        const { errors } = checkLinkSyntax(root)
        expect(errors).toEqual([])
    })

    it('归档文档同样纳入（缺陷与路径漂移无关）', () => {
        write('docs/plan/archive/x.md', '见 [broken]( 结尾')
        const { errors } = checkLinkSyntax(root)
        expect(errors.some((e) => e.includes('docs/plan/archive/x.md'))).toBe(true)
    })
})

describe('checkEmphasis', () => {
    it('成对强调 / 水平线 / 行内代码 / fenced：通过', () => {
        write('docs/a.md', [
            '**加粗** 与 **另一处**',
            '',
            '***',
            '',
            '行内代码 `**` 不计入',
            '',
            '```md',
            '**未配对',
            '```',
            '',
            '| 表头 | 说明 |',
            '|:--|:--|',
            '| **a** | **b** |',
        ].join('\n'))
        const { errors } = checkEmphasis(root)
        expect(errors).toEqual([])
    })

    it('表格行不成对：定位到该行', () => {
        write('docs/a.md', ['| 表头 | 说明 |', '|:--|:--|', '| **a** | **b |'].join('\n'))
        const { errors } = checkEmphasis(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('docs/a.md:3')
    })

    it('段落不成对：定位到使计数失衡的行', () => {
        write('docs/a.md', ['- **标题** 说明', '- **裸 glob** 如 apps/**/*.md 破坏强调'].join('\n'))
        const { errors } = checkEmphasis(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('docs/a.md:2')
    })

    it('跨行成对（同一段落）不误报', () => {
        write('docs/a.md', ['**加粗开始', '加粗结束**'].join('\n'))
        const { errors } = checkEmphasis(root)
        expect(errors).toEqual([])
    })

    it('归档文档同样纳入', () => {
        write('docs/plan/archive/x.md', '段落 **未配对')
        const { errors } = checkEmphasis(root)
        expect(errors.some((e) => e.includes('docs/plan/archive/x.md'))).toBe(true)
    })

    it('HTML 注释内的 ** 不计入（不参与渲染）', () => {
        write('docs/a.md', ['<!-- 注释里的 ** 单个标记 -->', '', '正文 **成对** 结束'].join('\n'))
        const { errors } = checkEmphasis(root)
        expect(errors).toEqual([])
    })

    it('紧密列表：每个列表项自成一块（跨项不配对）', () => {
        write('docs/a.md', ['- **未配对一', '- **未配对二'].join('\n'))
        const { errors } = checkEmphasis(root)
        expect(errors).toHaveLength(2)
        expect(errors[0]).toContain('docs/a.md:1')
        expect(errors[1]).toContain('docs/a.md:2')
    })

    it('标题行自成块：失衡定位到标题行（非后续行）', () => {
        write('docs/a.md', ['## **未配对标题', '正文 **成对** 结束'].join('\n'))
        const { errors } = checkEmphasis(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('docs/a.md:1')
    })
})

// ============================================================
// ============   site-links / archive-anchors 规则测试   ========
// ============================================================

describe('checkSiteLinks', () => {
    it('nav / sidebar / 首页 frontmatter 链接命中源文件：通过', () => {
        write('docs/.vitepress/config.ts', [
            'const zhNav = [',
            `    { text: '快速开始', link: '/guide/quick-start' },`,
            `    { text: 'GitHub', link: 'https://github.com/dependfix/dependfix' },`,
            ']',
            `const enNav = [{ text: 'Home', link: '/en-US/' }]`,
        ].join('\n'))
        write('docs/guide/quick-start.md', '# 快速开始')
        write('docs/index.md', ['---', 'features:', '    - title: 路线图', '      link: /plan/roadmap', '---'].join('\n'))
        write('docs/plan/roadmap.md', '# 路线图')
        write('docs/i18n/en-US/index.md', '# Home')
        const { errors } = checkSiteLinks(root)
        expect(errors).toEqual([])
    })

    it('未命中源文件：报错（站点 ignoreDeadLinks 会静默放过）', () => {
        write('docs/.vitepress/config.ts', `const zhNav = [{ text: 'x', link: '/nope/missing' }]`)
        const { errors } = checkSiteLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('docs/.vitepress/config.ts')
        expect(errors[0]).toContain('/nope/missing')
    })

    it('目录 / README / index 形态与锚点解析', () => {
        write('docs/.vitepress/config.ts', [
            `const zhSidebar = { items: [{ text: '规范索引', link: '/standards/' }, { text: '调研规范', link: '/research/README' }] }`,
            `const nav = [{ text: '路线图', link: '/plan/roadmap#阶段总览' }]`,
        ].join('\n'))
        write('docs/standards/index.md', '# 项目规范')
        write('docs/research/README.md', '# 调研')
        write('docs/plan/roadmap.md', '## 阶段总览')
        const { errors } = checkSiteLinks(root)
        expect(errors).toEqual([])
    })

    it('站点链接锚点无对应标题：报错', () => {
        write('docs/.vitepress/config.ts', `const nav = [{ text: 'x', link: '/plan/roadmap#不存在' }]`)
        write('docs/plan/roadmap.md', '## 阶段总览')
        const { errors } = checkSiteLinks(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('锚点无对应标题')
    })

    it('双引号 config 链接与带引号 frontmatter 值均正确解析', () => {
        write('docs/.vitepress/config.ts', [
            `const nav = [{ text: 'x', link: "/plan/roadmap" }]`,
            `const side = [{ text: 'y', link: "/guide/quick-start" }]`,
        ].join('\n'))
        write('docs/plan/roadmap.md', '# 路线图')
        write('docs/guide/quick-start.md', '# 快速开始')
        write('docs/index.md', ['---', 'features:', `    - title: 路线图`, `      link: '/plan/roadmap'`, '---', '', '正文里的 link: /not-a-frontmatter-link 不参与校验'].join('\n'))
        const { errors } = checkSiteLinks(root)
        expect(errors).toEqual([])
    })

    it('frontmatter 之外的同名键不参与校验', () => {
        write('docs/index.md', ['---', 'layout: home', '---', '', '| link: /nope/outside |'].join('\n'))
        const { errors } = checkSiteLinks(root)
        expect(errors).toEqual([])
    })

    it('docs/ 缺失：静默返回空错误集', () => {
        const { errors } = checkSiteLinks(root)
        expect(errors).toEqual([])
    })
})

describe('checkArchiveAnchors', () => {
    it('自锚点与跨文档锚点命中：通过', () => {
        write('docs/plan/archive/index.md', ['## 归档索引', '', '[本页](#归档索引)', '', '[已归档段](../todo-archive.md#已归档段)'].join('\n'))
        write('docs/plan/todo-archive.md', '## 已归档段')
        const { errors } = checkArchiveAnchors(root)
        expect(errors).toEqual([])
    })

    it('file-dead 的锚点维持豁免（仅链接存在性面豁免）', () => {
        write('docs/plan/archive/index.md', '[历史](missing-shard.md#任意锚点)')
        const { errors } = checkArchiveAnchors(root)
        expect(errors).toEqual([])
    })

    it('自锚点缺失：报错', () => {
        write('docs/plan/archive/index.md', '## 归档索引\n\n[本页](#不存在的标题)')
        const { errors } = checkArchiveAnchors(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('docs/plan/archive/index.md:3')
        expect(errors[0]).toContain('站内锚点')
    })

    it('跨文档锚点缺失：报错', () => {
        write('docs/plan/archive/index.md', '[已归档段](../todo-archive.md#旧锚点)')
        write('docs/plan/todo-archive.md', '## 已归档段')
        const { errors } = checkArchiveAnchors(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('跨文档锚点')
    })

    it('docs/plan/archive 缺失：返回空集合', () => {
        const { files, errors } = checkArchiveAnchors(root)
        expect(files).toEqual([])
        expect(errors).toEqual([])
    })
})

// ============================================================
// ============      _internals 正则常量回归         =========
// ============================================================

describe('_internals 正则常量回归', () => {
    it('RULES 暴露八条规则', () => {
        expect(Object.keys(_internals.RULES).sort()).toEqual([
            'anchor-id',
            'archive-anchors',
            'emphasis',
            'link-syntax',
            'link-text',
            'links',
            'site-links',
            'vue-interp',
        ])
    })

    it('INLINE_CODE_RE 匹配典型 inline code', () => {
        const re = new RegExp(_internals.INLINE_CODE_RE.source, 'g')
        const line = '前面 `code1` 中间 `code2` 结尾'
        const matches = [...line.matchAll(re)]
        expect(matches.map((m) => m[0])).toEqual(['`code1`', '`code2`'])
    })

    it('INLINE_CODE_RE 不匹配跨行反引号', () => {
        const re = new RegExp(_internals.INLINE_CODE_RE.source, 'g')
        const line = '前面 `跨行'
        expect([...line.matchAll(re)]).toHaveLength(0)
    })

    it('MUSTACHE_RE 同时识别 {{ 和 }}', () => {
        const re = _internals.MUSTACHE_RE
        expect(re.test('{{.x}}')).toBe(true)
        expect(re.test('}}')).toBe(true)
        expect(re.test('plain text')).toBe(false)
    })
})

// ============================================================
// ============       anchor-id 规则测试              =========
// ============================================================

describe('checkAnchorIds', () => {
    it('锚点等于产物 id：通过（含数字前缀与行内代码）', () => {
        write('t.md', [
            '## 3.1 新需求默认走"评估 → backlog"原则（hard requirement）',
            '## 6.2 运行失败分类口径（`failure_code` / `failure_stage`）',
        ].join('\n'))
        write('a.md', [
            '[一](t.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)',
            '[二](t.md#_6-2-运行失败分类口径-failure-code-failure-stage)',
            '# 本文件标题',
        ].join('\n'))
        expect(checkAnchorIds(root).errors).toEqual([])
    })

    it('GitHub 口径的 `--` 锚点：报错并给出产物 id 建议', () => {
        write('t.md', '## 3.1 新需求默认走评估 -- backlog 原则\n')
        write('a.md', '[一](t.md#31-新需求默认走评估--backlog原则)\n')
        const { errors } = checkAnchorIds(root)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('不是 t.md 的产物 id 形态')
        expect(errors[0]).toContain('"#_3-1-新需求默认走评估-backlog-原则"')
    })

    it('数字开头缺 `_` 前缀：报错（宽松比较会判绿，本规则负责拦）', () => {
        write('t.md', '## 5.6 交付闸门\n')
        write('a.md', '[一](t.md#5-6-交付闸门)\n')
        expect(checkAnchorIds(root).errors).toHaveLength(1)
        // 同一份输入在 links 规则下仍是绿的（口径差异的证据）
        expect(checkLinks(root).errors).toEqual([])
    })

    it('非 md 目标与 file-dead 目标跳过（无标题 id 可比）', () => {
        write('a.md', ['[图](x.png#frag)', '[死链](missing.md#whatever)'].join('\n'))
        expect(checkAnchorIds(root).errors).toEqual([])
    })
})
