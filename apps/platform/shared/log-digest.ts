/**
 * 运行日志聚合（日志可消费化）。
 *
 * Web 端与未来的 `/api/v1/runs/{id}/logs` 共用同一实现，禁止各自另写归一化规则
 * （口径见 [platform-public-api.md §6.4](../../../docs/design/governance/platform-public-api.md#_6-4-日志查询-digest-契约)）。
 *
 * 处理链：清洗（ANSI / URL 凭据 / 绝对路径 / 敏感键名）→ 模板归一化 → 按
 * `(level, template)` 分组；`error` 不折叠（逐条输出），避免把不同根因压成一条。
 */

import { sanitizeString } from './sanitize'

/** 日志级别（与 `LogEntry` 对齐；消费侧允许字符串，未知级别按原样保留） */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 聚合输入条目（与 `LogEntry` 结构兼容） */
export interface LogDigestEntry {
    timestamp?: string
    level: string
    message: string
    context?: Record<string, unknown>
}

/** 聚合选项 */
export interface LogDigestOptions {
    /** 只统计这些级别（单值或数组；不传 = 全部） */
    level?: string | string[]
    /**
     * 采集侧已丢弃的早期条目数（`ScanRun.logsDropped`）：
     * `null` / 缺省 = 未采集或不可知（历史行、github-action 执行器），`0` = 确认未丢，`> 0` = 丢弃 N 条。
     */
    droppedBefore?: number | null
}

/** 一个聚合分组 */
export interface LogDigestGroup {
    level: string
    /** 归一化模板（`error` 组为清洗后的原文） */
    template: string
    count: number
    firstAt: string
    lastAt: string
    /** 首次出现（清洗后）的原文，与 `firstAt` 同一次遍历取值 */
    sample: string
}

/** 聚合结果（字段语义与设计稿 §6.4 对齐） */
export interface LogDigestResult {
    /** 过滤（`level`）后的原始条目数 */
    total: number
    /** 本次返回的组数 */
    returned: number
    /** 过滤后的组数 */
    groupCount: number
    /** 组数超过 {@link LOG_DIGEST_MAX_GROUPS} 时为 true（只返回前 N 组） */
    truncated: boolean
    /** 任一条（含 sample 附带的 context）超 2 KB、error 正文合计超 64 KB 或 error 组超 200 时为 true（两种视图同口径） */
    errorTruncated: boolean
    droppedBefore: number | null
    groups: LogDigestGroup[]
}

/** 单条清洗后 message 上限（2 KB） */
export const LOG_DIGEST_MAX_MESSAGE_BYTES = 2 * 1024
/** error 正文合计上限（64 KB） */
export const LOG_DIGEST_MAX_ERROR_BYTES = 64 * 1024
/** error 组数上限 */
export const LOG_DIGEST_MAX_ERROR_GROUPS = 200
/** 单次返回组数上限（与 v1 pageSize 上限对齐；超出置 `truncated`，避免拼接文本无限膨胀） */
export const LOG_DIGEST_MAX_GROUPS = 200

const LEVEL_RANK: Record<string, number> = {
    error: 4,
    warn: 3,
    info: 2,
    debug: 1,
}

// 控制字符用 String.fromCharCode 构造，避免 ESLint `no-control-regex` 把 ANSI 规则本身判成违规
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const ANSI_PATTERNS: RegExp[] = [
    // OSC（终端标题 / 超链接）：ESC ] ... BEL 或 ST
    new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, 'g'),
    // CSI（颜色 / 光标）：ESC [ ... final byte
    new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g'),
    // 其余双字符转义
    new RegExp(`${ESC}[@-_]`, 'g'),
]

/** 绝对路径前缀（设计稿 §6.4 枚举）；保留其后标点，避免吞掉句子结构 */
const ABSOLUTE_PATH_PATTERN = /(?:\/(?:root|home|app|tmp|var|usr))(?![A-Za-z0-9_.-])(?:\/[^\s"'`()<>,;]*)?/g

const ISO_TIMESTAMP_PATTERN = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const HEX_ID_PATTERN = /\b[0-9a-f]{8,}\b/gi
const URL_PATTERN = /(https?:\/\/[^\s/?#]+)(?:[/?#][^\s]*)?/gi
const NUMBER_WITH_UNIT_PATTERN = /\b\d+(?:\.\d+)?\s?(ms|s|m|h|kb|mb|gb|kib|mib|gib|b|%|x)\b/gi
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?\b/g

const encoder = new TextEncoder()

/** UTF-8 字节数（App 与 Node 两侧可用，不依赖 Buffer） */
export function byteLength(value: string): number {
    return encoder.encode(value).length
}

/** 按 UTF-8 字节截断（不切断代理对；截断即视为 error 截断信号，由调用方汇总） */
function truncateBytes(value: string, maxBytes: number): string {
    if (byteLength(value) <= maxBytes) {
        return value
    }
    let result = ''
    let size = 0
    for (const char of value) {
        const charBytes = byteLength(char)
        if (size + charBytes > maxBytes) {
            break
        }
        result += char
        size += charBytes
    }
    return result
}

/**
 * 清洗单条日志正文（两种视图共用）：
 * 去 ANSI → 复用 `sanitizeString`（URL 凭据 / Authorization / token / 私钥）→ 绝对路径归一。
 */
export function cleanLogMessage(message: string): string {
    let cleaned = message
    for (const pattern of ANSI_PATTERNS) {
        cleaned = cleaned.replace(pattern, '')
    }
    cleaned = sanitizeString(cleaned)
    cleaned = cleaned.replace(ABSOLUTE_PATH_PATTERN, '<path>')
    return cleaned
}

const URL_PLACEHOLDER_START = String.fromCharCode(0)
const URL_PLACEHOLDER_END = String.fromCharCode(0)

/**
 * URL 占位符：先把整条 URL 取出，避免后续数字归一吃掉端口号（设计稿要求保留 scheme / 域名 / 端口）。
 * 占位符只用字母，不会被数字 / hex 规则命中。
 */
function urlPlaceholder(index: number): string {
    let label = ''
    let value = index
    do {
        label = String.fromCharCode(97 + (value % 26)) + label
        value = Math.floor(value / 26) - 1
    } while (value >= 0)
    return `${URL_PLACEHOLDER_START}url${label}${URL_PLACEHOLDER_END}`
}

/** 单行模板归一化（ISO 时间 / URL path / UUID / hex / 数字，单位保留） */
function normalizeTemplateLine(line: string): string {
    const urls: string[] = []
    let normalized = line.replace(URL_PATTERN, (_match, authority: string) => {
        urls.push(`${authority}<path>`)
        return urlPlaceholder(urls.length - 1)
    })
    normalized = normalized
        .replace(ISO_TIMESTAMP_PATTERN, '<ts>')
        .replace(UUID_PATTERN, '<id>')
        .replace(HEX_ID_PATTERN, '<id>')
        .replace(NUMBER_WITH_UNIT_PATTERN, '<n>$1')
        .replace(NUMBER_PATTERN, '<n>')
    return normalized.replace(
        new RegExp(`${URL_PLACEHOLDER_START}url([a-z]+)${URL_PLACEHOLDER_END}`, 'g'),
        (_match, label: string) => {
            let index = 0
            for (const char of label) {
                index = index * 26 + (char.charCodeAt(0) - 96)
            }
            return urls[index - 1] ?? ''
        },
    )
}

/**
 * 首次出现的样本：清洗后正文 + 原样附上 context（context 不参与模板与分组）。
 * context 已由采集侧 `sanitizeDeep` 处理，这里只做序列化。
 */
function buildSample(cleanedMessage: string, context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
        return cleanedMessage
    }
    return `${cleanedMessage} ${JSON.stringify(context)}`
}

/** 由清洗后正文生成分组模板（多行按行归一，保留换行结构） */
export function buildLogTemplate(cleanedMessage: string): string {
    return cleanedMessage
        .split('\n')
        .map((line) => normalizeTemplateLine(line))
        .join('\n')
}

function matchesLevel(level: string, filter: string | string[] | undefined): boolean {
    if (!filter) {
        return true
    }
    const filterList = Array.isArray(filter) ? filter : [filter]
    if (filterList.length === 0) {
        return true
    }
    return filterList.some((value) => value.toLowerCase() === level.toLowerCase())
}

/**
 * 聚合日志条目。
 *
 * - 分组键 `(level, template)`；`error` 不归一化，`count` 恒为 1
 * - 排序：级别降序（error → warn → info → debug），组内 `count` 降序；`error` 组按时间升序
 * - `sample` / `firstAt` 在同一次遍历赋值，避免过滤后口径分歧
 */
export function digestLogEntries(
    entries: readonly LogDigestEntry[],
    options: LogDigestOptions = {},
): LogDigestResult {
    const droppedBefore = options.droppedBefore === undefined ? null : options.droppedBefore
    const filtered = entries.filter((entry) => matchesLevel(entry.level, options.level))

    const groups = new Map<string, LogDigestGroup>()
    let errorTruncated = false
    let errorGroupCount = 0
    let errorBytes = 0
    let errorSequence = 0
    const errorEntryCount = filtered.filter((entry) => entry.level.toLowerCase() === 'error').length

    for (const entry of filtered) {
        const cleanedFull = cleanLogMessage(entry.message ?? '')
        const cleaned = truncateBytes(cleanedFull, LOG_DIGEST_MAX_MESSAGE_BYTES)
        if (cleaned !== cleanedFull) {
            errorTruncated = true
        }
        // sample 附带的 context 也受单条预算约束，避免绕过 2 KB / 64 KB 上限
        const sampleFull = buildSample(cleaned, entry.context)
        const sample = truncateBytes(sampleFull, LOG_DIGEST_MAX_MESSAGE_BYTES)
        if (sample !== sampleFull) {
            errorTruncated = true
        }
        const isError = entry.level.toLowerCase() === 'error'
        const template = isError ? cleaned : buildLogTemplate(cleaned)
        if (isError) {
            if (
                errorGroupCount >= LOG_DIGEST_MAX_ERROR_GROUPS
                || errorBytes + byteLength(sample) > LOG_DIGEST_MAX_ERROR_BYTES
            ) {
                errorTruncated = true
                continue
            }
            errorGroupCount += 1
            errorBytes += byteLength(sample)
        }
        // error 不折叠：即使清洗后正文相同，也按条目独立成组（唯一序号进 key）
        const key = isError
            ? `error\u0000${errorSequence++}`
            : `${entry.level.toLowerCase()}\u0000${template}`
        const existing = groups.get(key)
        const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : ''
        if (existing) {
            existing.count += 1
            if (timestamp && (!existing.lastAt || timestamp > existing.lastAt)) {
                existing.lastAt = timestamp
            }
            continue
        }
        groups.set(key, {
            level: entry.level.toLowerCase(),
            template,
            count: 1,
            firstAt: timestamp,
            lastAt: timestamp,
            sample,
        })
    }

    if (errorEntryCount > errorGroupCount) {
        errorTruncated = true
    }

    const resultGroups = [...groups.values()]
    const errorGroups = resultGroups.filter((group) => group.level === 'error')
    const nonErrorGroups = resultGroups.filter((group) => group.level !== 'error')
    errorGroups.sort((a, b) => a.firstAt.localeCompare(b.firstAt))
    nonErrorGroups.sort((a, b) => {
        const rankDiff = (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0)
        if (rankDiff !== 0) {
            return rankDiff
        }
        if (b.count !== a.count) {
            return b.count - a.count
        }
        return a.template.localeCompare(b.template)
    })

    const sortedGroups = [...errorGroups, ...nonErrorGroups]
    const truncated = sortedGroups.length > LOG_DIGEST_MAX_GROUPS
    const visibleGroups = truncated ? sortedGroups.slice(0, LOG_DIGEST_MAX_GROUPS) : sortedGroups

    return {
        total: filtered.length,
        returned: visibleGroups.length,
        groupCount: sortedGroups.length,
        truncated,
        errorTruncated,
        droppedBefore,
        groups: visibleGroups,
    }
}

function formatDroppedBefore(value: number | null): string {
    if (value === null) {
        return 'unknown (collector did not record; earlier entries may be missing)'
    }
    if (value === 0) {
        return '0 (no entries dropped)'
    }
    return `${value} (earlier entries were dropped by the collector; this is not the full run)`
}

/**
 * 生成可直接粘贴给 AI 的聚合文本：分组摘要 + 计数 + 截断 / 丢弃提示。
 * 标签固定英文，避免随 UI 语言变化影响下游提示词。
 */
export function formatLogDigest(result: LogDigestResult): string {
    const lines: string[] = [
        '# dependfix execution log digest (grouped)',
        `- total entries: ${result.total}`,
        `- groups: ${result.groupCount} (returned ${result.returned})`,
        `- dropped before: ${formatDroppedBefore(result.droppedBefore)}`,
        `- truncated: ${result.truncated ? 'yes' : 'no'}`,
        `- error truncated: ${result.errorTruncated ? 'yes' : 'no'}`,
        '',
    ]

    for (const group of result.groups) {
        const first = group.firstAt || 'unknown'
        const last = group.lastAt || 'unknown'
        lines.push(`## ${group.level.toUpperCase()} — ${group.count} entr${group.count === 1 ? 'y' : 'ies'} in group`)
        lines.push(`- first: ${first} | last: ${last} | count: ${group.count}`)
        if (group.level === 'error') {
            lines.push(group.sample)
        } else {
            lines.push(`template: ${group.template}`)
            if (group.sample !== group.template) {
                lines.push(`sample: ${group.sample}`)
            }
        }
        lines.push('')
    }

    if (result.truncated) {
        lines.push(`> note: only the first ${result.returned} of ${result.groupCount} groups are shown.`)
    }
    if (result.errorTruncated) {
        lines.push('> note: log entries were truncated (per-entry 2 KB / error total 64 KB / 200 error groups limit).')
    }
    if (result.droppedBefore !== null && result.droppedBefore > 0) {
        lines.push(`> note: ${result.droppedBefore} earlier entries were dropped before capture.`)
    }

    return lines.join('\n').trimEnd()
}
