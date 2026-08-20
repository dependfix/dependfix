/**
 * 检查仓库内所有 .md 文件的本地链接：
 * 1. 相对路径指向的文件必须存在；
 * 2. 锚点（#xxx）必须对应目标文件中的某个标题——按"宽松规范化"比较
 *    （小写 + 移除标点/符号（含 emoji）/空白），兼容 GitHub / VS Code / VitePress
 *    三种 slug 规则差异，只抓真实断链与假锚点。
 * 3. 拒绝本地绝对路径（POSIX `/xxx` 或 Windows `C:/xxx` / `\\server`）；
 * 4. 拒绝路径穿越（`../..` 解析结果超出仓库根目录）。
 * 5. 拒绝指向被 .gitignore 排除的路径（本地可能存在，CI 必不存在 → 与存在性检查
 *    二选一会被本地侥幸通过；教训见 [经验归档 §三十](../design/governance/experience-archive.md)
 *    复现链：todo-archive.md 历史教训段 [wisdom.md](../../.session/wisdom.md) 链接
 *    本地 .session/wisdom.md 存在 → check-links OK，CI 无该文件 → 红；本质同
 *    §二十七/§二十八/§三十九 "本地通过 ≠ CI 通过" 同族问题）。
 * 6. 正文文本（含行内代码，跳过 fenced code block）中拒绝个人机器路径
 *    （Windows 盘符 `C:\xxx` / `C:/xxx`、UNC `\\server\share`）——仅高特征模式，
 *    不扫描 POSIX `/xxx` 概念路径（`/etc`、`/tmp` 等教学示例普遍，易误报）。
 *
 * 说明：
 * - 跨平台锚点 slug 规则不一致（GitHub 移除全角标点，VS Code / VitePress 保留，
 *   且对 `.` 等字符转 '-' 的策略也不同），因此不做精确 slug 匹配；
 * - 含全角标点的标题锚点在部分平台仍可能失效，由文档规范约束（标题避免全角标点）。
 * - git 忽略检查使用 `git check-ignore` 而非手写 .gitignore 解析：复用 git 自身
 *   的 .gitignore 语义（嵌套 .gitignore、! 否定、** 通配），避免自实现规则子集。
 *   非 git 仓库内调用（test tmpdir）静默跳过，行为退化为仅做存在性检查。
 * - 用法：node scripts/check-links.mjs（或 pnpm check:links）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
// 排除标准：本地存在但 CI 不存在（gitignored）/ 不产出文档的目录（构建产物 / 缓存 / 第三方）。
// 关键：artifacts/（review-gate 审计产物，gitignored）若不被排除，
// 本地 check-links 会扫到审计侧文档中的 gitignored 路径引用 → 误报，
// 与"本地通过 ≠ CI 通过"对称：本目录 CI 不在 → 本地也不该扫。
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.vitepress', 'dist', 'archive', '.agents', '.claude', 'artifacts'])
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g
// 本地绝对路径：POSIX（/xxx）、Windows 盘符（C:/xxx / C:\xxx）、UNC（\\server）
const ABS_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/
// 正文中的个人机器路径（高特征）：Windows 盘符 + 分隔符、UNC 双反斜杠前缀；
// 盘符分支加字母负向断言，排除 URL scheme 末尾（https:// 的 s:/）被误判为盘符；
// 排除空白/括号/引号/反引号/中文标点等路径边界字符，避免把相邻文本一并吞入
const BODY_ABS_PATH_RE = /(?<![a-zA-Z])(?:[a-zA-Z]:[\\/][^\s`)'"，。；：！？、`]+|\\\\[^\s`)'"，。；：！？、`]+)/g

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
export function looseNorm(str) {
    return str.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

// 提取文件的标题集合（跳过 fenced code block），返回宽松规范化后的形式
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

// 锚点规范化：兼容原文与 URL 编码两种写法
export function normAnchor(anchor) {
    try {
        return looseNorm(decodeURIComponent(anchor))
    } catch {
        return looseNorm(anchor)
    }
}

/**
 * 判断绝对路径是否被 .gitignore 排除（CI 中不存在）。
 * 用 `git check-ignore` 而非手写 .gitignore 解析：复用 git 自身语义
 * （嵌套 .gitignore、! 否定、** 通配），避免自实现规则子集。
 * 路径无需存在——gitignore 按字符串模式匹配，不依赖文件系统状态。
 * 必须在 `gitRoot` 工作目录下调用：git 沿 cwd 向上找 .git 目录，
 * 否则会用调用进程所在仓库的 .gitignore 评估目标路径，得出错误结论。
 * 非 git 仓库内调用（git 命令失败）静默返回 false，调用方应先探测再决定是否检查。
 * @param {string} absPath
 * @param {string} gitRoot
 * @returns {boolean}
 */
export function isGitIgnored(absPath, gitRoot) {
    try {
        execFileSync('git', ['check-ignore', '--quiet', '--', absPath], { cwd: gitRoot, stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

/**
 * 判断目录是否在 git 工作树内。checkLinks 调用 git 忽略检查前必须先探测，
 * 避免对 test tmpdir 等非 git 仓库环境抛错。
 * @param {string} dir
 * @returns {boolean}
 */
export function isInsideGitWorkTree(dir) {
    try {
        execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

/**
 * 检查仓库根目录下所有 .md 文件的本地链接，返回 { files, errors }。
 * 主流程提取为纯函数（依赖 node:fs 真实操作，供 CLI 与测试共用）：
 * 相对路径存在性、锚点匹配、本地绝对路径拒绝、路径穿越拒绝、git 忽略路径拒绝、
 * 正文个人机器路径拒绝。
 */
export function checkLinks(repoRoot) {
    const files = walk(repoRoot)
    const errors = []
    // 非 git 仓库（test tmpdir）静默跳过 git 忽略检查，避免对纯函数测试环境强依赖 git
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
            const rel = file === repoRoot ? '' : file.slice(repoRoot.length)
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

                // 本地绝对路径拒绝：md 中的本地链接必须使用相对路径
                // （绝对路径随仓库迁移/平台差异失效，且可能指向项目外文件）
                if (ABS_PATH_RE.test(pathPart)) {
                    errors.push(`${rel}:${idx + 1} 链接目标为本地绝对路径，应使用相对路径: ${pathPart}`)
                    return
                }

                const targetFile = resolve(dirname(file), pathPart)

                // 路径穿越拒绝：解析结果不得超出仓库根目录
                // （relative 返回 `..` 开头或跨盘绝对路径均表示越界；
                // 精确匹配 `..` + 分隔符，避免误伤 `..hidden` 类目录名）
                const relTarget = relative(repoRoot, targetFile)
                const sep = relTarget.includes('\\') ? '\\' : '/'
                if (relTarget === '..' || relTarget.startsWith(`..${sep}`) || isAbsolute(relTarget)) {
                    errors.push(`${rel}:${idx + 1} 链接目标超出项目范围（路径穿越）: ${pathPart}`)
                    return
                }

                // git 忽略检查必须在 existsSync 之前：CI 中目标文件不存在时也能给出根因错误
                // （不只是"链接目标不存在"，而是说清楚"被 .gitignore 排除，CI 必缺失"）；
                // 同时也能拦截"本地存在、CI 不存在"的侥幸通过场景（§三十 同族问题）
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

            // 正文个人机器路径拒绝：扫描原始行（含行内代码），跳过 fenced code block
            // （上方已处理）；先移除链接语法部分，避免与链接绝对路径检查重复报错
            const linkless = line.replace(LINK_RE, '')
            for (const m of linkless.matchAll(BODY_ABS_PATH_RE)) {
                errors.push(`${rel}:${idx + 1} 正文包含本地绝对路径（个人机器路径），应使用项目相对路径或 <repo-root>/ 占位符: ${m[0]}`)
            }
        })
    }

    return { files, errors }
}

// CLI 入口守卫：vitest import 时不执行顶层副作用，避免 process.exit 被 vitest 4 拦截
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { files, errors } = checkLinks(repoRoot)

    if (errors.length > 0) {
        console.error(`[check-links] ${errors.length} 个链接问题:`)
        for (const e of errors) {
            console.error(`  - ${e}`)
        }
        process.exit(1)
    }
    console.log(`[check-links] OK：${files.length} 个 md 文件的本地链接全部有效`)
}
