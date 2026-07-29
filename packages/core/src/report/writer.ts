import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReportArtifact } from './index'

/**
 * 将 Markdown 和 JSON 报告写入输出目录。
 *
 * @param mdContent Markdown 报告内容
 * @param jsonContent JSON 报告内容
 * @param startedAt ISO 8601 开始时间，从中提取日期用于文件名
 * @param runId 运行 ID（超过 8 字符会截断）
 * @param outputDir 输出目录，默认 `./dependfix-reports`
 * @returns 生成的两个 ReportArtifact
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
    const shortRunId = runId.slice(0, 8)

    const mdPath = join(outputDir, `dependfix-report-${date}-${shortRunId}.md`)
    const jsonPath = join(outputDir, `dependfix-report-${date}-${shortRunId}.json`)

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
