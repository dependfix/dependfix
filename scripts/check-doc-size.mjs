/**
 * check-doc-size：按 `docs/standards/documentation.md §3` 的行数阈值表计量文档体量。
 *
 * 设计原则：
 * - **单一事实源**：阈值取自 `documentation.md §3` 的表格（唯一权威），脚本不硬编码阈值；
 *   表内新增行（如 standards 目录通配 / design 目录通配）即自动纳入计量。
 * - **阻断强度**：超「强制分片」阈值 → exit 1（阻断）；「warning 触发」带 → 仅报告不阻断；
 *   健康窗口 → 静默。
 * - **豁免机制**：历史存量超标且暂不拆分的文件以 `{ path, reason }` 显式登记（见 `SIZE_EXEMPTIONS`），
 *   禁止用「缩小计量面」代替豁免。
 * - 纯函数 + CLI 入口守卫（`isDirectExecution`）：vitest import 时不执行顶层副作用。
 * - 错误格式 `path:line:问题` 与 check-docs / check-orphan-ids 一致。
 *
 * 用法：
 *   node scripts/check-doc-size.mjs           # 默认：超强制分片阈值 exit 1
 *   node scripts/check-doc-size.mjs --json    # 机器可读输出
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDirectExecution } from './shared/cli.mjs'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const THRESHOLD_DOC = 'docs/standards/documentation.md'
const THRESHOLD_HEADING = '## 3. 文档行数阈值'

/** 遍历时需要跳过的目录（构建产物 / 依赖 / 忽略区）。 */
export const EXCLUDED_DIRS = new Set([
    'node_modules', '.git', '.nuxt', '.output', 'coverage', 'dist', 'temp', 'artifacts', '.session', '.opencode',
])

/**
 * 存量超标豁免（**必须**给出理由；新增条目需在 review 阶段核验必要性）。
 * 计量面不为豁免让路：豁免只是「本期不阻断」，不改变其超标事实。
 * @type {Array<{path: string, reason: string}>}
 */
export const SIZE_EXEMPTIONS = [
    {
        path: 'docs/design/governance/caomei-ui-migration.md',
        reason: '阈值入表时的存量超标（> 强制分片线）；拆分属独立内容治理批次（入链面广且 §15 迁移实证需保序），待该批次落地后移除此条',
    },
]

/** 从 `documentation.md §3` 解析阈值表。 */
export function parseThresholdTable(markdown) {
    const lines = markdown.split(/\r?\n/)
    const start = lines.findIndex((l) => l.trim().startsWith(THRESHOLD_HEADING))
    if (start === -1) {
        throw new Error(`未找到阈值表标题：${THRESHOLD_HEADING}`)
    }
    const rows = []
    for (let i = start + 1; i < lines.length; i += 1) {
        const line = lines[i]
        if (line.startsWith('## ')) {
            break
        }
        if (!line.trim().startsWith('|')) {
            continue
        }
        const cells = line.split('|').slice(1, -1).map((c) => c.trim())
        if (cells.length < 4 || /^:?-+:?$/.test(cells[1])) {
            continue
        }
        // 文档列可能带类型括注（如 `docs/standards/*.md`（规范））→ 去掉括注后取路径
        const doc = cells[0].replace(/`/g, '').replace(/[（(][^）)]*[）)]\s*$/, '').trim()
        if (!doc || doc === '文档' || doc === '文档类型') {
            continue
        }
        // 健康窗口 `<= 300 行` → warning 阈值 300；warning 触发 `301-400` → split 阈值 400
        rows.push({
            doc,
            warning: pickNumber(cells[1]),
            split: pickNumber(cells[2]),
        })
    }
    if (rows.length === 0) {
        throw new Error(`阈值表解析为空：${THRESHOLD_DOC} §3`)
    }
    return rows
}

/** 从 `<= 300 行` / `301-400` / `> 400 行` 提取阈值数字。 */
function pickNumber(cell) {
    const nums = cell.match(/\d+/g)
    return nums ? Number(nums[nums.length - 1]) : null
}

/** 递归收集仓库内 md 文件（相对路径，posix 分隔符）。 */
export function collectDocFiles(root) {
    const out = []
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (EXCLUDED_DIRS.has(entry.name)) {
                    continue
                }
                walk(join(dir, entry.name))
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                out.push(relative(root, join(dir, entry.name)).split(sep).join('/'))
            }
        }
    }
    walk(root)
    return out
}

/** 极简 glob → RegExp（支持 `**` / `*` / `?`），避免依赖 `path.matchesGlob` 的 Node 版本面。 */
export function globToRegExp(pattern) {
    let re = ''
    for (let i = 0; i < pattern.length; i += 1) {
        const c = pattern[i]
        if (c === '*' && pattern[i + 1] === '*') {
            re += '[^]*'
            i += 1
        } else if (c === '*') {
            re += '[^/]*'
        } else if (c === '?') {
            re += '[^/]'
        } else {
            re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
        }
    }
    return new RegExp(`^${re}$`)
}

/** 把阈值表的一行解析为待计量文件相对路径列表（plain 名称按 basename 匹配，含 `/` 或 `*` 视作 glob）。 */
export function resolveTargets(docPattern, files) {
    if (docPattern.includes('/') || docPattern.includes('*')) {
        const re = globToRegExp(docPattern)
        return files.filter((f) => re.test(f))
    }
    const base = `${docPattern.replace(/\.md$/, '')}.md`
    const hits = files.filter((f) => f.split('/').pop() === base)
    // plain 名称优先解析到仓库根同名文件（避免 README 等通用名误命中子目录同名文档）
    const atRoot = hits.find((f) => !f.includes('/'))
    return atRoot ? [atRoot] : hits
}

/** 统计文件行数。 */
export function countLines(root, rel) {
    const content = readFileSync(join(root, rel), 'utf8')
    return content.length === 0 ? 0 : content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0)
}

/**
 * 计量全部声明文档，返回结果清单（不抛错，由调用方决定退出码）。
 * @param {string} root 仓库根
 * @param {Array<{path: string, reason: string}>} exemptions
 */
export function checkDocSize(root = REPO_ROOT, exemptions = SIZE_EXEMPTIONS) {
    const rows = parseThresholdTable(readFileSync(join(root, THRESHOLD_DOC), 'utf8'))
    const files = collectDocFiles(root)
    const exemptPaths = new Set(exemptions.map((e) => e.path))
    const results = []
    for (const row of rows) {
        const targets = resolveTargets(row.doc, files)
        if (targets.length === 0) {
            results.push({ doc: row.doc, path: null, lines: null, verdict: 'missing-row-target' })
            continue
        }
        for (const rel of targets) {
            const lines = countLines(root, rel)
            let verdict = 'healthy'
            if (row.split !== null && lines > row.split) {
                verdict = exemptPaths.has(rel) ? 'exempt' : 'over-split'
            } else if (row.warning !== null && lines > row.warning) {
                verdict = 'warning'
            }
            results.push({ doc: row.doc, path: rel, lines, verdict, warning: row.warning, split: row.split })
        }
    }
    return results
}

/** 格式化人类可读报告。 */
export function formatReport(results) {
    const over = results.filter((r) => r.verdict === 'over-split')
    const warn = results.filter((r) => r.verdict === 'warning')
    const missing = results.filter((r) => r.verdict === 'missing-row-target')
    const out = []
    for (const r of warn) {
        out.push(`[check-doc-size] warning: ${r.path}:${r.lines}: 超出 warning 带（>${r.warning}）`)
    }
    for (const r of missing) {
        out.push(`[check-doc-size] error: 阈值表行「${r.doc}」未匹配到任何 md 文件`)
    }
    for (const r of over) {
        out.push(`[check-doc-size] error: ${r.path}:${r.lines}: 超强制分片阈值（>${r.split}），须拆分到 archive/ 分片`)
    }
    const exempt = results.filter((r) => r.verdict === 'exempt')
    for (const r of exempt) {
        out.push(`[check-doc-size] 豁免（存量超标，理由见脚本内豁免表）: ${r.path}:${r.lines}`)
    }
    out.push(
        `[check-doc-size] 计量 ${results.length} 个文档：健康 ${results.length - warn.length - over.length - missing.length - exempt.length}`
        + ` / warning ${warn.length} / 豁免 ${exempt.length} / 超阈值 ${over.length} / 未匹配 ${missing.length}`,
    )
    return out.join('\n')
}

if (isDirectExecution(import.meta.url)) {
    const json = process.argv.includes('--json')
    let results
    try {
        results = checkDocSize()
    } catch (error) {
        process.stderr.write(`[check-doc-size] ${error.message}\n`)
        process.exit(1)
    }
    if (json) {
        process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
    } else {
        process.stdout.write(`${formatReport(results)}\n`)
    }
    const blocking = results.filter((r) => r.verdict === 'over-split' || r.verdict === 'missing-row-target')
    if (blocking.length > 0) {
        process.exit(1)
    }
    process.exit(0)
}
