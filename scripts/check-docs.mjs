/**
 * check-docs：仓库内 markdown 文档规范统一检查入口。
 *
 * 规则集（按 rule 选择性启用）：
 * - **links**：本地相对链接存在性 / 锚点匹配 / 绝对路径拒绝 /
 *   路径穿越拒绝 / gitignored 路径拒绝 / 正文个人机器路径拒绝
 *   （从原 scripts/check-links.mjs 迁移；功能与输出格式保持一致）
 * - **vue-interp**：docs/ 下 inline code 是否含 Vue 插值 {{...}}（VitePress
 *   编译失败模式，从原 scripts/check-md-vue-interp.mjs 迁移）
 *
 * 设计原则：
 * - 纯函数（checkLinks / checkVueInterp）+ CLI 入口守卫（isDirectExecution）：
 *   vitest import 时不执行顶层副作用
 * - 路径解析用 `relative(repoRoot, file)` 统一跨平台表示（POSIX /
 *   Windows），与 lint-md 输出对齐
 * - 错误格式 `path:line:col message` 与 check-links 历史一致，工具链
 *   （编辑器跳转 / grep）通用
 * - 退出码：0 通过 / 1 发现问题 / 2 参数错误（如 --only 不合法）
 *
 * 用法：
 *   node scripts/check-docs.mjs                 # 跑所有规则
 *   node scripts/check-docs.mjs --only=links    # 只跑 links
 *   node scripts/check-docs.mjs --only=vue-interp  # 只跑 vue-interp
 *
 * 历史教训：
 * - f52dd24 提交时未跑 docs:build，inline code 内 `{{.ServerVersion}}` 触发
 *   VitePress 编译失败；本脚本把 Vue 编译层验证前置到 commit / CI 前
 *   （教训见 [经验归档 §二十三](../design/governance/experience-archive.md)）
 * - check-links 的 gitignored 路径检查（教训 §三十）：防止"本地存在 / CI 缺失"
 *   的链接侥幸通过
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getCliArgs, isDirectExecution } from './shared/cli.mjs'
import { isGitIgnored, isInsideGitWorkTree, REPO_ROOT, walkMdFiles } from './shared/md-walk.mjs'

const repoRoot = REPO_ROOT

// ============================================================
// ============      links 规则（来自 check-links.mjs）      =========
// ============================================================

const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g
// 本地绝对路径：POSIX（/xxx）、Windows 盘符（C:/xxx / C:\xxx）、UNC（\\server）
const ABS_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/
// 正文中的个人机器路径（高特征）：Windows 盘符 + 分隔符、UNC 双反斜杠前缀
const BODY_ABS_PATH_RE = /(?<![a-zA-Z])(?:[a-zA-Z]:[\\/][^\s`)'"，。；：！？、`]+|\\\\[^\s`)'"，。；：！？、`]+)/g

/** 宽松规范化：小写 + 移除标点/符号（含 emoji）/空白，用于跨平台锚点比较 */
export function looseNorm(str) {
    return str.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

/** 锚点规范化：兼容原文与 URL 编码两种写法 */
export function normAnchor(anchor) {
    try {
        return looseNorm(decodeURIComponent(anchor))
    } catch {
        return looseNorm(anchor)
    }
}

/** 提取文件的标题集合（跳过 fenced code block），返回宽松规范化后的形式 */
export function collectTitles(file) {
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

/**
 * 扫描仓库根目录下所有 .md 文件的本地链接，返回 { files, errors }。
 * 相对路径存在性、锚点匹配、本地绝对路径拒绝、路径穿越拒绝、gitignored
 * 路径拒绝、正文个人机器路径拒绝。
 */
export function checkLinks(repoRoot) {
    const files = walkMdFiles(repoRoot)
    const errors = []
    const gitCheckEnabled = isInsideGitWorkTree(repoRoot)

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
            const rel = relative(repoRoot, file)
            // 去掉行内代码段，避免误匹配代码里的链接
            const clean = line.replace(/`[^`]*`/g, '')
            for (const m of clean.matchAll(LINK_RE)) {
                const target = m[2]
                if (!target || /^(https?:|mailto:|tel:|www\.|<)/.test(target)) {
                    continue
                }
                const [pathPart, anchor] = target.split('#')

                if (!pathPart) {
                    // 站内锚点：验证当前文件标题
                    if (anchor && !selfTitles.has(normAnchor(anchor))) {
                        errors.push(`${rel}:${idx + 1} 站内锚点 "#${anchor}" 在文件中找不到对应标题`)
                    }
                    return
                }

                // 本地绝对路径拒绝
                if (ABS_PATH_RE.test(pathPart)) {
                    errors.push(`${rel}:${idx + 1} 链接目标为本地绝对路径，应使用相对路径: ${pathPart}`)
                    return
                }

                const targetFile = resolve(dirname(file), pathPart)

                // 路径穿越拒绝
                const relTarget = relative(repoRoot, targetFile)
                const sep = relTarget.includes('\\') ? '\\' : '/'
                if (relTarget === '..' || relTarget.startsWith(`..${sep}`) || isAbsolute(relTarget)) {
                    errors.push(`${rel}:${idx + 1} 链接目标超出项目范围（路径穿越）: ${pathPart}`)
                    return
                }

                // gitignored 路径必须在 existsSync 前检查
                if (gitCheckEnabled && isGitIgnored(targetFile, repoRoot)) {
                    errors.push(`${rel}:${idx + 1} 链接目标被 .gitignore 排除（CI 中不存在），应改用入仓库路径: ${pathPart}`)
                    return
                }
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

            // 正文个人机器路径拒绝
            const linkless = line.replace(LINK_RE, '')
            for (const m of linkless.matchAll(BODY_ABS_PATH_RE)) {
                errors.push(`${rel}:${idx + 1} 正文包含本地绝对路径（个人机器路径），应使用项目相对路径或 <repo-root>/ 占位符: ${m[0]}`)
            }
        })
    }

    return { files, errors }
}

// ============================================================
// ==========  vue-interp 规则（来自 check-md-vue-interp.mjs）  ====
// ============================================================

// 单反引号包裹、不含反引号与换行的最简 inline code 形式
const INLINE_CODE_RE = /`[^`\n]+`/g
// 行内代码内容中是否含 Vue 插值
const MUSTACHE_RE = /\{\{|\}\}/
// v-pre span 开始 / 结束标签
const V_PRE_OPEN_RE = /<span\s+v-pre(?:\s[^>]*)?>/g
const V_PRE_CLOSE_RE = /<\/span>/g
// fenced code block 边界
const FENCE_RE = /^\s*```/
// HTML 注释（行内或多行）
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g

/**
 * 扫描单个文件内容，返回错误列表。
 * 状态：inFence（fenced code block）+ vPreDepth（v-pre span 嵌套计数）。
 * inline code 命中按所在位置的局部 vPreDepth（行内累计）决定豁免。
 *
 * @param {string} content 文件原文
 * @param {string} relPath 用于错误信息中的相对路径
 * @returns {string[]} 错误描述数组
 */
export function scanVueInterp(content, relPath) {
    const errors = []
    const lines = content.split(/\r?\n/)
    let inFence = false
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
 * 仅扫 docs/（不进 VitePress 编译管道的 docs/*.md 不需要检测）。
 */
export function checkVueInterp(repoRoot) {
    const docsRoot = join(repoRoot, 'docs')
    let files = []
    try {
        files = walkMdFiles(docsRoot)
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
        errors.push(...scanVueInterp(content, relPath))
    }
    return { files, errors }
}

// ============================================================
// ============                CLI 入口                   =========
// ============================================================

const RULES = {
    links: { run: checkLinks, label: 'links' },
    'vue-interp': { run: checkVueInterp, label: 'vue-interp' },
}

function parseOnly(argv) {
    const arg = argv.find((a) => a.startsWith('--only='))
    if (!arg) {
        return null
    }
    const v = arg.slice('--only='.length)
    if (!RULES[v]) {
        const allowed = Object.keys(RULES).join(', ')
        console.error(`[check-docs] Unsupported --only value: ${v}; allowed: ${allowed}`)
        process.exit(2)
    }
    return v
}

if (isDirectExecution(import.meta.url)) {
    const only = parseOnly(getCliArgs())
    const ruleNames = only ? [only] : Object.keys(RULES)
    const labels = []
    const allErrors = []

    for (const name of ruleNames) {
        const { files, errors } = RULES[name].run(repoRoot)
        labels.push(`${RULES[name].label}: ${files.length} 个 md 文件`)
        for (const e of errors) {
            allErrors.push(`[${RULES[name].label}] ${e}`)
        }
    }

    if (allErrors.length > 0) {
        console.error(`[check-docs] ${allErrors.length} 处问题:`)
        for (const e of allErrors) {
            console.error(`  - ${e}`)
        }
        process.exit(1)
    }
    console.log(`[check-docs] OK：${labels.join(' / ')}${only ? '' : '全部通过'}`)
}

// 内部辅助：供单测访问正则常量与规则集
export const _internals = {
    RULES,
    // links
    LINK_RE,
    ABS_PATH_RE,
    BODY_ABS_PATH_RE,
    // vue-interp
    INLINE_CODE_RE,
    MUSTACHE_RE,
    V_PRE_OPEN_RE,
    V_PRE_CLOSE_RE,
    FENCE_RE,
    HTML_COMMENT_RE,
}
