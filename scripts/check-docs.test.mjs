import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    _internals,
    checkLinks,
    checkVueInterp,
    collectTitles,
    looseNorm,
    normAnchor,
    scanVueInterp,
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
    it('collects heading titles with inline code and link syntax stripped', () => {
        write('t.md', [
            '# 标题 一',
            '## 标题 `code` 二',
            '## 标题 [链接](x.md) 三',
            '### 标题 _强调_ *斜体* ~删除~ 四',
            '',
        ].join('\n'))
        const titles = collectTitles(join(root, 't.md'))
        expect(titles.has('标题一')).toBe(true)
        expect(titles.has('标题二')).toBe(true)
        expect(titles.has('标题三')).toBe(true)
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

    it('排除 node_modules / .vitepress / dist / archive / artifacts', () => {
        write('docs/a.md', '合规 `code`')
        for (const dir of ['node_modules', '.vitepress', 'dist', 'archive', 'artifacts']) {
            mkdirSync(join(root, 'docs', dir), { recursive: true })
            writeFileSync(join(root, 'docs', dir, 'x.md'), '违规 `{{.Y}}`')
        }
        const { errors } = checkVueInterp(root)
        expect(errors).toEqual([])
    })
})

// ============================================================
// ============      _internals 正则常量回归         =========
// ============================================================

describe('_internals 正则常量回归', () => {
    it('RULES 暴露两个规则', () => {
        expect(Object.keys(_internals.RULES).sort()).toEqual(['links', 'vue-interp'])
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
