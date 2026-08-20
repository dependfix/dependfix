import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _internals, checkMdVueInterp, scanContent } from './check-md-vue-interp.mjs'

let root

beforeEach(() => {
    // 构造临时 docs/ 目录树（checkMdVueInterp 只扫 docs/）
    root = mkdtempSync(join(tmpdir(), 'check-md-vue-interp-test-'))
})

afterEach(() => {
    rmSync(root, { recursive: true, force: true })
})

const writeDoc = (rel, content) => {
    const file = join(root, 'docs', rel)
    mkdirSync(join(root, 'docs', rel.split(/[\\/]/).slice(0, -1).join('/')), { recursive: true })
    writeFileSync(file, content)
}

describe('scanContent - 正例', () => {
    it('普通 inline code 无 mustache：通过', () => {
        const errors = scanContent('普通 `hello world` 与 `code`', 'x.md')
        expect(errors).toEqual([])
    })

    it('多 inline code 全部正常：通过', () => {
        const content = [
            '## 标题',
            '',
            '`--format` 包名 / `setuptool.sh` / `systemctl --user`',
            '普通中文 + `backtick` 段',
        ].join('\n')
        const errors = scanContent(content, 'x.md')
        expect(errors).toEqual([])
    })

    it('fenced code block 内含 mustache：天然安全，不报错', () => {
        const content = [
            '```bash',
            "docker info --format '{{.ServerVersion}}'",
            '```',
            '上面是合法示例',
        ].join('\n')
        expect(scanContent(content, 'x.md')).toEqual([])
    })

    it('fenced code block 紧邻正文含 mustache inline code：仍报错', () => {
        const content = [
            '```bash',
            "echo '{{.x}}'",
            '```',
            "正文里 `{{.y}}` 仍然违规",
        ].join('\n')
        const errors = scanContent(content, 'x.md')
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
        expect(scanContent(content, 'x.md')).toEqual([])
    })

    it('v-pre span 跨多行：span 内 inline code 豁免，span 外仍报错', () => {
        const content = [
            '<span v-pre>',
            "这里是豁免区 `{{.ServerVersion}}`",
            '</span>',
            "这里是普通区 `{{.OtherField}}`",
        ].join('\n')
        const errors = scanContent(content, 'x.md')
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
        expect(scanContent(content, 'x.md')).toEqual([])
    })

    it('HTML 注释 + 正文中行内代码混合：仅正文报错', () => {
        const content = [
            '<!-- 注释 `{{.x}}` -->',
            "正文里 `{{.y}}`",
        ].join('\n')
        const errors = scanContent(content, 'x.md')
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('{{.y}}')
    })
})

describe('scanContent - 反例', () => {
    it('单处 inline code mustache：报错并定位行号列号', () => {
        const content = "这是行 `{{.ServerVersion}}` 错误"
        const errors = scanContent(content, 'x.md')
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
        const errors = scanContent(content, 'x.md')
        expect(errors).toHaveLength(3)
        expect(errors[0]).toContain('x.md:1')
        expect(errors[1]).toContain('x.md:2')
        expect(errors[2]).toContain('x.md:3')
    })

    it('只含 }} 不含 {{：仍报错（Vue 编译失败模式更复杂）', () => {
        const content = "这是行 `}}` 错误"
        const errors = scanContent(content, 'x.md')
        expect(errors).toHaveLength(1)
    })

    it('反斜杠转义 \\{{ 不豁免：仍报错（Vue 不识别反斜杠转义，强制用户改用 v-pre）', () => {
        const content = '转义写法 `\\{{.x}}` 仍然违规'
        const errors = scanContent(content, 'x.md')
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('{{.x}}')
    })
})

describe('checkMdVueInterp - 仓库扫描', () => {
    it('docs/ 不存在：返回空集合，不抛', () => {
        const errors = checkMdVueInterp(root)
        expect(errors.files).toEqual([])
        expect(errors.errors).toEqual([])
    })

    it('docs/ 下无 md：返回空集合', () => {
        mkdirSync(join(root, 'docs'), { recursive: true })
        writeFileSync(join(root, 'docs', 'empty.txt'), 'not md')
        const { files, errors } = checkMdVueInterp(root)
        expect(files).toEqual([])
        expect(errors).toEqual([])
    })

    it('docs/ 全合规：返回 0 错误', () => {
        writeDoc('a.md', '普通 `code`')
        writeDoc('b/b.md', ['```bash', 'safe `{{.x}}`', '```', ''].join('\n'))
        const { files, errors } = checkMdVueInterp(root)
        expect(files).toHaveLength(2)
        expect(errors).toEqual([])
    })

    it('docs/ 有违规：返回所有错误', () => {
        writeDoc('a.md', '合规 `code`')
        writeDoc('b/bad.md', "违规 `{{.X}}`")
        const { files, errors } = checkMdVueInterp(root)
        expect(files).toHaveLength(2)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain('b/bad.md')
    })

    it('排除 node_modules / .vitepress / dist / artifacts', () => {
        writeDoc('a.md', '合规 `code`')
        // 这些目录应被跳过
        mkdirSync(join(root, 'docs', 'node_modules'), { recursive: true })
        writeFileSync(join(root, 'docs', 'node_modules', 'x.md'), "违规 `{{.Y}}`")
        mkdirSync(join(root, 'docs', '.vitepress'), { recursive: true })
        writeFileSync(join(root, 'docs', '.vitepress', 'x.md'), "违规 `{{.Z}}`")
        mkdirSync(join(root, 'docs', 'artifacts'), { recursive: true })
        writeFileSync(join(root, 'docs', 'artifacts', 'x.md'), "违规 `{{.W}}`")
        const { errors } = checkMdVueInterp(root)
        expect(errors).toEqual([])
    })
})

describe('正则常量回归', () => {
    it('INLINE_CODE_RE 匹配典型 inline code', () => {
        const re = new RegExp(_internals.INLINE_CODE_RE.source, 'g')
        const line = '前面 `code1` 中间 `code2` 结尾'
        const matches = [...line.matchAll(re)]
        expect(matches.map(m => m[0])).toEqual(['`code1`', '`code2`'])
    })

    it('INLINE_CODE_RE 不匹配跨行反引号', () => {
        const re = new RegExp(_internals.INLINE_CODE_RE.source, 'g')
        // 跨行 inline code 在 markdown 中实际不成立，应被跳过
        const line = '前面 `跨行'
        const matches = [...line.matchAll(re)]
        expect(matches).toHaveLength(0)
    })

    it('MUSTACHE_RE 同时识别 {{ 和 }}', () => {
        const re = _internals.MUSTACHE_RE
        expect(re.test('{{.x}}')).toBe(true)
        expect(re.test('}}')).toBe(true)
        expect(re.test('plain text')).toBe(false)
    })
})