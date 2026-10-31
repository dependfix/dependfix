/**
 * check-docs：仓库内 markdown 文档规范统一检查入口。
 *
 * 规则集（按 rule 选择性启用）：
 * - **links**：本地相对链接存在性 / 锚点匹配 / 绝对路径拒绝 /
 *   路径穿越拒绝 / gitignored 路径拒绝 / 正文个人机器路径拒绝
 *   （从原 scripts/check-links.mjs 迁移；功能与输出格式保持一致）
 * - **vue-interp**：docs/ 下 inline code 是否含 Vue 插值 {{...}}（VitePress
 *   编译失败模式，从原 scripts/check-md-vue-interp.mjs 迁移）
 * - **link-text**：链接文本 §N ↔ 目标锚点编号一致性（文本与锚点编号互为前缀即通过）
 * - **link-syntax**：畸形链接（残留 `](` / 孤立「`.md` 片段 + `#`锚点 + `)`」）
 * - **emphasis**：强调标记 `**` 未配对（渲染级盲区：lint / links / docs:build 均不报）
 * - **site-links**：VitePress 站点绝对链接（nav / sidebar / 首页 frontmatter）指向的源文件
 * - **archive-anchors**：`docs/plan/archive/**` 锚点子集（自锚点 + 跨文档锚点；file-dead 豁免）
 * - **anchor-id**：站内锚点必须是目标页面的 VitePress 产物 id（逐字符相等；
 *   宽松归一化会把 GitHub 口径的错锚判绿，见 `docs/standards/documentation.md`；
 *   slug 口径的单一事实源是 `scripts/docs/vitepress-slug.mjs`）
 *
 * 覆盖边界：`links` 面排除 `docs/plan/archive/**`（归档动作会让历史相对链接指向预期外
 * 位置，file-dead 属独立批次）；锚点子集 / 强调标记 / 畸形链接三类与路径漂移无关，覆盖归档文档。
 *
 * 设计原则：
 * - 纯函数（checkLinks / checkVueInterp / ...）+ CLI 入口守卫（isDirectExecution）：
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
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getCliArgs, isDirectExecution } from './shared/cli.mjs'
import { isGitIgnored, isInsideGitWorkTree, REPO_ROOT, walkMdFiles } from './shared/md-walk.mjs'
import { EXTERNAL_LINK_RE, FENCE_RE, LINK_RE, fenceMask, looseNorm, forEachProseLine, RUNTIME_EXCLUDED_PATHS } from './docs/md-scan.mjs'
import { collectFileHeadings } from './docs/vitepress-slug.mjs'

const repoRoot = REPO_ROOT

// ============================================================
// ============      links 规则（来自 check-links.mjs）      =========
// ============================================================

// 本地绝对路径：POSIX（/xxx）、Windows 盘符（C:/xxx / C:\xxx）、UNC（\\server）
const ABS_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/
// 正文中的个人机器路径（高特征）：Windows 盘符 + 分隔符、UNC 双反斜杠前缀
const BODY_ABS_PATH_RE = /(?<![a-zA-Z])(?:[a-zA-Z]:[\\/][^\s`)'"，。；：！？、`]+|\\\\[^\s`)'"，。；：！？、`]+)/g

export { looseNorm }

/** 锚点规范化：兼容原文与 URL 编码两种写法 */
export function normAnchor(anchor) {
    try {
        return looseNorm(decodeURIComponent(anchor))
    } catch {
        return looseNorm(anchor)
    }
}

/**
 * 提取文件的标题集合（跳过 fenced code block），返回宽松规范化后的形式。
 *
 * 标题文本抽取与 VitePress 同源（`vitepress-slug.mjs`）：行内代码 / 内联 HTML 的
 * **内容参与** slug。历史实现把行内代码整体剥离，导致「按产物 id 书写的新锚点」在
 * 宽松比较下反而找不到标题（如 `## 6.2 …（`failure_code` …）` 的产物 id 含
 * `failure-code`）——两套口径必须同源，否则门禁会惩罚正确写法。
 */
export function collectTitles(file) {
    const titles = new Set()
    for (const heading of collectFileHeadings(file)) {
        titles.add(looseNorm(heading.text))
        titles.add(looseNorm(heading.id))
    }
    return titles
}

/**
 * 扫描仓库根目录下所有 .md 文件的本地链接，返回 { files, errors }。
 * 相对路径存在性、锚点匹配、本地绝对路径拒绝、路径穿越拒绝、gitignored
 * 路径拒绝、正文个人机器路径拒绝。
 */
export function checkLinks(repoRoot) {
    const files = walkMdFiles(repoRoot, [], RUNTIME_EXCLUDED_PATHS)
    const errors = []
    const gitCheckEnabled = isInsideGitWorkTree(repoRoot)

    for (const file of files) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        const selfTitles = collectTitles(file)
        const codeMask = fenceMask(lines)

        lines.forEach((line, idx) => {
            if (codeMask[idx]) {
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
// HTML 注释（行内或多行）；未配对的 `<!--` 也截到行尾，避免残留触发 Vue 插值误判
const HTML_COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g

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
    const codeMask = fenceMask(lines)
    let vPreDepth = 0

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lineNum = i + 1

        if (codeMask[i]) {
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
// ==========   行级剥离 & 规则共享辅助（新规则）   =============
// ============================================================

/** 图片形态（作为链接文本嵌套时先剥离，避免 `](` 吞掉外层 `[`）
 *  已知边界：`[^)\s]+` 在 URL 含空格或括号时退化（`![alt](a b.png)` 不剥离、
 *  `![alt](foo(bar).png)` 残留尾括号）——当前文档面无此类形态。 */
const IMAGE_RE = /!\[[^\]]*\]\([^)\s]+\)/g

/**
 * 剥离一行中的 inline code、图片与（可嵌套的）链接，返回「纯文本」行。
 * 迭代 3 次：`[![alt](img)](url)` 这类「图片作为链接文本」的嵌套形态需逐层收敛，
 * 否则内层匹配会吞掉外层 `[`，把合法的整链留成畸形片段（假阳性）。
 */
export function stripInline(line) {
    let clean = line.replace(/`[^`]*`/g, '')
    for (let i = 0; i < 3; i++) {
        clean = clean.replace(IMAGE_RE, '<IMG>').replace(LINK_RE, '<LINK>')
    }
    return clean
}

/** 水平线（`***` / `---` / `___`，允许分隔空格）：不参与强调标记计数 */
const HR_RE = /^\s*([*_-])\s*(?:\1\s*){2,}$/

/** markdown 表格行（每行自成强调标记计数的块边界） */
const TABLE_ROW_RE = /^\s*\|/

/** 标题行（自成块：标题内强调不跨行） */
const HEADING_RE = /^#{1,6}\s/

/** 列表项起始行（自成块起点；其续行归属同一项） */
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+\.)\s/

/**
 * 孤立锚点片段（`.md` 路径 + `#锚点` + 右括号）。
 * 前置约束 `(?<![\w/.(\[])`：片段起点之前不得是词字符 / `/` / `.` / 半角左括号或方括号
 * （避免从路径中途起匹配，如 `ocs/guide/x.md#标题)`）。
 */
const STRAY_FRAGMENT_RE = /(?<![\w/.([])[^\s([]*\.mdx?#[^\s)]+\)/g

/** 统计行内某字符出现次数（用于「右括号多于左括号」的孤立判定） */
function countChar(text, ch) {
    let total = 0
    for (const c of text) {
        if (c === ch) {
            total += 1
        }
    }
    return total
}

/**
 * 强调标记计数前的行级剥离：HTML 注释（不参与渲染）+ inline code（反引号包裹后不参与强调解析）。
 */
function emphasisMarkCount(line) {
    return (line.replace(HTML_COMMENT_RE, '').replace(/`[^`]*`/g, '').match(/\*\*/g) || []).length
}

// ============================================================
// ====  link-text 规则（链接文本 §N ↔ 锚点编号一致性）   =======
// ============================================================

/** 中文数字（个 / 十 / 百位组合，如 五十六 / 七十二 / 一百）→ 阿拉伯数字 */
const CN_DIGIT = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

/**
 * 中文数字 token → 数字；非纯中文数字（含其它字符）返回 null。
 * 覆盖「十位 + 个位」与「百位」组合：`五十六` → 56 / `七十二` → 72 / `十九` → 19 / `十` → 10。
 */
export function chineseNumeralToNumber(token) {
    if (!/^[零一二两三四五六七八九十百]+$/.test(token)) {
        return null
    }
    let total = 0
    let current = 0
    for (const ch of token) {
        if (ch in CN_DIGIT) {
            current = CN_DIGIT[ch]
        } else if (ch === '十') {
            total += (current || 1) * 10
            current = 0
        } else if (ch === '百') {
            total += (current || 1) * 100
            current = 0
        }
    }
    return total + current
}

/**
 * 链接文本中的 `§` 编号 → 规范化数字串集合（`§5.1.22` → `5122`）。
 * - 中文数字同样转换（`§五十六` → `56`）
 * - 末尾 `.x` 占位（`§5.1.x`）记为前缀匹配项（返回值以 `^` 开头）
 */
export function textSectionNumbers(text) {
    const numbers = new Set()
    const re = /§\s*([0-9]+(?:\.[0-9]+)*(?:\.[xX])?|[零一二两三四五六七八九十百]+)/g
    for (const m of text.matchAll(re)) {
        const token = m[1]
        if (/^[0-9]/.test(token)) {
            numbers.add((/[xX]$/.test(token) ? '^' : '') + token.replace(/[.xX]/g, ''))
        } else {
            const value = chineseNumeralToNumber(token)
            if (value !== null) {
                numbers.add(String(value))
            }
        }
    }
    return numbers
}

/**
 * 锚点前导编号 → 规范化数字串（`44-大批量…` → `44`；`五十六m24…` → `56`；无编号 → null）。
 * 兼容 VitePress 产物 id：数字开头的标题带 `_` 前缀且 `.` 被拆成 `-`
 * （`_5-1-15-标题` → `5115`），故先剥 `_` 再按 `.` / `-` 连接的数字串解析。
 */
export function anchorLeadingNumber(anchor) {
    const m = decodeURIComponentSafe(anchor)
        .replace(/^_/, '')
        .match(/^([0-9]+(?:[.-][0-9]+)*|[零一二两三四五六七八九十百]+)/)
    if (!m) {
        return null
    }
    if (/^[0-9]/.test(m[1])) {
        return m[1].replace(/[.-]/g, '')
    }
    const value = chineseNumeralToNumber(m[1])
    return value === null ? null : String(value)
}

function decodeURIComponentSafe(value) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

/**
 * 扫描本地链接，校验「链接文本里的 `§N`」与「目标锚点所属编号」一致。
 *
 * 可机检子集（其余显式排除，避免猜测）：
 * - 文本含 `§` 编号 **且** 锚点以编号开头 → 比较；二者**互为前缀**即通过
 *   （`[§5.1.15](development.md#51-工程实践规则)` 指向父级章节属合法写法）
 * - 文本含 **多个** `§` 编号（引用范围 / 组合引用）→ 跳过
 * - 锚点无前导编号（纯文字标题）→ 跳过
 * - 归档目录（`docs/plan/archive/**`）由 `archive-anchors` 规则单独覆盖
 */
export function checkLinkText(repoRoot) {
    const files = walkMdFiles(repoRoot, [], RUNTIME_EXCLUDED_PATHS)
    const errors = []

    for (const file of files) {
        const rel = relative(repoRoot, file)
        forEachProseLine(file, (line, lineNum) => {
            const clean = line.replace(/`[^`]*`/g, '')
            for (const m of clean.matchAll(LINK_RE)) {
                const [, text, target] = m
                if (!target || /^(https?:|mailto:|tel:|www\.|<)/.test(target)) {
                    continue
                }
                const hashIndex = target.indexOf('#')
                if (hashIndex < 0 || hashIndex === target.length - 1) {
                    continue
                }
                const anchor = target.slice(hashIndex + 1)
                const numbers = textSectionNumbers(text)
                if (numbers.size !== 1) {
                    continue
                }
                const anchorNumber = anchorLeadingNumber(anchor)
                if (anchorNumber === null) {
                    continue
                }
                const expected = [...numbers][0]
                // 通过条件：精确相等，或**文本编号以锚点编号为前缀**（锚点指向父级章节，
                // 如 `[§5.1.15](development.md#51-工程实践规则)`）。不反向容忍——锚点编号
                // 比文本更深（`§5.1.1` → `#5115-…`）属编号漂移，须报。
                const matched = expected.startsWith('^')
                    ? anchorNumber.startsWith(expected.slice(1))
                    : (anchorNumber === expected || expected.startsWith(anchorNumber))
                if (!matched) {
                    errors.push(
                        `${rel}:${lineNum} 链接文本章节号与目标锚点不一致：文本 §${expected.replace('^', '')} → 锚点 "#${anchor}"（${anchorNumber}）`,
                    )
                }
            }
        })
    }

    return { files, errors }
}

// ============================================================
// ====  link-syntax 规则（畸形链接：未成对 ]( / 孤立 )）  ======
// ============================================================

/**
 * 扫描「合法文本但链接结构已破损」的畸形形态（剥离 inline code / 图片 / 合法链接后判定）：
 * - 残留 `](`：链接被截断或括号未成对
 * - 残留「`.md` 路径片段 + `#`锚点 + 孤立 `)`」（`STRAY_FRAGMENT_RE`）：跨文档锚点链接被就地
 *   截断（重复粘贴 / 误删 `[`）。负向后顾 `(?<![(\[])` 排除 `(path.md#anchor)` 这类正文引用
 *   （前置为半角左括号 / 方括号时不算畸形片段），故对「半角括号包住的路径引用」保守放行。
 *
 * 覆盖全部 md（含 `docs/plan/archive/**`）——该缺陷与归档导致的路径漂移无关。
 */
export function checkLinkSyntax(repoRoot) {
    const files = walkMdFiles(repoRoot, [], RUNTIME_EXCLUDED_PATHS, { includeDirs: ['archive'] })
    const errors = []

    for (const file of files) {
        const rel = relative(repoRoot, file)
        forEachProseLine(file, (line, lineNum) => {
            const clean = stripInline(line)
            if (clean.includes('](')) {
                errors.push(`${rel}:${lineNum} 链接括号未成对（残留 "]( "），疑似链接被截断: ${clean.trim().slice(0, 80)}`)
            }
            const stray = clean.match(STRAY_FRAGMENT_RE)
            // 仅当该行右括号多于左括号（确有一个孤立 `)`）时判定——排除 `(see a.md#x)` 这类
            // 成对半角括号的正文引用形态（片段本身看起来像目标，但括号是配对的）
            if (stray && countChar(clean, ')') > countChar(clean, '(')) {
                errors.push(`${rel}:${lineNum} 存在孤立的锚点片段 + 右括号（缺少左括号 / 目标），疑似畸形链接: ${stray.join(' | ')}`)
            }
        })
    }

    return { files, errors }
}

// ============================================================
// ====  emphasis 规则（强调标记 `**` 未配对）   ===============
// ============================================================

/**
 * 扫描 `**` 未配对的破损强调（渲染级盲区：`lint:md` / `check:docs` links 面 /
 * `docs:build` 均不报错，但渲染出的字面 `**` 与错误强调范围会破坏排版）。
 *
 * 计数边界：
 * - 块边界 = 空行 / fenced code block / **表格行** / **标题行** / **列表项起始行**
 *   （表格每行、标题每行自成一块；列表项续行归属同一项）
 * - 水平线（`***` / `---` / `___`）不计入
 * - HTML 注释与 inline code 内的 `**` 不计入（均不参与强调解析）
 * - 块内 `**` 总数为奇数 → 报该块中「使计数由偶变奇」的最后一行
 * - **已知盲区**：成对但与语义错位（如把 `**` 嵌进已加粗标题、`**；**` 这类成对错位）不报——
 *   属 `documentation.md §2` 声明的渲染级盲区；列表项内含水平线（`- ***`）会按 `**` 计入
 *   （当前文档面无此写法）
 *
 * 覆盖全部 md（含 `docs/plan/archive/**`）。
 */
export function checkEmphasis(repoRoot) {
    const files = walkMdFiles(repoRoot, [], RUNTIME_EXCLUDED_PATHS, { includeDirs: ['archive'] })
    const errors = []

    for (const file of files) {
        const rel = relative(repoRoot, file)
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        const codeMask = fenceMask(lines)
        let count = 0
        let lastOddLine = null

        const flush = () => {
            if (count % 2 === 1) {
                errors.push(`${rel}:${lastOddLine} 强调标记 "**" 未配对（本块计数为奇数），渲染会出现字面 "**" 或错误强调范围`)
            }
            count = 0
            lastOddLine = null
        }

        /** 自成一块的行：本行即整块（表格行 / 标题行），块结束立即判定 */
        const ownBlock = (line, lineNum) => {
            count = emphasisMarkCount(line)
            lastOddLine = count % 2 === 1 ? lineNum : null
            flush()
        }

        lines.forEach((line, idx) => {
            const lineNum = idx + 1
            if (codeMask[idx]) {
                flush()
                return
            }
            if (line.trim() === '' || HR_RE.test(line)) {
                flush()
                return
            }
            if (TABLE_ROW_RE.test(line) || HEADING_RE.test(line)) {
                flush()
                ownBlock(line, lineNum)
                return
            }
            if (LIST_ITEM_RE.test(line)) {
                // 列表项自成块起点；本项续行归属同一块
                flush()
                count = emphasisMarkCount(line)
                lastOddLine = count % 2 === 1 ? lineNum : null
                return
            }
            const marks = emphasisMarkCount(line)
            count += marks
            if (marks > 0 && count % 2 === 1) {
                // 记录「让块计数由偶变奇」的行：奇数收尾时它即失衡起点，比块首行更可定位
                lastOddLine = lineNum
            }
        })
        flush()
    }

    return { files, errors }
}

// ============================================================
// ====  site-links 规则（VitePress 站点绝对链接存在性）   ======
// ============================================================

/** 首页 frontmatter 的 `link:`（features / hero actions 两类均为缩进 `link: /xxx`，可带引号） */
const FRONTMATTER_LINK_RE = /^\s*link:\s*['"]?([^'"\s]+)['"]?\s*$/gm
/** 站点配置中的 `link: '/xxx'`（nav / sidebar；单双引号均支持） */
const CONFIG_LINK_RE = /link:\s*['"]([^'"]+)['"]/g

/**
 * 站点绝对路径 → 候选源文件（VitePress `cleanUrls: true` + `rewrites` 把
 * `docs/i18n/en-US/**` 发布为 `/en-US/**`）。
 */
function siteLinkCandidates(repoRoot, sitePath) {
    const parts = sitePath.split('/').filter(Boolean)
    const base = parts[0] === 'en-US'
        ? join(repoRoot, 'docs/i18n/en-US', ...parts.slice(1))
        : join(repoRoot, 'docs', ...parts)
    return [base, `${base}.md`, join(base, 'index.md'), join(base, 'README.md')]
}

/** 取文件首个 frontmatter 块（`---` 与下一个 `---` 之间）的文本；无 frontmatter 返回 '' */
function frontmatterOf(content) {
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    return m ? m[1] : ''
}

/**
 * 校验 VitePress 站点绝对链接（nav / sidebar / 首页 frontmatter）指向的源文件存在。
 * 站点 `ignoreDeadLinks: true` 会让这类死链静默通过构建——本规则把该面独立出来机检。
 *
 * 覆盖边界（显式声明）：仅静态配置面（`docs/.vitepress/config.ts` 的 `link:`
 * 字面量 + 首页 frontmatter `link:`）；主题在运行期生成的链接（语言切换器、
 * 内建导航等）不在解析面内——未翻译页的 locale 兜底由独立条目承接
 * （登记见 `docs/plan/todo.md`；覆盖边界实证见 `artifacts/m44.2/`）。
 * 已知边界：`CONFIG_LINK_RE` 只识别 `link:` 后的**字面量**（单双引号），变量拼接 /
 * 模板串构造的链接会静默漏检（当前配置面全为字面量）。
 */
export function checkSiteLinks(repoRoot) {
    const files = []
    const errors = []
    const entries = []

    const configPath = join(repoRoot, 'docs/.vitepress/config.ts')
    if (existsSync(configPath)) {
        files.push(configPath)
        const config = readFileSync(configPath, 'utf8')
        for (const m of config.matchAll(CONFIG_LINK_RE)) {
            entries.push([relative(repoRoot, configPath), m[1]])
        }
    }

    for (const rel of ['docs/index.md', 'docs/i18n/en-US/index.md']) {
        const page = join(repoRoot, rel)
        if (!existsSync(page)) {
            continue
        }
        files.push(page)
        const content = readFileSync(page, 'utf8')
        for (const m of frontmatterOf(content).matchAll(FRONTMATTER_LINK_RE)) {
            entries.push([rel, m[1]])
        }
    }

    for (const [source, link] of entries) {
        if (/^(https?:|mailto:|tel:|www\.)/.test(link)) {
            continue
        }
        const [pathPart, anchor] = link.split('#')
        const candidates = siteLinkCandidates(repoRoot, pathPart === '' ? '/' : pathPart)
        const target = candidates.find((c) => existsSync(c) && statSync(c).isFile())
        if (!target) {
            errors.push(`${source} 站点绝对链接未命中源文件（站点 ignoreDeadLinks 会静默放过）: ${link}`)
            continue
        }
        if (anchor && !collectTitles(target).has(normAnchor(anchor))) {
            errors.push(`${source} 站点绝对链接锚点无对应标题: ${link}`)
        }
    }

    return { files, errors }
}

// ============================================================
// ====  archive-anchors 规则（归档文档锚点子集）   =============
// ============================================================

/**
 * 归档文档（`docs/plan/archive/**`）的锚点子集校验：自锚点 + 跨文档锚点。
 *
 * 为什么只查锚点：归档动作会让历史相对链接指向预期外位置（`MD_EXCLUDED_DIRS.archive`
 * 决策）——**file-dead 维持豁免**；但锚点指向的是「文件内是否存在该标题」，与路径
 * 漂移无关，属真实破损（曾是归档文档长期无门禁的缺口）。
 *
 * 目标文件不存在（file-dead）时跳过锚点比对；目标存在则必须命中标题。
 */
export function checkArchiveAnchors(repoRoot) {
    const archiveDir = join(repoRoot, 'docs/plan/archive')
    if (!existsSync(archiveDir)) {
        return { files: [], errors: [] }
    }
    const files = walkMdFiles(archiveDir)
    const errors = []

    for (const file of files) {
        const rel = relative(repoRoot, file)
        const selfTitles = collectTitles(file)
        forEachProseLine(file, (line, lineNum) => {
            const clean = line.replace(/`[^`]*`/g, '')
            for (const m of clean.matchAll(LINK_RE)) {
                const [, , target] = m
                if (!target || /^(https?:|mailto:|tel:|www\.|<)/.test(target)) {
                    continue
                }
                const [pathPart, anchor] = target.split('#')
                if (!anchor) {
                    continue
                }
                if (!pathPart) {
                    if (!selfTitles.has(normAnchor(anchor))) {
                        errors.push(`${rel}:${lineNum} 站内锚点 "#${anchor}" 在归档文件中找不到对应标题`)
                    }
                    continue
                }
                if (ABS_PATH_RE.test(pathPart)) {
                    continue
                }
                const targetFile = resolve(dirname(file), pathPart)
                if (!existsSync(targetFile) || !statSync(targetFile).isFile()) {
                    continue // file-dead：归档豁免面
                }
                if (!collectTitles(targetFile).has(normAnchor(anchor))) {
                    errors.push(`${rel}:${lineNum} 跨文档锚点 "${pathPart}#${anchor}" 在目标文件中找不到对应标题`)
                }
            }
        })
    }

    return { files, errors }
}


// ============================================================
// ====  anchor-id 规则（锚点必须是 VitePress 产物 id）   =======
// ============================================================

/**
 * 站内锚点必须是目标页面的 VitePress 产物 id（`vitepress-slug.mjs` 的单一事实源）。
 *
 * 为什么需要独立规则：`links` / `archive-anchors` 用宽松归一化比较锚点（剥离全部
 * 标点含 `-`），GitHub 口径的 `--` 连字符、数字开头缺 `_` 前缀、全角标点残留等
 * 形态都会被判绿——在站点上却是死锚（点击不跳转）。本规则要求锚点**逐字符等于**
 * 产物 id，把「能跳转」这件事真正纳入门禁。
 *
 * 覆盖边界（显式声明，均属静默跳过）：
 * - 只校验 `.md` 目标（其它资源没有标题 id）；目标文件不存在时维持既有 file-dead 豁免
 * - 外部链接（http / mailto / …）与本文件内锚点同等对待（后者以自身标题为准）
 * - 链接正则只认 `[文本](目标)`：带 title 的 `[a](t.md#a "t")`、引用式 `[a][r]`、
 *   裸 `<a href="#a">`、站点绝对 `/x.md#a`、带 query `t.md?x=1#a`、百分号编码路径
 *   都不进比对（这类形态在本仓库文档面为零；若引入需扩展 LINK_RE 并补用例）
 * - 报错附建议目标：锚点的宽松形态唯一命中某个产物 id 时给出该 id
 */
export function checkAnchorIds(repoRoot) {
    const files = walkMdFiles(repoRoot, [], RUNTIME_EXCLUDED_PATHS, { includeDirs: ['archive'] })
    const errors = []
    const headingCache = new Map()

    const headingsOf = (file) => {
        if (!headingCache.has(file)) {
            headingCache.set(file, collectFileHeadings(file))
        }
        return headingCache.get(file)
    }

    for (const file of files) {
        const rel = relative(repoRoot, file)
        forEachProseLine(file, (line, lineNum) => {
            const clean = line.replace(/`[^`]*`/g, '')
            for (const m of clean.matchAll(LINK_RE)) {
                const target = m[2]
                if (!target || EXTERNAL_LINK_RE.test(target)) {
                    continue
                }
                const hashIndex = target.indexOf('#')
                if (hashIndex < 0 || hashIndex === target.length - 1) {
                    continue
                }
                const pathPart = target.slice(0, hashIndex)
                if (pathPart && !pathPart.endsWith('.md')) {
                    continue
                }
                const targetFile = pathPart ? resolve(dirname(file), pathPart) : file
                if (pathPart && (!existsSync(targetFile) || !statSync(targetFile).isFile())) {
                    continue // file-dead：归档豁免面（与 archive-anchors 同口径）
                }
                const anchor = target.slice(hashIndex + 1)
                const headings = headingsOf(targetFile)
                const decoded = decodeURIComponentSafe(anchor)
                if (headings.some((h) => h.id === decoded)) {
                    continue
                }
                const key = looseNorm(decoded)
                const suggestion = headings.filter((h) => looseNorm(h.id) === key)
                const hint = suggestion.length === 1 ? `（目标标题的产物 id 为 "#${suggestion[0].id}"）` : ''
                const where = relative(repoRoot, targetFile)
                errors.push(`${rel}:${lineNum} 锚点 "#${anchor}" 不是 ${where} 的产物 id 形态，站点上无法跳转${hint}`)
            }
        })
    }

    return { files, errors }
}

// ============================================================
// ============                CLI 入口                   =========
// ============================================================

const RULES = {
    links: { run: checkLinks, label: 'links' },
    'vue-interp': { run: checkVueInterp, label: 'vue-interp' },
    'link-text': { run: checkLinkText, label: 'link-text' },
    'link-syntax': { run: checkLinkSyntax, label: 'link-syntax' },
    emphasis: { run: checkEmphasis, label: 'emphasis' },
    'site-links': { run: checkSiteLinks, label: 'site-links' },
    'archive-anchors': { run: checkArchiveAnchors, label: 'archive-anchors' },
    'anchor-id': { run: checkAnchorIds, label: 'anchor-id' },
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
    // link-text / link-syntax / emphasis
    IMAGE_RE,
    HR_RE,
    TABLE_ROW_RE,
    HEADING_RE,
    LIST_ITEM_RE,
    STRAY_FRAGMENT_RE,
    CONFIG_LINK_RE,
    FRONTMATTER_LINK_RE,
}
