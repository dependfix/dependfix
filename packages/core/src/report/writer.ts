import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReportArtifact } from './index'

/**
 * 将 Markdown 和 JSON 报告写入输出目录。
 *
 * @param mdContent Markdown 报告内容
 * @param jsonContent JSON 报告内容
 * @param startedAt ISO 8601 开始时间，从中提取日期与时刻用于文件名
 * @param runId 运行 ID，文件名取最后一个 `-` 分隔段（如随机后缀）
 * @param outputDir 输出目录，默认 `./dependfix-reports`
 * @returns 生成的两个 ReportArtifact
 *
 * 文件名格式：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.md|.json`。
 * 日期 + 时刻保证同目录内按文件名排序即按运行时间排序（字典序 == 时间序），
 * 尾段保证同一时刻多次运行的唯一性。
 */
export function writeReport(
    mdContent: string,
    jsonContent: string,
    startedAt: string,
    runId: string,
    outputDir = './dependfix-reports',
): ReportArtifact[] {
    // 确保输出目录存在
    mkdirSync(outputDir, { recursive: true })

    const date = extractDate(startedAt)
    const time = extractTime(startedAt)
    const shortRunId = extractRunSuffix(runId)

    const mdPath = join(outputDir, `dependfix-report-${date}-${time}-${shortRunId}.md`)
    const jsonPath = join(outputDir, `dependfix-report-${date}-${time}-${shortRunId}.json`)

    writeFileSync(mdPath, mdContent, 'utf-8')
    writeFileSync(jsonPath, jsonContent, 'utf-8')

    return [
        { format: 'markdown', path: mdPath },
        { format: 'json', path: jsonPath },
    ]
}

/** 从 ISO 8601 时间戳提取 YYYYMMDD */
function extractDate(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (match) {
        return `${match[1]}${match[2]}${match[3]}`
    }
    // fallback: 使用当前日期
    const now = new Date()
    const y = now.getFullYear().toString()
    const m = (now.getMonth() + 1).toString().padStart(2, '0')
    const d = now.getDate().toString().padStart(2, '0')
    return `${y}${m}${d}`
}

/** 从 ISO 8601 时间戳提取 HHmmss */
function extractTime(iso: string): string {
    const match = /T(\d{2}):(\d{2}):(\d{2})/.exec(iso)
    if (match) {
        return `${match[1]}${match[2]}${match[3]}`
    }
    // fallback: 使用当前时刻
    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * 提取用于文件名的短后缀（最多 8 字符）：
 * 优先取 runId 最后一个 `-` 分隔段（如 `dependfix-<ts>-<rand>` 中的随机段），
 * 无有效分隔段（无 `-` 或尾段为空）时取整个 runId 前 8 字符兜底。
 * 注意：T210 起修复分支名已改为内容指纹（`dependfix/auto-fix-{fp8}`，见 pr-creator.ts），
 * 不再依赖 runId，本函数仅服务于报告文件名，无需与分支命名逻辑同步。
 */
function extractRunSuffix(runId: string): string {
    const idx = runId.lastIndexOf('-')
    const tail = idx >= 0 && idx < runId.length - 1 ? runId.slice(idx + 1) : runId
    return tail.slice(0, 8)
}
