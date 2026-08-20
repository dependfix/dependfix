/**
 * 检查仓库内 docs/ 站点 markdown 中**行内代码**（反引号包裹）是否包含
 * Vue 模板插值语法 `{{...}}` 或 `}}` —— VitePress 会把行内代码字面量
 * 也作为 Vue 模板解析，inline code 不豁免，会导致 docs:build 编译失败
 * （vue compiler "Error parsing JavaScript expression"）。
 *
 * 修复方法（按 VitePress 官方 Using Vue in Markdown → Escaping）：
 * 用 `<span v-pre>` 包裹含 mustache 的 inline code 段，fenced code block
 * 内则天然安全。
 *
 * 本脚本仅扫描 docs/ 下的所有 .md（其他目录 .md 不进 VitePress 编译管道，无需检测）。
 * 与 check-links.mjs 复用相同结构：纯函数 + CLI 入口 + 退出码（>0 报错时 exit 1）。
 *
 * 边界与豁免：
 * - fenced code block（``` ... ```）内行内代码：天然安全，跳过
 * - HTML 注释（<!-- ... -->）：Vue 不解析，跳过
 * - 已用 `<span v-pre>` 包裹的行内代码：v-pre 让 Vue 跳过该子树，按行级
 *   状态机跟踪 v-pre 深度（vPreDepth）> 0 时豁免
 * - 反斜杠转义 `\{{`：Vue 不识别转义，仍会编译失败 → 不豁免（保留为硬错误，
 *   强制用户改用 v-pre）
 * - 双反引号 inline code 内含单反引号等复杂嵌套：暂不支持（项目实践以单
 *   反引号为主；如未来需要可改用 markdown-it 解析）
 *
 * 教训：f52dd24 提交时未跑 pnpm docs:build，本应 commit 前挡住；commit
 * f483473 已修复首个落点。本脚本把验证前移到 commit / CI 前，闭环同源风险。
 * 历史教训见 [经验归档 §二十三](../design/governance/experience-archive.md)。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
// 与 check-links 一致：排除构建产物、缓存、gitignored 审计产物
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.vitepress', 'dist', 'artifacts'])
// 单反引号包裹、不含反引号与换行的最简 inline code 形式
const INLINE_CODE_RE = /`[^`\n]+`/g
// 行内代码内容中是否含 Vue 插值
const MUSTACHE_RE = /\{\{|\}\}/
// v-pre span 开始 / 结束标签
const V_PRE_OPEN_RE = /<span\s+v-pre(?:\s[^>]*)?>/g
const V_PRE_CLOSE_RE = /<\/span>/g
// fenced code block 边界（与 check-links 同款）
const FENCE_RE = /^\s*```/
// HTML 注释（行内或多行）
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (EXCLUDED_DIRS.has(entry)) {
            continue
        }
        const full = join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) {
            walk(full, out)
        } else if (entry.endsWith('.md')) {
            out.push(full)
        }
    }
    return out
}

/**
 * 扫描单个文件内容，返回错误列表。
 * 状态：inFence（fenced code block）+ vPreDepth（v-pre span 嵌套计数）。
 * inline code 命中按所在位置的局部 vPreDepth（行内累计）决定豁免。
 *
 * @param {string} content 文件原文
 * @param {string} relPath 用于错误信息中的相对路径
 * @returns {string[]} 错误描述数组
 */
export function scanContent(content, relPath) {
    const errors = []
    const lines = content.split(/\r?\n/)
    let inFence = false
    // v-pre span 跨行累积深度：行末用 open - close 更新，供下一行使用
    let vPreDepth = 0

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lineNum = i + 1

        if (FENCE_RE.test(line)) {
            inFence = !inFence
            continue
        }
        if (inFence) {
            continue
        }

        // 移除 HTML 注释后再扫描 inline code：注释内 `{{...}}` 不被 Vue 解析
        const lineNoComment = line.replace(HTML_COMMENT_RE, '')

        for (const m of lineNoComment.matchAll(INLINE_CODE_RE)) {
            // 当前 inline code 位置的有效 v-pre 深度 = 跨行累计 + 当前行此位置之前的 (open - close)
            const before = lineNoComment.slice(0, m.index)
            const opensBefore = (before.match(V_PRE_OPEN_RE) || []).length
            const closesBefore = (before.match(V_PRE_CLOSE_RE) || []).length
            const depthHere = vPreDepth + opensBefore - closesBefore
            if (depthHere > 0) {
                continue
            }
            const code = m[0].slice(1, -1)
            if (MUSTACHE_RE.test(code)) {
                errors.push(`${relPath}:${lineNum}:${m.index + 1} 行内代码包含 Vue 插值语法 '{{...}}'，VitePress 编译会失败；用 <span v-pre> 包裹该行内代码段。原文: ${m[0]}`)
            }
        }

        // 行末更新跨行累计深度：open +1 / close -1
        const openCount = (lineNoComment.match(V_PRE_OPEN_RE) || []).length
        const closeCount = (lineNoComment.match(V_PRE_CLOSE_RE) || []).length
        vPreDepth = vPreDepth + openCount - closeCount
    }

    return errors
}

/**
 * 扫描 docs/ 下所有 .md 文件，返回 { files, errors }。
 * 仅扫 docs/（不进 VitePress 编译管道的 docs/*.md 不需要检测——根目录 *.md /
 * .github/*.md / packages/*.md / skills/*.md 等不会被 VitePress 编译）。
 */
export function checkMdVueInterp(repoRoot) {
    const docsRoot = join(repoRoot, 'docs')
    let files = []
    try {
        files = walk(docsRoot)
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            // docs/ 不存在（如测试 tmpdir）→ 返回空集合
            return { files: [], errors: [] }
        }
        throw err
    }

    const errors = []
    for (const file of files) {
        const relPath = relative(repoRoot, file)
        const content = readFileSync(file, 'utf8')
        errors.push(...scanContent(content, relPath))
    }
    return { files, errors }
}

// CLI 入口守卫：vitest import 时不执行顶层副作用
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { files, errors } = checkMdVueInterp(repoRoot)

    if (errors.length > 0) {
        console.error(`[check-md-vue-interp] ${errors.length} 处问题:`)
        for (const e of errors) {
            console.error(`  - ${e}`)
        }
        process.exit(1)
    }
    console.log(`[check-md-vue-interp] OK：${files.length} 个 docs/*.md 文件中无 Vue 插值冲突`)
}

// 内部辅助：供单测模拟场景
export const _internals = {
    MUSTACHE_RE,
    INLINE_CODE_RE,
    V_PRE_OPEN_RE,
    V_PRE_CLOSE_RE,
    FENCE_RE,
    HTML_COMMENT_RE,
}