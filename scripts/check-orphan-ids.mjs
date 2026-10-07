#!/usr/bin/env node

/**
 * 孤立规划编号检测脚本
 *
 * 检测非 `docs/` 源码 / 配置 / 脚本注释中「无文档指针的孤立规划编号」，
 * 对应开发规范 §3 注释规范（注释与测试名不得出现规划 / 任务 / 审计 / backlog 编号；
 * 例外仅两类——代码内真实常量、带文档路径或章节名的导航指针）。
 *
 * 判定粒度：注释块级——同一注释块内出现文档指针（`docs/` / `.md` / `§` /
 * `todo.md` / `backlog` 等）时，块内规划编号视为可反查的导航指针（合规）；
 * 否则视为孤立违规。
 *
 * 覆盖范围：整行注释块（`//` / `#` / `/*` 起始的块注释）+ 整行测试名 +
 * 代码行内尾随注释（单行 `//` 或单行内联块注释）。
 * 已知边界（不在检测面）：跨行书写的测试名（`it(` 与字符串分行）、`.vue` 模板
 * HTML 注释 `<!-- -->`、纯字符串字面量中的编号、裸 `PR\d+`（PR 编号引用常见，
 * 歧义高，需人工处理）。文档指针正则较宽（裸 `backlog` / `roadmap` 等即视为指针），
 * 属有意取舍。
 *
 * 口径来源：`docs/plan/todo.md` 的存量清理条目（背景与验收）。
 *
 * 用法：
 *   node scripts/check-orphan-ids.mjs            # 人读报告
 *   node scripts/check-orphan-ids.mjs --json     # 机读 JSON
 *
 * CI：Test job 已接入该命令（命中即 exit 1 阻断），见 scripts/README.md。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
export const PROJECT_ROOT = join(__dirname, '..')

/** 扫描的文件扩展名（非 docs/ 的源码 / 配置 / 脚本）。 */
export const SCAN_EXTENSIONS = new Set([
    '.ts', '.mts', '.cts', '.tsx',
    '.js', '.mjs', '.cjs', '.jsx',
    '.vue', '.scss', '.css',
    '.yml', '.yaml', '.jsonc',
    '.sh', '.bash', '.zsh',
])

/** 使用 `#` 行注释的扩展名。 */
const HASH_COMMENT_EXTENSIONS = new Set(['.yml', '.yaml', '.sh', '.bash', '.zsh'])

/** 跳过的目录名（按目录名在任意层级匹配）。 */
export const EXCLUDED_DIRS = new Set([
    'node_modules', 'dist', '.nuxt', '.output', 'coverage',
    '.git', '.session', '.opencode', 'docs', 'artifacts', 'temp',
])

/** 跳过的文件（相对仓库根的 basename）。 */
export const EXCLUDED_FILES = new Set(['pnpm-lock.yaml'])

/** 文档指针：块内出现即视为导航指针。大小写敏感（避免误匹配 `// TODO:`）。 */
export const DOC_POINTER_RE = /docs\/|\.md\b|§|todo\.md|todo-archive|backlog|roadmap|experience-archive/

/**
 * 规划 / 任务 / 审计 / backlog 编号。
 * 覆盖 D 阶段自检 canonical 集合（T / P / C / G / R / M / B）+ §3 语义内的审计与决策编号
 * （`UX-R` 变体 / `RG-Bxx` 审计项 / `D\d` 决策 / `W\d` 警告项 / `S\d` 建议项，其中 S 兼容
 * 带连字符与裸编号两种写法）。位数范围限定（M0–M99 / T100–T9999 / W、S 1–99），
 * 不试图与任意宽度的编号完全等价。
 */
export const PLANNING_ID_RE = /(?<![\w.-])(UX-R\d+|RG-[BWS]?\d+|T\d{3,4}|P[0-3](?:-\d+)?|C\d{1,3}|G[1-7]|R[1-9]|M\d{1,2}(?:\.(?:\d{1,2}|x))?|B[1-9]|D\d{1,2}|W\d{1,2}|S-?\d{1,2})(?![\w.-])/g

/** 真常量白名单：命中该 token 即忽略（大小写敏感）。按实测命中的真实常量维护。 */
export const WHITELIST = new Set([
    'R2', // Cloudflare R2 对象存储
    'D3', // 数据可视化库 d3（如以 `D3` 形式出现）
])

/**
 * 提取代码行尾随注释文本（`// ...` 或块注释）。
 * 跳过字符串字面量（`'` / `"` / `` ` ``，含反斜杠转义）与 URL `://`
 * （`//` 前置字符为 `:` 时不匹配）；行首注释由调用方先行处理。
 */
export function extractTrailingComment(line) {
    let quote = null
    for (let index = 0; index < line.length; index++) {
        const char = line[index]
        if (quote) {
            if (char === '\\') {
                index++
            } else if (char === quote) {
                quote = null
            }
            continue
        }
        if (char === '\'' || char === '"' || char === '`') {
            quote = char
            continue
        }
        if (char === '/' && line[index + 1] === '/') {
            if (line[index - 1] === ':') {
                continue
            }
            return `//${line.slice(index + 2)}`
        }
        if (char === '/' && line[index + 1] === '*') {
            const end = line.indexOf('*/', index + 2)
            if (end !== -1) {
                return `/*${line.slice(index + 2, end)}*/`
            }
        }
    }
    return null
}

/** 从内容提取注释单元（块级）。 */
export function extractCommentUnits(content, ext) {
    const lines = content.split('\n')
    const units = []
    const isHash = HASH_COMMENT_EXTENSIONS.has(ext)
    let block = null
    let inBlockComment = false

    const flush = () => {
        if (block) {
            units.push(block)
            block = null
        }
    }

    for (let index = 0; index < lines.length; index++) {
        const raw = lines[index]
        const trimmed = raw.trim()

        if (inBlockComment) {
            block ??= { startLine: index + 1, lines: [] }
            block.lines.push(trimmed)
            if (trimmed.includes('*/')) {
                inBlockComment = false
            }
            continue
        }

        if (/^(?:it|test|describe|suite)(?:\.\w+)*\s*\(/.test(trimmed)) {
            flush()
            units.push({ startLine: index + 1, lines: [raw], kind: 'test-name' })
            continue
        }

        const isLineComment = isHash
            ? trimmed.startsWith('#')
            : trimmed.startsWith('//') || trimmed.startsWith('/*')

        if (isLineComment) {
            block ??= { startLine: index + 1, lines: [] }
            block.lines.push(trimmed)
            if (!isHash && trimmed.startsWith('/*') && !trimmed.includes('*/')) {
                inBlockComment = true
            }
            continue
        }

        const trailing = isHash ? null : extractTrailingComment(raw)
        if (trailing) {
            flush()
            units.push({ startLine: index + 1, lines: [trailing], kind: 'trailing' })
            continue
        }

        flush()
    }
    flush()
    return units
}

/** 分析单文件内容，返回孤立命中与合规（指针）命中。 */
export function analyzeContent(content, ext) {
    const hits = []
    const compliantIds = []
    for (const unit of extractCommentUnits(content, ext)) {
        const text = unit.lines.join('\n')
        const unitHasPointer = DOC_POINTER_RE.test(text)
        const allIds = []
        for (const lineText of unit.lines) {
            allIds.push(...[...lineText.matchAll(PLANNING_ID_RE)].map((match) => match[0]))
        }
        if (allIds.length === 0) {
            continue
        }
        if (unitHasPointer) {
            compliantIds.push(...allIds)
            continue
        }
        unit.lines.forEach((lineText, offset) => {
            const orphanIds = [...lineText.matchAll(PLANNING_ID_RE)]
                .map((match) => match[0])
                .filter((id) => !WHITELIST.has(id))
            if (orphanIds.length > 0) {
                hits.push({
                    line: unit.startLine + offset,
                    ids: orphanIds,
                    text: lineText.replace(/\s+/g, ' ').slice(0, 160),
                })
            }
        })
    }
    return { hits, compliantIds }
}

/** 递归收集待扫描文件。 */
export function collectFiles(root = PROJECT_ROOT) {
    const files = []
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name)
            if (entry.isDirectory()) {
                if (EXCLUDED_DIRS.has(entry.name)) {
                    continue
                }
                walk(full)
            } else if (entry.isFile()) {
                if (EXCLUDED_FILES.has(entry.name)) {
                    continue
                }
                if (SCAN_EXTENSIONS.has(extname(entry.name))) {
                    files.push(full)
                }
            }
        }
    }
    walk(root)
    return files
}

/** 扫描仓库，返回孤立编号明细。 */
export function findOrphanIds(root = PROJECT_ROOT) {
    const files = collectFiles(root)
    const findings = []
    for (const file of files) {
        const content = readFileSync(file, 'utf8')
        const { hits } = analyzeContent(content, extname(file))
        const rel = relative(root, file).split(sep).join('/')
        for (const hit of hits) {
            findings.push({ file: rel, ...hit })
        }
    }
    findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
    return { scannedFiles: files.length, findings }
}

/** 人读报告。 */
export function formatReport({ scannedFiles, findings }) {
    const byFile = new Map()
    for (const finding of findings) {
        const list = byFile.get(finding.file) ?? []
        list.push(finding)
        byFile.set(finding.file, list)
    }
    const out = [`孤立规划编号检测：${byFile.size} 个文件 / ${findings.length} 处命中（扫描 ${scannedFiles} 个文件）`, '']
    for (const [file, list] of byFile) {
        out.push(`${file}`)
        for (const finding of list) {
            out.push(`  :${finding.line}  [${finding.ids.join(', ')}]  ${finding.text}`)
        }
    }
    return out.join('\n')
}

/** 直接执行守卫（供 vitest 导入时保持无副作用）。 */
export function isDirectExecution(metaUrl, argv1) {
    return Boolean(argv1) && metaUrl === pathToFileURL(argv1).href
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
    const result = findOrphanIds()
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
        process.stdout.write(`${formatReport(result)}\n`)
    }
    process.exitCode = result.findings.length > 0 ? 1 : 0
}
