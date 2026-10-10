/**
 * check-experience-landing：校验经验归档条目的「落点」字段非空（L1 脚本 / L2 检查点 / L3 规范条款）。
 *
 * 设计原则：
 * - 对治「只留条目、不留落点」反模式（[规范与经验管理体系重构设计 §3.3](../docs/design/governance/standards-experience-refactor.md)）。
 * - 判定口径：每个 `## §NN` 条目必须含**至少一处**非空落点标记——
 *   `- **落点**：…`（显式）或 `### 挂接治理检查点` / `### 沉淀` 段内至少一行非空内容。
 * - 占位符（如「（见对应规范条款）」）视为**空**，防止假通过。
 * - 纯函数 + CLI 入口守卫（`isDirectExecution`）：vitest import 时不执行顶层副作用。
 * - 错误格式 `path:line:问题` 与 check-docs / check-orphan-ids 一致。
 *
 * 用法：
 *   node scripts/check-experience-landing.mjs
 *   node scripts/check-experience-landing.mjs --json
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDirectExecution } from './shared/cli.mjs'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const ARCHIVE_DIR = 'docs/design/governance'

/** 视为「空落点」的占位串（命中即判为空）。 */
export const PLACEHOLDER_RE = /^[（(]\s*见?对应?规范条款\s*[）)]?$|^[-—\s]*$/

/** 落点标记：显式 `**落点**：X` 或 `**沉淀**：X`。 */
const LANDING_LINE_RE = /^\s{0,4}[-*]\s*\*\*(落点|沉淀)\*\*[：:]\s*(.+)$/
/** 落点小节标题（段内任意非空行即可）。 */
const LANDING_SECTION_RE = /^#{3,4}\s*(挂接治理检查点|沉淀|落点)/

/**
 * 校验单个分片文本，返回「缺落点」条目清单。
 * @param {string} text
 * @returns {Array<{heading: string, line: number, reason: string}>}
 */
export function checkShardText(text) {
    const lines = text.split(/\r?\n/)
    const sections = []
    lines.forEach((line, idx) => {
        if (line.startsWith('## ')) {
            sections.push({ heading: line.slice(3).trim(), line: idx + 1, body: [] })
        } else if (sections.length > 0) {
            sections[sections.length - 1].body.push(line)
        }
    })
    const missing = []
    for (const section of sections) {
        let ok = false
        let inSection = false
        for (const line of section.body) {
            if (LANDING_SECTION_RE.test(line)) {
                inSection = true
                continue
            }
            if (/^#{2,4}\s/.test(line)) {
                inSection = false
            }
            const m = line.match(LANDING_LINE_RE)
            if (m) {
                inSection = false
                if (!PLACEHOLDER_RE.test(m[2].trim())) {
                    ok = true
                }
                continue
            }
            if (inSection && line.trim() !== '' && !PLACEHOLDER_RE.test(line.trim().replace(/^[-*]\s*/, ''))) {
                ok = true
            }
        }
        if (!ok) {
            missing.push({ heading: section.heading, line: section.line, reason: '落点为空或缺失' })
        }
    }
    return missing
}

/** 扫描仓库内的经验归档分片。 */
export function checkExperienceLanding(root = REPO_ROOT) {
    const dir = join(root, ARCHIVE_DIR)
    const files = readdirSync(dir)
        .filter((f) => f.startsWith('experience-archive-') && f.endsWith('.md') && f !== 'experience-archive.md')
        .sort()
    const findings = []
    for (const file of files) {
        const rel = `${ARCHIVE_DIR}/${file}`
        const missing = checkShardText(readFileSync(join(dir, file), 'utf8'))
        for (const m of missing) {
            findings.push({ file: rel, ...m })
        }
    }
    return findings
}

if (isDirectExecution(import.meta.url)) {
    const json = process.argv.includes('--json')
    const findings = checkExperienceLanding()
    if (json) {
        process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`)
    } else if (findings.length === 0) {
        process.stdout.write('[check-experience-landing] OK：全部经验条目均含非空落点\n')
    } else {
        for (const f of findings) {
            process.stderr.write(`${f.file}:${f.line}: ${f.heading} —— ${f.reason}\n`)
        }
        process.stdout.write(`[check-experience-landing] ${findings.length} 条缺落点\n`)
    }
    process.exit(findings.length > 0 ? 1 : 0)
}
