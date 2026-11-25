#!/usr/bin/env node
/**
 * 破坏性提交机检（commit-msg 与 CI 共用）。
 *
 * 规则见 docs/standards/git.md §3.9：
 * - 主题含 `!` 或 footer 含 `BREAKING CHANGE:` 即属破坏性提交；
 * - 必须同时有非空 `BREAKING CHANGE:` footer 与 `Breaking-Review:` 记录；
 * - `Breaking-Review:` 必须位于 `BREAKING CHANGE:` 之前，格式为
 *   `Breaking-Review: <单 token> <YYYY-MM-DD> <approved|approved-with-migration>`；
 * - `approved-with-migration` 还必须有非空 `Migration:` 迁移路径行。
 *
 * 只校验存在、位置与格式，不替代人工确认；不追溯历史提交。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** 允许的审查结论（与 git.md §3.9 同源）。 */
export const CONCLUSIONS = ['approved', 'approved-with-migration']

const HEADER_BANG_RE = /^[A-Za-z]+(?:\([^)]*\))?!:/
const BREAKING_FOOTER_RE = /^BREAKING CHANGE:[ \t]*(.*)$/
const BREAKING_HYPHEN_RE = /^BREAKING-CHANGE:/
const REVIEW_LINE_RE = /^Breaking-Review:/
const REVIEW_RE = /^Breaking-Review:[ \t]+(\S+)[ \t]+(\d{4}-\d{2}-\d{2})[ \t]+(\S+)[ \t]*$/
const MIGRATION_RE = /^Migration:[ \t]*(\S.*)$/
/** footer 行形态（`Token: value`；含 `BREAKING CHANGE:` 这类带空格的 token）。 */
const TRAILER_LINE_RE = /^[A-Za-z][A-Za-z0-9-]*(?:[ ][A-Za-z][A-Za-z0-9-]*)*:[ \t]*/

const USAGE = `破坏性提交机检（docs/standards/git.md §3.9）

用法：
  node scripts/check-breaking-commit.mjs --message-file <path>   # husky commit-msg
  node scripts/check-breaking-commit.mjs --range <a..b>          # CI（只校验范围内非 merge 提交）
  node scripts/check-breaking-commit.mjs --help

退出码：0 = 通过；1 = 存在违规；2 = 参数 / 环境错误。
`

/** 是否为 merge 提交消息（不适用破坏性提交规则）。 */
export const isMergeMessage = (message) => /^Merge\b/.test(message.trimStart())

/** `YYYY-MM-DD` 是否为真实存在的日期（拒绝 2026-02-30）。 */
export const isValidDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) {
        return false
    }
    const [, year, month, day] = match.map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
}

/**
 * 提取 footer 区（末尾连续的 trailer 块，忽略 git 注释行）。
 *
 * - 末块只要有 trailer 行即可作为 footer（兼容多行 footer 值）
 * - 再向前合并「所有非空行都是 trailer」的块（`-s` / `commit.verbose` 追加的 Signed-off-by 等）
 * - 遇到普通正文块即停止
 */
function extractFooterLines(normalized) {
    // `git commit -v` 在剪刀线之后输出裸 diff；剪刀线之前的说明段才是提交消息。
    const content = normalized
        .split(/^#\s*-{2,}\s*>8\s*-{2,}\s*$/m)[0]
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .join('\n')
        .trimEnd()
    const blocks = content.split(/\n[ \t]*\n+/)
    const footerBlocks = []
    for (let index = blocks.length - 1; index >= 1; index--) {
        const blockLines = blocks[index].split('\n').filter((line) => line.trim())
        if (blockLines.length === 0 || !TRAILER_LINE_RE.test(blockLines[0])) {
            break
        }
        footerBlocks.unshift(blocks[index])
        if (!blockLines.every((line) => TRAILER_LINE_RE.test(line))) {
            break
        }
    }
    return footerBlocks.flatMap((block) => block.split('\n'))
}

/**
 * 检查单条提交消息。
 *
 * @param {string} message 完整提交消息（header + body + footer）
 * @returns {string[]} 违规说明；空数组表示通过 / 不适用
 */
export function inspectMessage(message) {
    if (!message.trim() || isMergeMessage(message)) {
        return []
    }

    const normalized = message.replace(/\r\n/g, '\n').trimEnd()
    const lines = normalized.split('\n')
    const header = lines[0] ?? ''
    const hasBang = HEADER_BANG_RE.test(header)

    // 只取末尾的 footer 区：忽略 `git commit -v` 的 `#` 注释行，并把 `-s` / `commit.verbose`
    // 追加在真实 footer 之后的 trailer-only 块（Signed-off-by 等）一并并入。
    // 正文里引用的模板行（列首）不参与判定；引用模板时须缩进或放入行内代码。
    const footerLines = extractFooterLines(normalized)

    let breakingIndex = -1
    let breakingDescription = ''
    let hasHyphenFooter = false
    let reviewIndex = -1
    let review = null
    let migrationPath = ''

    footerLines.forEach((line, index) => {
        if (breakingIndex === -1) {
            const footer = BREAKING_FOOTER_RE.exec(line)
            if (footer) {
                breakingIndex = index
                breakingDescription = footer[1].trim()
            }
        }
        if (BREAKING_HYPHEN_RE.test(line)) {
            hasHyphenFooter = true
        }
        if (reviewIndex === -1 && REVIEW_LINE_RE.test(line)) {
            reviewIndex = index
            review = REVIEW_RE.exec(line)
        }
        if (!migrationPath) {
            const migration = MIGRATION_RE.exec(line)
            if (migration) {
                migrationPath = migration[1].trim()
            }
        }
    })

    const destructive = hasBang || breakingIndex !== -1 || hasHyphenFooter
    if (!destructive) {
        return []
    }

    const errors = []
    if (breakingIndex === -1) {
        errors.push('缺少标准 `BREAKING CHANGE:` footer（只写 `!` 或 `BREAKING-CHANGE:` 不合规；footer 须为末尾 trailer 块，引用模板请缩进或放入行内代码）')
    } else if (!breakingDescription) {
        errors.push('`BREAKING CHANGE:` footer 说明为空')
    }

    if (reviewIndex === -1) {
        errors.push('缺少 `Breaking-Review:` 审查记录（格式：Breaking-Review: <单 token> <YYYY-MM-DD> <approved|approved-with-migration>）')
    } else if (!review) {
        errors.push('`Breaking-Review:` 格式不合法（确认人标识必须为单 token，日期 YYYY-MM-DD，结论取枚举值）')
    } else {
        if (breakingIndex !== -1 && reviewIndex > breakingIndex) {
            errors.push('`Breaking-Review:` 必须位于 `BREAKING CHANGE:` 之前')
        }
        if (!isValidDate(review[2])) {
            errors.push(`\`Breaking-Review:\` 日期非法：${review[2]}`)
        }
        if (!CONCLUSIONS.includes(review[3])) {
            errors.push(`结论不在枚举（${CONCLUSIONS.join(' / ')}）：${review[3]}`)
        }
        if (review[3] === 'approved-with-migration' && !migrationPath) {
            errors.push('结论为 approved-with-migration 时必须提供非空 `Migration:` 迁移路径行')
        }
    }

    return errors
}

/**
 * 校验 git 提交范围（`a..b`）。
 *
 * @param {string} range git rev 范围
 * @param {string} [cwd] 仓库目录（测试注入）
 * @returns {{ hash: string, errors: string[] }[]} 违规提交
 */
export function checkRange(range, cwd = process.cwd()) {
    const output = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%B%x1e', range], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    const failures = []
    for (const record of output.split('\x1e')) {
        const trimmed = record.trim()
        if (!trimmed) {
            continue
        }
        const separator = trimmed.indexOf('\x1f')
        if (separator === -1) {
            continue
        }
        const hash = trimmed.slice(0, separator)
        const message = trimmed.slice(separator + 1)
        const errors = inspectMessage(message)
        if (errors.length > 0) {
            failures.push({ hash, errors })
        }
    }
    return failures
}

/**
 * CLI 入口（可测试）。
 *
 * @param {string[]} argv 参数（不含 node 与脚本路径）
 * @param {{ cwd?: string }} [options]
 * @returns {number} 退出码
 */
export function main(argv = process.argv.slice(2), options = {}) {
    if (argv.includes('--help') || argv.includes('-h')) {
        console.log(USAGE)
        return 0
    }

    const messageFile = valueOf(argv, '--message-file')
    const range = valueOf(argv, '--range')
    if (!messageFile && !range) {
        console.error(USAGE)
        return 2
    }
    if (messageFile && range) {
        console.error('[breaking-commit] --message-file 与 --range 不能同时使用')
        return 2
    }

    if (messageFile) {
        let message
        try {
            message = readFileSync(messageFile, 'utf8')
        } catch (error) {
            console.error(`[breaking-commit] 无法读取提交消息文件：${error instanceof Error ? error.message : String(error)}`)
            return 2
        }
        const errors = inspectMessage(message)
        if (errors.length === 0) {
            return 0
        }
        reportErrors('消息文件', errors)
        return 1
    }

    if (range.startsWith('-')) {
        console.error(`[breaking-commit] 非法范围：${range}`)
        return 2
    }

    let failures
    try {
        failures = checkRange(range, options.cwd)
    } catch (error) {
        console.error(`[breaking-commit] 无法校验范围 ${range}：${error instanceof Error ? error.message : String(error)}`)
        return 2
    }
    if (failures.length === 0) {
        return 0
    }
    for (const failure of failures) {
        reportErrors(`提交 ${failure.hash}`, failure.errors)
    }
    return 1
}

/** 读取 `--flag value` 的参数值。 */
function valueOf(argv, flag) {
    const index = argv.indexOf(flag)
    if (index === -1) {
        return ''
    }
    return argv[index + 1] ?? ''
}

/** 打印违规说明。 */
function reportErrors(target, errors) {
    for (const error of errors) {
        console.error(`[breaking-commit] ${target}: ${error}`)
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(main())
}
