/**
 * Markdown 文件扫描与 Git 感知共享工具，供 check-docs 统一入口及其他
 * 文档规范脚本（i18n audit、heading 检查、frontmatter 校验等未来扩展）共用。
 *
 * 设计原则：
 * - 纯函数（依赖 node:fs / node:child_process），可被 CLI 与 vitest 共用
 * - 排除集合覆盖构建产物（dist / .vitepress）、缓存（.git / node_modules）、
 *   仓库外符号链接（archive / .agents / .claude）、gitignored 审计产物
 *   （artifacts/）。artifacts/ 关键：review-gate 报告若被扫描，本地存在的
 *   gitignored 路径引用会误导本地通过而 CI 失败（与"本地通过 ≠ CI 通过"对称）
 * - git 检查使用 `git check-ignore` 而非手写 .gitignore 解析：复用 git 自身
 *   语义（嵌套 .gitignore、! 否定、** 通配），与 .gitignore 标准同步
 * - 非 git 仓库内调用（test tmpdir）静默降级，调用方应先探测再决定
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 仓库扫描排除集合：构建产物、缓存、gitignored 审计产物。
 *
 * 决策说明：
 * - `archive` 入仓：docs/plan/archive/ 等归档分片是入仓的（commit
 *   a2d9890 / 6ae9557 等），VitePress 默认扫描 docs/ 下所有 .md 会编译它们。
 *   **当前豁免**（与原 check-links.mjs 行为一致）的原因：归档动作会让历史
 *   文档中的相对链接（如 [roadmap.md]）指向错误位置——这些是归档过程
 *   引入的预期行为，不应让链接检查在归档批次每次触发红 CI。已知问题：
 *   docs/plan/archive/ 下含 ~98 处失效相对链接（roadmap.md / todo.md /
 *   todo-archive-phases-m0-m1.md / ../design/governance/*.md 等）+ 2 处失效
 *   自锚点（m6-m7 分片引用的 M10 段已迁出至 m10 分片），统一扫描会立即暴露；
 *   修复属独立批次。2026-09-21 规划文档归档批次已修复 archive/index.md 与
 *   各分片的 anchor / gh-slug 失配（anchor-dead=0 / gh-slug=0），剩余 file-dead
 *   为既有路径前缀问题。
 *   决策：维持历史豁免 + 注释登记；待独立 fix 批次统一处理。
 * - `.agents` / `.claude`：opencode / claude code 的 agent 定义目录，
 *   不进 VitePress 编译且非文档，豁免。
 * - `artifacts`：review-gate 审计产物（gitignored），若被扫描，本地存在的
 *   gitignored 路径引用会被误认为"合法"，CI 必缺失（与"本地通过 ≠ CI 通过"
 *   对称）。豁免。
 */
export const MD_EXCLUDED_DIRS = new Set([
    'node_modules',
    '.git',
    '.vitepress',
    'dist',
    'archive',
    '.agents',
    '.claude',
    '.session',
    'artifacts',
])

/**
 * 递归扫描目录下所有 .md 文件（不含 EXCLUDED_DIRS 内目录）。
 *
 * `excludedPaths` 是**相对遍历起点**的目录前缀（POSIX 分隔符），用于精确定位那些
 * 不能用目录名概括的运行时目录（gitignored）：按名排除（如 `data`）会误伤同名正常目录，
 * 而按路径前缀只跳过目标目录。命中在**下降前剪枝**——运行时目录下可能有成千上万个
 * 克隆 / 产物文件，遍历后再过滤的代价不可接受。
 *
 * @param {string} dir 起始目录（绝对路径）
 * @param {string[]} [out] 累积输出，供递归调用
 * @param {string[]} [excludedPaths] 相对遍历起点的排除目录前缀（POSIX）
 * @returns {string[]} .md 文件绝对路径数组
 */
export function walkMdFiles(dir, out = [], excludedPaths = []) {
    return walkDir(dir, dir, out, excludedPaths)
}

function walkDir(baseDir, dir, out, excludedPaths) {
    for (const entry of readdirSync(dir)) {
        if (MD_EXCLUDED_DIRS.has(entry)) {
            continue
        }
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (isExcludedPath(baseDir, full, excludedPaths)) {
                continue
            }
            walkDir(baseDir, full, out, excludedPaths)
        } else if (entry.endsWith('.md')) {
            out.push(full)
        }
    }
    return out
}

/**
 * 判断目录是否命中「相对遍历起点的路径前缀」排除项。
 *
 * 只做**精确匹配**即可：命中目录在下降前就被剪枝，其子目录不会被访问；
 * 因此 `startsWith(prefix + '/')` 这类兜底分支实际不可达（不宜保留死代码）。
 * @param {string} baseDir 遍历起点（绝对路径）
 * @param {string} absPath 待判目录（绝对路径）
 * @param {string[]} excludedPaths 排除前缀（POSIX）
 * @returns {boolean}
 */
function isExcludedPath(baseDir, absPath, excludedPaths) {
    if (excludedPaths.length === 0) {
        return false
    }
    const rel = relative(baseDir, absPath).split(sep).join('/')
    return excludedPaths.includes(rel)
}

/**
 * 判断目录是否在 git 工作树内。调用 git 忽略检查前必须先探测，
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
 * 判断绝对路径是否被 .gitignore 排除（CI 中不存在）。
 * 用 `git check-ignore` 而非手写 .gitignore 解析：复用 git 自身语义。
 * 路径无需存在——gitignore 按字符串模式匹配，不依赖文件系统状态。
 * 必须在 `gitRoot` 工作目录下调用：git 沿 cwd 向上找 .git 目录，
 * 否则会用调用进程所在仓库的 .gitignore 评估目标路径，得出错误结论。
 * 非 git 仓库内调用（git 命令失败）静默返回 false。
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
 * 仓库根路径常量：scripts/shared/*.mjs 在仓库的 scripts/shared/ 下，
 * 上两级（../..）即仓库根。注意：本常量使用模块自身的 import.meta.url，
 * 不接受 caller 传入——caller 的 url 可能指向测试运行入口等任意位置，
 * 错传会导致路径错位（如曾误指向 `/root/`）。caller 直接 import 即可。
 */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
