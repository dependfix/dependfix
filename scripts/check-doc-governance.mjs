/**
 * check-doc-governance：文档治理的结构与密度机检。
 *
 * 设计原则：
 * - **阈值单一事实源**：字符预算与规则条数预算取自
 *   `docs/design/governance/doc-governance.md §4.2` 的表格，脚本不硬编码阈值；
 *   行数阈值仍由 `check-doc-size` 按 `documentation.md §3` 计量。
 * - **两类阻断**：预算进入「阻断」列、归档索引不满足结构不变量 → exit 1；
 *   字符进入「健康→阻断」带、文档 freshness 超期 → 仅报告（warning）。
 * - **可单测**：解析、计量、归档校验均为纯函数；CLI 入口用 `isDirectExecution` 守卫。
 * - 错误格式 `path:line: message` 与 check-docs / check-doc-size / check-orphan-ids 一致。
 *
 * 用法：
 *   node scripts/check-doc-governance.mjs           # 报告 + 阻断项 exit 1
 *   node scripts/check-doc-governance.mjs --json    # 机器可读输出
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globToRegExp } from './check-doc-size.mjs'
import { isDirectExecution } from './shared/cli.mjs'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')
export const BUDGET_DOC = 'docs/design/governance/doc-governance.md'
export const BUDGET_HEADING = '### 4.2 字符与密度预算'
export const ARCHIVE_INDEX = 'docs/plan/archive/index.md'
export const TODO_ARCHIVE = 'docs/plan/todo-archive.md'
export const ARCHIVE_LOG = 'docs/plan/archive/archive-log.md'
export const PHASE_FILE_PATTERN = /^todo-archive-phases-.*\.md$/
const FRESHNESS_SCOPES = ['docs/standards/*.md', 'docs/guide/*.md']

/** `主约束` 允许取值（文档约定，用于校验预算表不被写错）。 */
const PRIMARY_CONSTRAINTS = ['字符', '行数', '两者']

/** 遍历时跳过的目录。 */
export const EXCLUDED_DIRS = new Set([
    'node_modules', '.git', '.nuxt', '.output', 'coverage', 'dist', 'temp', 'artifacts', '.session', '.opencode',
])

/** 解析 `| 文档 | 健康字符 | 阻断字符 | 说明 |` 与规则条数表。 */
export function parseBudgetTables(markdown) {
    const lines = markdown.split(/\r?\n/)
    const start = lines.findIndex((line) => line.trim() === BUDGET_HEADING)
    if (start === -1) {
        throw new Error(`未找到预算标题：${BUDGET_HEADING}`)
    }
    const charBudgets = []
    const sectionBudgets = []
    let current = null
    /** 字符预算表表头 → 列下标（按列名取值，允许列顺序调整）。 */
    let charHeader = null
    for (let i = start + 1; i < lines.length; i += 1) {
        const line = lines[i]
        if (/^#{2,4} /.test(line) && !line.trim().startsWith('####')) {
            break
        }
        if (!line.trim().startsWith('|')) {
            current = null
            continue
        }
        const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
        if (cells.length < 3 || /^:?-+:?$/.test(cells[1])) {
            continue
        }
        if (cells.includes('健康字符')) {
            current = 'char'
            charHeader = Object.fromEntries(cells.map((cell, index) => [cell, index]))
            continue
        }
        if (cells.includes('健康条数')) {
            current = 'section'
            continue
        }
        if (current === 'char') {
            const header = charHeader ?? {}
            const pick = (name) => {
                const matched = Object.keys(header).find((key) => key === name || key.startsWith(name))
                return matched === undefined ? null : (cells[header[matched]] ?? null)
            }
            const densityKey = Object.keys(charHeader ?? {}).find((key) => key.startsWith('密度'))
            const pattern = stripCode(pick('文档') ?? cells[0] ?? '')
            if (!pattern) {
                continue
            }
            const primary = stripCode(pick('主约束') ?? '两者') || '两者'
            if (!PRIMARY_CONSTRAINTS.includes(primary)) {
                throw new Error(`预算表「主约束」取值非法: ${primary}（允许 ${PRIMARY_CONSTRAINTS.join(' / ')}）`)
            }
            charBudgets.push({
                pattern,
                primary,
                healthy: toNumber(pick('健康字符') ?? ''),
                block: toNumber(pick('阻断字符') ?? ''),
                density: parseDensityBand(densityKey ? cells[charHeader[densityKey]] : null),
            })
        } else if (current === 'section') {
            sectionBudgets.push({
                file: stripCode(cells[0]),
                section: cells[1],
                healthy: toNumber(cells[2]),
                block: toNumber(cells[3]),
                maxEntryChars: toNumber(cells[4]),
            })
        }
    }
    if (charBudgets.length === 0 || sectionBudgets.length === 0) {
        throw new Error(`预算表解析为空：${BUDGET_DOC} ${BUDGET_HEADING}`)
    }
    return { charBudgets, sectionBudgets }
}

/** 批次流水账的常见形态：bullet 日期项 / 表格日期行 / 日期段落。 */
export function hasBatchNarrative(markdown) {
    return /^\s*(?:[-*]\s*\*\*|\|\s*)20\d{2}-\d{2}-\d{2}/m.test(markdown)
        || /^\s*20\d{2}-\d{2}-\d{2}\s+.*(?:归档|批次)/m.test(markdown)
}

/** 从 doc-governance §4.4 解析 freshness 阈值（天数）。 */
export function parseFreshnessDays(markdown) {
    const match = markdown.match(/超过\s*\*\*(\d+)\s*天\*\*/)
    if (!match) {
        throw new Error('未找到 freshness 阈值（doc-governance §4.4「超过 **N 天**」）')
    }
    return Number(match[1])
}

/** 去掉反引号与首尾空白。 */
function stripCode(value) {
    return value.replace(/`/g, '').trim()
}

/** `24,000` → 24000；`—` → null。 */
function toNumber(value) {
    const nums = String(value).replace(/,/g, '').match(/\d+/g)
    return nums ? Number(nums[nums.length - 1]) : null
}

/**
 * 解析密度上限（`字符 / 非空行`）：`200` → `{ max: 200 }`；`—` 或空 → null（不检查）。
 * 只设上限：清单 / 表格密集文档天然行短，设下限只会产生噪声。
 * 密度只做 warning（段落未换行 / 单行过长），不参与阻断判定。
 */
export function parseDensityBand(value) {
    if (value === null || value === undefined) {
        return null
    }
    const numbers = String(value).replace(/,/g, '').match(/\d+/g)
    return numbers ? { max: Number(numbers[numbers.length - 1]) } : null
}

/** 递归收集 md 文件（posix 相对路径）。 */
export function collectMarkdownFiles(root) {
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

/** 解析 glob 或精确路径到文件列表。 */
export function resolveBudgetTargets(pattern, files) {
    if (!pattern.includes('*')) {
        return files.filter((file) => file === pattern)
    }
    const re = globToRegExp(pattern)
    return files.filter((file) => re.test(file))
}

/** 统计字符数（UTF-16 长度，与编辑口径一致）。 */
export function countChars(content) {
    return content.length
}

/** 计量字符预算，返回结果清单。 */
export function checkCharBudgets(root, budgets, files = collectMarkdownFiles(root)) {
    const results = []
    for (const budget of budgets) {
        const targets = resolveBudgetTargets(budget.pattern, files)
        if (targets.length === 0) {
            results.push({ ...budget, path: null, chars: null, verdict: 'missing-row-target' })
            continue
        }
        for (const path of targets) {
            const content = readFileSync(join(root, path), 'utf8')
            const chars = countChars(content)
            const nonEmptyLines = content.split(/\r?\n/).filter((line) => line.trim()).length
            let verdict = 'healthy'
            if (budget.block !== null && chars > budget.block) {
                verdict = 'block'
            } else if (budget.healthy !== null && chars > budget.healthy) {
                verdict = 'warning'
            }
            const ratio = nonEmptyLines > 0 ? chars / nonEmptyLines : null
            const densityVerdict = budget.density && ratio !== null && ratio > budget.density.max ? 'high' : null
            results.push({ ...budget, path, chars, nonEmptyLines, ratio, densityVerdict, verdict })
        }
    }
    return results
}

/**
 * 定位章节（按标题包含匹配，取第一个 `##` / `###` / `####` 标题）。
 * @returns {{content: string, startLine: number} | null}
 */
export function extractSection(markdown, sectionTitle) {
    const lines = markdown.split(/\r?\n/)
    const start = lines.findIndex((line) => /^#{2,4} /.test(line) && line.includes(sectionTitle))
    if (start === -1) {
        return null
    }
    let end = lines.length
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^#{2,4} /.test(lines[i])) {
            end = i
            break
        }
    }
    return { content: lines.slice(start, end).join('\n'), startLine: start + 1 }
}

/** 计量规则表的条数与单条最大字符。 */
export function measureRuleTable(sectionMarkdown) {
    const rows = sectionMarkdown.split(/\r?\n/).filter((line) => line.trim().startsWith('|'))
    const dataRows = rows.filter((line) => {
        const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
        return cells.length >= 2 && !/^:?-+:?$/.test(cells[0]) && cells[0] !== 'ID' && cells[0] !== '编号'
    })
    const entryLengths = dataRows.map((line) => {
        const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
        return cells[1] ? cells[1].length : 0
    })
    return {
        count: dataRows.length,
        maxEntryChars: entryLengths.length > 0 ? Math.max(...entryLengths) : 0,
    }
}

/** 校验规则条数预算。 */
export function checkSectionBudgets(root, budgets) {
    const results = []
    for (const budget of budgets) {
        const filePath = join(root, budget.file)
        let content
        try {
            content = readFileSync(filePath, 'utf8')
        } catch {
            results.push({ ...budget, verdict: 'missing-file' })
            continue
        }
        const section = extractSection(content, budget.section)
        if (!section) {
            results.push({ ...budget, verdict: 'missing-section' })
            continue
        }
        const measured = measureRuleTable(section.content)
        let verdict = 'healthy'
        if (budget.block !== null && measured.count > budget.block) {
            verdict = 'block'
        } else if (budget.healthy !== null && measured.count > budget.healthy) {
            verdict = 'warning'
        }
        if (budget.maxEntryChars !== null && measured.maxEntryChars > budget.maxEntryChars) {
            verdict = verdict === 'block' ? 'block' : 'warning'
        }
        results.push({ ...budget, ...measured, verdict })
    }
    return results
}

/** 合并分片的阶段号覆盖（文件名里的 m55 / m711 不是数值排序键）。 */
export const PHASE_SORT_OVERRIDES = {
    'todo-archive-phases-m0-m1.md': 1,
    'todo-archive-phases-m2-m55.md': 5.5,
    'todo-archive-phases-m6-m7-t711.md': 7.5,
    'todo-archive-phases-m10-c53-c59c61.md': 10,
    'todo-archive-phases-m14-m15.md': 15,
    'todo-archive-phases-m16-m17.md': 17,
    'todo-archive-phases-m19-m21.md': 21,
    'todo-archive-phases-m39-m40.md': 40,
}

/** 从分片文件名提取最大阶段号；无法提取返回 null。 */
export function extractPhaseNumber(filename) {
    if (filename in PHASE_SORT_OVERRIDES) {
        return PHASE_SORT_OVERRIDES[filename]
    }
    const matches = [...filename.matchAll(/m(\d+)/g)].map((match) => Number(match[1]))
    return matches.length > 0 ? Math.max(...matches) : null
}

/**
 * 解析归档索引表。返回 `{ rows, errors }`；row 含 phase/topic/file。
 * 期望表头：| 阶段 | 主题 | 归档文件 | 归档日期 |
 */
export function parseArchiveIndex(markdown) {
    const errors = []
    const section = extractSection(markdown, '阶段索引')
    if (!section) {
        return { rows: [], errors: ['未找到「阶段索引」章节'] }
    }
    const lines = section.content.split(/\r?\n/)
    const headerIndex = lines.findIndex((line) => line.trim().startsWith('|') && line.includes('归档文件'))
    if (headerIndex === -1) {
        return { rows: [], errors: ['「阶段索引」缺少表头（需含「归档文件」列）'] }
    }
    const rows = []
    for (let i = headerIndex + 1; i < lines.length; i += 1) {
        const line = lines[i]
        if (!line.trim().startsWith('|')) {
            break
        }
        const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
        if (cells.length < 3 || /^:?-+:?$/.test(cells[0])) {
            continue
        }
        const link = cells[2].match(/\[[^\]]*\]\(([^)]+)\)/)
        if (!link) {
            errors.push(`索引行缺少归档文件链接：${line.slice(0, 80)}`)
            continue
        }
        rows.push({
            phase: cells[0],
            topic: cells[1],
            file: link[1].split('#')[0],
            raw: line,
        })
    }
    return { rows, errors }
}

/**
 * 校验归档索引结构不变量。
 * @param {string} todoArchiveMarkdown
 * @param {string[]} archiveFiles `docs/plan/archive/` 下的文件名
 * @param {(relativePath: string) => string} readFile 读取器（用于检查分片标题）
 */
export function validateArchiveIndex(todoArchiveMarkdown, archiveFiles, readFile) {
    const errors = []
    const { rows, errors: parseErrors } = parseArchiveIndex(todoArchiveMarkdown)
    errors.push(...parseErrors)
    if (/^#{1,2} M\d+/m.test(todoArchiveMarkdown)) {
        errors.push('todo-archive.md 出现阶段正文标题（只允许索引；正文须在 archive/ 分片）')
    }
    if (hasBatchNarrative(todoArchiveMarkdown)) {
        errors.push('todo-archive.md 出现批次流水账（应只保留索引；批次记录写入 archive-log.md）')
    }
    const referenced = new Map()
    let previousPhase = Number.POSITIVE_INFINITY
    for (const row of rows) {
        const basename = row.file.split('/').pop()
        if (!archiveFiles.includes(basename)) {
            errors.push(`索引指向不存在的归档分片：${row.file}`)
            continue
        }
        if (referenced.has(basename)) {
            errors.push(`归档分片重复索引：${basename}`)
        }
        referenced.set(basename, row)
        const phase = extractPhaseNumber(basename)
        if (phase !== null) {
            if (phase > previousPhase) {
                errors.push(`索引顺序错误：${basename}（M${phase}）排在 M${previousPhase} 之后，应倒序`)
            }
            previousPhase = phase
        }
        const content = readFile(`docs/plan/archive/${basename}`)
        if (!/^#{1,2} M\d+/m.test(content)) {
            errors.push(`归档分片缺少阶段正文标题：${basename}`)
        }
    }
    for (const basename of archiveFiles) {
        if (!referenced.has(basename)) {
            errors.push(`归档分片未登记到索引：${basename}`)
        }
    }
    return { errors, referencedCount: referenced.size, rowCount: rows.length }
}

/** 校验 archive/index.md 不承载阶段正文，并指向批次日志。 */
export function validateArchiveGovernance(markdown) {
    const errors = []
    if (/^## M\d+/m.test(markdown)) {
        errors.push('archive/index.md 出现阶段正文标题（应只保留治理规则与基线）')
    }
    if (!markdown.includes('archive-log.md')) {
        errors.push('archive/index.md 未指向 archive-log.md（批次记录应集中在日志）')
    }
    if (hasBatchNarrative(markdown)) {
        errors.push('archive/index.md 出现批次流水账（应写入 archive-log.md）')
    }
    return errors
}

/** 通过 git 最近提交日期检查文档时效（仅 warning）。 */
export function checkFreshness(root, files, now = new Date(), freshnessDays = 180) {
    const results = []
    const scopes = FRESHNESS_SCOPES.map((pattern) => ({ pattern, re: globToRegExp(pattern) }))
    for (const file of files) {
        if (!scopes.some(({ re }) => re.test(file))) {
            continue
        }
        let dateText
        try {
            dateText = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
                cwd: root,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim()
        } catch {
            continue
        }
        if (!dateText) {
            continue
        }
        const days = Math.floor((now.getTime() - new Date(`${dateText}T00:00:00Z`).getTime()) / 86_400_000)
        if (days > freshnessDays) {
            results.push({ path: file, lastModified: dateText, days })
        }
    }
    return results.sort((a, b) => b.days - a.days)
}

/** 格式化人类可读报告。 */
export function formatReport({ charResults, sectionResults, archiveResult, governanceErrors, freshness }) {
    const out = []
    for (const result of charResults) {
        if (result.verdict === 'block') {
            out.push(`[check-doc-governance] error: ${result.path}:${result.chars} 字符，超阻断上限（>${result.block}）`)
        } else if (result.verdict === 'warning') {
            out.push(`[check-doc-governance] warning: ${result.path}:${result.chars} 字符，超健康上限（>${result.healthy}）`)
        } else if (result.verdict === 'missing-row-target') {
            out.push(`[check-doc-governance] error: 预算行「${result.pattern}」未匹配到任何 md 文件`)
        }
        if (result.densityVerdict) {
            out.push(`[check-doc-governance] warning: ${result.path}: 密度 ${Math.round(result.ratio)} 字符/非空行，超上限 ${result.density.max}（段落未换行 / 单行过长）`)
        }
    }
    for (const result of sectionResults) {
        const label = `${result.file} §${result.section}`
        if (result.verdict === 'block') {
            out.push(`[check-doc-governance] error: ${label}:${result.count} 条（上限 ${result.block}）/ 单条最长 ${result.maxEntryChars} 字符`)
        } else if (result.verdict === 'warning') {
            out.push(`[check-doc-governance] warning: ${label}:${result.count} 条（健康上限 ${result.healthy}）/ 单条最长 ${result.maxEntryChars} 字符`)
        } else if (result.verdict === 'missing-file' || result.verdict === 'missing-section') {
            out.push(`[check-doc-governance] error: ${label} 未找到（${result.verdict}）`)
        }
    }
    for (const error of [...archiveResult.errors, ...governanceErrors]) {
        out.push(`[check-doc-governance] error: ${error}`)
    }
    for (const item of freshness) {
        out.push(`[check-doc-governance] warning: ${item.path} 最近实质修改 ${item.lastModified}（${item.days} 天前），需事实核对`)
    }
    const blockCount = charResults.filter((r) => r.verdict === 'block' || r.verdict === 'missing-row-target').length
        + sectionResults.filter((r) => r.verdict !== 'healthy' && r.verdict !== 'warning').length
        + archiveResult.errors.length + governanceErrors.length
    const warnCount = charResults.filter((r) => r.verdict === 'warning').length
        + charResults.filter((r) => r.densityVerdict).length
        + sectionResults.filter((r) => r.verdict === 'warning').length
        + freshness.length
    out.push(`[check-doc-governance] 计量 ${charResults.length} 个字符预算目标 / ${sectionResults.length} 个规则章节：阻断 ${blockCount} / warning ${warnCount} / 归档索引 ${archiveResult.rowCount} 行`)
    return out.join('\n')
}

/** 是否存在阻断项（供 CLI 与测试复用）。 */
export function hasBlockingFindings(result) {
    return result.charResults.some((r) => r.verdict === 'block' || r.verdict === 'missing-row-target')
        || result.sectionResults.some((r) => r.verdict === 'block' || r.verdict === 'missing-file' || r.verdict === 'missing-section')
        || result.archiveResult.errors.length > 0
        || result.governanceErrors.length > 0
}

/** 聚合检查（供 CLI 与测试复用）。 */
export function checkDocGovernance(root = REPO_ROOT) {
    const files = collectMarkdownFiles(root)
    const budgetDoc = readFileSync(join(root, BUDGET_DOC), 'utf8')
    const { charBudgets, sectionBudgets } = parseBudgetTables(budgetDoc)
    const freshnessDays = parseFreshnessDays(budgetDoc)
    const charResults = checkCharBudgets(root, charBudgets, files)
    const sectionResults = checkSectionBudgets(root, sectionBudgets)
    const archiveDir = join(root, 'docs/plan/archive')
    const archiveFiles = readdirSync(archiveDir).filter((file) => PHASE_FILE_PATTERN.test(file)).sort()
    const todoArchive = readFileSync(join(root, TODO_ARCHIVE), 'utf8')
    const archiveResult = validateArchiveIndex(
        todoArchive,
        archiveFiles,
        (relativePath) => readFileSync(join(root, relativePath), 'utf8'),
    )
    const governanceErrors = [
        ...validateArchiveGovernance(readFileSync(join(root, ARCHIVE_INDEX), 'utf8')),
        ...(statSync(join(root, ARCHIVE_LOG)).isFile() ? [] : ['archive-log.md 不是文件']),
    ]
    const freshness = checkFreshness(root, files, new Date(), freshnessDays)
    return { charResults, sectionResults, archiveResult, governanceErrors, freshness }
}

if (isDirectExecution(import.meta.url)) {
    const json = process.argv.includes('--json')
    let result
    try {
        result = checkDocGovernance()
    } catch (error) {
        process.stderr.write(`[check-doc-governance] ${error.message}\n`)
        process.exit(1)
    }
    if (json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
        process.stdout.write(`${formatReport(result)}\n`)
    }
    process.exit(hasBlockingFindings(result) ? 1 : 0)
}
