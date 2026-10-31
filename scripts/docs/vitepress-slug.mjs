/**
 * vitepress-slug.mjs —— VitePress 标题锚点（产物 id）的单一事实源。
 *
 * 为什么需要：站内锚点的权威形态是 `docs:build` 产物 HTML 里的 `id`，而它由 VitePress
 * 内置 slugify 决定（非 GitHub / 编辑器口径）。历史上文档按 GitHub 口径书写（全角标点
 * 相邻的空格塌成 `--`），在站点上属死锚；`check:docs` 的宽松归一化又会剥掉 `-`，
 * 两处都不报错，于是漂移长期不可见。
 *
 * 本模块把 slugify 的实现与标题文本抽取收敛到一处，供三个消费者共用：
 * - `scripts/check-docs.mjs`（`anchor-id` 规则）
 * - `scripts/docs/migrate-anchors.mjs`（机械迁移）
 * - `scripts/docs/verify-anchor-dist.mjs`（以 `docs:build` 产物实测 id 复核）
 *
 * slugify 逐条对齐 VitePress 1.6.4（`docs/node_modules/vitepress`）的行为：
 * NFKD 归一化（全角括号 → 半角）→ 去组合符号与控制字符 → 标点/空白塌成 `-`
 * → 连续 `-` 收敛 → 去首尾 `-` → 数字开头加 `_` 前缀 → 小写。
 * 该规则随 VitePress 升级可能变化，故门禁以产物实测 id 复核（见 verify-anchor-dist）。
 *
 * 已知模拟边界（本模块按「行正则 + 字符串替换」模拟 markdown-it 的 token 流，
 * 下列语法形态不在模拟面内；`pnpm run docs:check:anchors` 以构建产物为权威兜底）：
 * - `> ## 引用内标题`（块引用内的标题，行首是 `>`）
 * - emoji shortcode（`:smile:`，VitePress 的 emoji token 不参与标题文本）
 * - autolink（`<https://…>` 实现按行内 HTML 整体剥离）
 * - 行内代码内的链接 / 图片语法：实现先按 `LINK_RE` / `IMAGE_RE` 展开再剥反引号
 *   （`` `[x](y)` `` 与 VitePress 的 title token 流存在细微差异）
 * - 缩进代码块（4 空格起）：只认 fence，缩进代码块内的 `#` 行会被当标题
 *
 * 已建模：ATX 标题（缩进 ≤3 空格）、setext 标题（`===` / `---` 下划线）、`{#custom}`。
 */
import { readFileSync } from 'node:fs'
import { fenceMask } from './md-scan.mjs'

// eslint-disable-next-line no-control-regex -- 对齐 VitePress：需匹配 C0 控制字符
const CONTROL_RE = /[\u0000-\u001f]/g
const COMBINING_RE = /[\u0300-\u036f]/g
const SPECIAL_RE = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+)$/
/** setext 标题下划线（`===` → H1 / `---` → H2，缩进 ≤3 空格） */
const SETEXT_RE = /^ {0,3}(=+|-+)\s*$/
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g
/** 行内 HTML 标签（VitePress 的标题 token 集不含 html_inline，标签本身不参与 slug，标签内文本参与） */
const INLINE_TAG_RE = /<\/?[a-zA-Z][^>]*>/g
/** 行内代码占位符定界符（Unicode 私用区，正文不会出现） */
const CODE_SLOT_OPEN = '\uE000'
const CODE_SLOT_CLOSE = '\uE001'
/** 行内代码 span（内容原样参与 slug，不做 HTML 标签剥离） */
const CODE_SPAN_RE = /`[^`]*`/g
/** 自定义锚点语法 `## 标题 {#custom-id}`（VitePress 支持，标题文本不含该后缀） */
const CUSTOM_ANCHOR_RE = /\{#([^\s}]+)\}\s*$/
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g
const HEADING_CLOSING_HASH_RE = /\s+#+\s*$/

/**
 * VitePress 1.6.4 的默认 slugify（逐条对齐，含数字开头 `_` 前缀）。
 * @param {string} text 标题纯文本
 * @returns {string} 产物 id
 */
export function slugify(text) {
    return String(text)
        .normalize('NFKD')
        .replace(COMBINING_RE, '')
        .replace(CONTROL_RE, '')
        .replace(SPECIAL_RE, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/^(\d)/, '_$1')
        .toLowerCase()
}

/**
 * 标题行 → VitePress 参与 slug 的纯文本。
 *
 * 对齐 VitePress 的 `resolveTitleFromToken`（标题 token 集 = text + code_inline）：
 * 行内代码的内容参与 slug（反引号由 slugify 映射为 `-`），行内 HTML 的**标签**剥离、
 * 标签内文本保留，链接取文本，图片整体丢弃（markdown-it 的 image token 不在标题
 * token 集内），结尾的 `##` 闭合形式不计入。
 * @param {string} heading 去掉 `#` 前缀后的标题正文
 * @returns {string} 参与 slug 的纯文本
 */
export function headingSlugText(heading) {
    const text = heading
        .replace(HEADING_CLOSING_HASH_RE, '')
        .replace(IMAGE_RE, '')
        .replace(LINK_RE, '$1')
        .trim()
    // 行内代码里的 `<tag>` 是正文（code_inline 内容原样参与 slug），不能按 HTML 标签剥离
    const codes = []
    const masked = text.replace(CODE_SPAN_RE, (span) => {
        codes.push(span)
        return `${CODE_SLOT_OPEN}${codes.length - 1}${CODE_SLOT_CLOSE}`
    })
    const stripped = masked.replace(INLINE_TAG_RE, '')
    let restored = stripped
    for (const [index, span] of codes.entries()) {
        restored = restored.replace(`${CODE_SLOT_OPEN}${index}${CODE_SLOT_CLOSE}`, () => span)
    }
    return restored.replace(/`/g, '').trim()
}

/**
 * 判定某行是否为标题行，返回标题层级（0 = 不是标题）。
 * ATX 取 `#` 个数；setext 取下一行下划线的类型（`===` → 1 / `---` → 2）。
 * setext 的被标记行必须是普通段落行（排除列表项 / 表格 / 引用 / 缩进代码 / 已有的 fence 行）。
 */
function headingLevelAt(lines, index) {
    const atx = lines[index].match(HEADING_RE)
    if (atx) {
        return atx[1].length
    }
    const next = lines[index + 1]
    if (!next || !SETEXT_RE.test(next)) {
        return 0
    }
    const current = lines[index]
    if (current.trim() === '' || /^\s*(?:[-*+]|\d+\.)\s/.test(current) || /^\s*\|/.test(current) || /^\s*>/.test(current) || /^ {4}/.test(current)) {
        return 0
    }
    return next.trim().startsWith('=') ? 1 : 2
}

/**
 * 从 markdown 原文抽取标题与其产物 id（跳过 fenced code block）。
 * 标题重复时按 VitePress 行为追加 `-1` / `-2` 后缀（markdown-it-anchor 的去重口径）。
 * @param {string} content markdown 原文
 * @returns {Array<{ line: number, level: number, text: string, id: string }>}
 */
export function collectHeadings(content) {
    const lines = content.split(/\r?\n/)
    const mask = fenceMask(lines)
    const headings = []
    const used = new Set()
    let index = 0

    // 跳过 frontmatter（首个 `---` 块）：其中的 `# 注释` 不是标题
    if (lines[0]?.trim() === '---') {
        const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
        if (end > 0) {
            index = end + 1
        }
    }

    for (; index < lines.length; index++) {
        if (mask[index]) {
            continue
        }
        const level = headingLevelAt(lines, index)
        if (level === 0) {
            continue
        }
        const rawText = level > 0 && lines[index].match(HEADING_RE) ? lines[index].match(HEADING_RE)[2] : lines[index].trim()
        const custom = rawText.match(CUSTOM_ANCHOR_RE)
        const text = headingSlugText(custom ? rawText.slice(0, custom.index) : rawText)
        const base = custom ? custom[1] : slugify(text)
        // 去重口径对齐 markdown-it-anchor：used-id 集合 + 自增后缀，
        // 碰撞时继续试探（`Foo` / `Foo-1` / `Foo` → foo / foo-1 / foo-2）
        let id = base
        let suffix = 1
        while (used.has(id)) {
            id = `${base}-${suffix}`
            suffix += 1
        }
        used.add(id)
        headings.push({
            line: index + 1,
            level,
            text,
            id,
        })
    }

    return headings
}

/** 读文件并抽取标题（薄封装，便于调用方省一次 readFileSync 样板）。 */
export function collectFileHeadings(file) {
    return collectHeadings(readFileSync(file, 'utf8'))
}
