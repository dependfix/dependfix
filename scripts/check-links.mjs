/**
 * 检查仓库内所有 .md 文件的本地链接：
 * 1. 相对路径指向的文件必须存在；
 * 2. 锚点（#xxx）必须对应目标文件中的某个标题——按"宽松规范化"比较
 *    （小写 + 移除标点/符号（含 emoji）/空白），兼容 GitHub / VS Code / VitePress
 *    三种 slug 规则差异，只抓真实断链与假锚点。
 *
 * 说明：
 * - 跨平台锚点 slug 规则不一致（GitHub 移除全角标点，VS Code / VitePress 保留，
 *   且对 `.` 等字符转 '-' 的策略也不同），因此不做精确 slug 匹配；
 * - 含全角标点的标题锚点在部分平台仍可能失效，由文档规范约束（标题避免全角标点）。
 * - 用法：node scripts/check-links.mjs（或 pnpm check:links）
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.changeset', '.vitepress', 'dist', 'archive', '.agents', '.claude'])
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g

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

// 宽松规范化：小写 + 移除标点/符号（含 emoji）/空白，用于跨平台锚点比较
function looseNorm(str) {
    return str.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

// 提取文件的标题集合（跳过 fenced code block），返回宽松规范化后的形式
function collectTitles(file) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    const titles = new Set()
    let inCode = false
    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            inCode = !inCode
            continue
        }
        if (inCode) {
            continue
        }
        const m = line.match(/^(#{1,6})\s+(.+)$/)
        if (!m) {
            continue
        }
        const title = m[2]
            .replace(/`[^`]*`/g, '')
            .replace(/\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/[#*_~]/g, '')
            .trim()
        titles.add(looseNorm(title))
    }
    return titles
}

// 锚点规范化：兼容原文与 URL 编码两种写法
function normAnchor(anchor) {
    try {
        return looseNorm(decodeURIComponent(anchor))
    } catch {
        return looseNorm(anchor)
    }
}

const files = walk(repoRoot)
const errors = []

for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    const selfTitles = collectTitles(file)
    let inCode = false

    lines.forEach((line, idx) => {
        if (/^\s*```/.test(line)) {
            inCode = !inCode
            return
        }
        if (inCode) {
            return
        }
        // 去掉行内代码段，避免误匹配代码里的链接
        const clean = line.replace(/`[^`]*`/g, '')
        for (const m of clean.matchAll(LINK_RE)) {
            const target = m[2]
            if (!target || /^(https?:|mailto:|tel:|www\.|<)/.test(target)) {
                continue
            }
            const [pathPart, anchor] = target.split('#')
            const rel = file === repoRoot ? '' : file.slice(repoRoot.length)

            if (!pathPart) {
                // 站内锚点：验证当前文件标题
                if (anchor && !selfTitles.has(normAnchor(anchor))) {
                    errors.push(`${rel}:${idx + 1} 站内锚点 "#${anchor}" 在文件中找不到对应标题`)
                }
                return
            }

            const targetFile = resolve(dirname(file), pathPart)
            if (!existsSync(targetFile)) {
                errors.push(`${rel}:${idx + 1} 链接目标不存在: ${pathPart}`)
                return
            }
            if (anchor) {
                const titles = collectTitles(targetFile)
                if (!titles.has(normAnchor(anchor))) {
                    errors.push(`${rel}:${idx + 1} 锚点 "#${anchor}" 在 ${pathPart} 中找不到对应标题`)
                }
            }
        }
    })
}

if (errors.length > 0) {
    console.error(`[check-links] ${errors.length} 个链接问题:`)
    for (const e of errors) {
        console.error(`  - ${e}`)
    }
    process.exit(1)
}
console.log(`[check-links] OK：${files.length} 个 md 文件的本地链接全部有效`)
