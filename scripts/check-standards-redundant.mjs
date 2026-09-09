/**
 * check-standards-redundant：扫描 docs/standards/ 下"为什么/教训/经验"类关键词。
 *
 * 设计原则：
 * - 规范文件应只写"做什么 / 不做什么"，不应混入"为什么 / 教训 / 经验"等
 *   长段实证内容（参照 [规范与文档治理设计 §3.1](../design/governance/spec-and-doc-governance.md)）
 * - 本脚本作为 G2 批次（standards 瘦身）的预扫描工具：定位需剥离位置，
 *   不自动修改
 * - 纯函数（scanFile / scanStandards）+ CLI 入口守卫（isDirectExecution）：
 *   vitest import 时不执行顶层副作用
 * - 错误格式 `path:line:col: keyword - snippet` 与 check-docs / check-links 一致
 *
 * 用法：
 *   node scripts/check-standards-redundant.mjs           # 报告模式（默认），exit 0
 *   node scripts/check-standards-redundant.mjs --strict  # 严格模式，任一命中 exit 1
 *
 * 例外（不视为违规）：
 * - fenced code block 内（教学示例可能含"教训"等关键词）
 * - 行内代码 `` `经验` `` 内（已通过 `inCode` 标志处理）
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const STANDARDS_DIR = join(REPO_ROOT, 'docs/standards')

/**
 * 关键词集合：标记"为什么/教训/经验"类内容。
 *
 * 注："沉淀"作为规范术语（"沉淀为 skill" / "经验沉淀"）误判率高，
 * 列为可选关键词（默认不扫）。命令可通过 `--include-sediment` 启用。
 */
export const DEFAULT_KEYWORDS = ['教训', '经验', '实证', '实战', '背景']
export const OPTIONAL_KEYWORDS = ['沉淀']

/**
 * 扫描单个 markdown 文件，返回命中清单（跳过 fenced code block）。
 * @param {string} file 绝对路径
 * @param {string[]} [keywords] 自定义关键词列表（默认 DEFAULT_KEYWORDS）
 * @returns {Array<{line: number, col: number, keyword: string, snippet: string}>}
 */
export function scanFile(file, keywords = DEFAULT_KEYWORDS) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    const hits = []
    let inCode = false
    lines.forEach((line, idx) => {
        if (/^\s*```/.test(line)) {
            inCode = !inCode
            return
        }
        if (inCode) {
            return
        }
        for (const kw of keywords) {
            const re = new RegExp(kw, 'g')
            let m
            while ((m = re.exec(line)) !== null) {
                const start = Math.max(0, m.index - 10)
                const end = Math.min(line.length, m.index + kw.length + 20)
                hits.push({
                    line: idx + 1,
                    col: m.index + 1,
                    keyword: kw,
                    snippet: line.slice(start, end).trim(),
                })
            }
        }
    })
    return hits
}

/**
 * 扫描整个 docs/standards/ 目录。
 * @param {string} repoRoot 仓库根绝对路径
 * @param {object} [options]
 * @param {boolean} [options.includeSediment] 是否包含"沉淀"关键词（默认 false）
 * @returns {Array<{file: string, hits: ReturnType<typeof scanFile>}>}
 */
export function scanStandards(repoRoot, options = {}) {
    const standardsDir = join(repoRoot, 'docs/standards')
    const keywords = options.includeSediment
        ? [...DEFAULT_KEYWORDS, ...OPTIONAL_KEYWORDS]
        : DEFAULT_KEYWORDS
    const files = readdirSync(standardsDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => join(standardsDir, f))
    const results = []
    for (const file of files) {
        const hits = scanFile(file, keywords)
        if (hits.length > 0) {
            results.push({ file: relative(repoRoot, file), hits })
        }
    }
    return results
}

/** CLI 入口守卫：vitest import 时不执行顶层副作用 */
const isDirectExecution = (() => {
    if (typeof process === 'undefined' || !process.argv[1]) {
        return false
    }
    try {
        return fileURLToPath(import.meta.url) === process.argv[1]
            || fileURLToPath(import.meta.url) === new URL(`file://${process.argv[1]}`).href
    } catch {
        return false
    }
})()

if (isDirectExecution) {
    const strict = process.argv.includes('--strict')
    const includeSediment = process.argv.includes('--include-sediment')
    const results = scanStandards(REPO_ROOT, { includeSediment })
    let total = 0
    for (const { file, hits } of results) {
        for (const hit of hits) {
            process.stderr.write(`${file}:${hit.line}:${hit.col}: ${hit.keyword} - ${hit.snippet}\n`)
        }
        total += hits.length
    }
    if (total === 0) {
        const kwMsg = includeSediment ? '（含"沉淀"）' : ''
        process.stdout.write(`[check-standards-redundant] 0 处命中${kwMsg}：docs/standards/ 规范文件无"教训/经验/实证/实战/背景"关键词\n`)
        process.exit(0)
    }
    const kwMsg = includeSediment ? '（含"沉淀"）' : ''
    process.stdout.write(`[check-standards-redundant] ${total} 处命中${kwMsg}（${results.length} 个文件）\n`)
    if (strict) {
        process.stderr.write('[check-standards-redundant] --strict 模式：任一命中即 exit 1\n')
        process.exit(1)
    }
    process.stdout.write('[check-standards-redundant] 默认模式：仅报告，不阻断（用 --strict 启用严格模式）\n')
    process.exit(0)
}
