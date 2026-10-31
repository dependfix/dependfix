import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectHeadings, headingSlugText, slugify } from './vitepress-slug.mjs'

describe('slugify（对齐 VitePress 1.6.4）', () => {
    it('数字开头带 `_` 前缀、`.` 变 `-`', () => {
        expect(slugify('5.6 交付闸门')).toBe('_5-6-交付闸门')
        expect(slugify('3.1 新需求默认走"评估 → backlog"原则（hard requirement）'))
            .toBe('_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement')
    })

    it('全角括号按 NFKD 归一化为分隔符（不是保留字符）', () => {
        expect(slugify('隔离（独立）部署')).toBe('隔离-独立-部署')
    })

    it('非词符号保留（`→` 不属 VitePress 的标点集合）', () => {
        expect(slugify('评估 → backlog')).toBe('评估-→-backlog')
    })

    it('连续分隔符收敛为单个 `-` 并去首尾', () => {
        expect(slugify('M37.1~M37.6 全部已闭环')).toBe('m37-1-m37-6-全部已闭环')
        expect(slugify('  -- 前后有分隔符 --  ')).toBe('前后有分隔符')
    })

    it('下划线属分隔符（`rule_id` → `rule-id`）', () => {
        expect(slugify('全局 Top 20 高频 rule_id')).toBe('全局-top-20-高频-rule-id')
    })
})

describe('headingSlugText（对齐 VitePress 的标题 token 集）', () => {
    it('行内代码保留内容、反引号由 slugify 当分隔符', () => {
        expect(headingSlugText('6.2 运行失败分类口径（`failure_code` / `failure_stage`）'))
            .toBe('6.2 运行失败分类口径（failure_code / failure_stage）')
    })

    it('链接取文本、图片整体丢弃', () => {
        expect(headingSlugText('标题 [链接](x.md) ![图](a.png) 尾')).toBe('标题 链接  尾')
    })

    it('行内代码里的尖括号是正文（不按 HTML 标签剥离）', () => {
        expect(slugify(headingSlugText('4.4 差异（`pnpm --filter <pkg> test`）')))
            .toBe('_4-4-差异-pnpm-filter-pkg-test')
    })

    it('真行内 HTML：标签剥离、标签内文本保留（VitePress html_inline 不参与）', () => {
        expect(slugify(headingSlugText('标题 <span>x</span> 尾'))).toBe('标题-x-尾')
    })

    it('结尾闭合 `##` 不计入', () => {
        expect(headingSlugText('标题 ##')).toBe('标题')
    })
})

describe('collectHeadings', () => {
    it('frontmatter 内的 `# 注释` 不算标题', () => {
        const headings = collectHeadings(['---', '# https://example.com', 'title: x', '---', '# 真实标题'].join('\n'))
        expect(headings.map((h) => h.id)).toEqual(['真实标题'])
    })

    it('fenced code block 内标题不计入；嵌套 info 串的 fence 不误闭合', () => {
        const headings = collectHeadings([
            '```markdown',
            '# 代码里的标题',
            '```bash',
            '# 仍是代码',
            '```',
            '# 真实标题',
        ].join('\n'))
        expect(headings.map((h) => h.id)).toEqual(['真实标题'])
    })

    it('`~~~` fence 同样生效', () => {
        const headings = collectHeadings(['~~~', '# 代码', '~~~', '## 真标题'].join('\n'))
        expect(headings.map((h) => h.id)).toEqual(['真标题'])
    })

    it('重复标题按 VitePress 行为追加 `-1` / `-2`', () => {
        const headings = collectHeadings(['## 重复', '## 重复', '## 重复'].join('\n'))
        expect(headings.map((h) => h.id)).toEqual(['重复', '重复-1', '重复-2'])
    })

    it('去重按 used-id 集合自增（显式 `Foo-1` 已占用时继续试探）', () => {
        const headings = collectHeadings(['## Foo', '## Foo-1', '## Foo'].join('\n'))
        expect(headings.map((h) => h.id)).toEqual(['foo', 'foo-1', 'foo-2'])
    })

    it('自定义锚点 `{#id}` 优先于标题文本', () => {
        const headings = collectHeadings(['## 标题 {#custom}'].join('\n'))
        expect(headings.map((h) => h.id)).toEqual(['custom'])
        expect(headings[0].text).toBe('标题')
    })

    it('记录行号与层级', () => {
        const headings = collectHeadings(['正文', '### 三级', ''].join('\n'))
        expect(headings[0]).toMatchObject({ line: 2, level: 3 })
    })
})
