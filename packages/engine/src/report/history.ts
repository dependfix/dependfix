// history.ts
// --history 命令输出格式化（纯函数，可单测）。

import type { ArchiveRunEntry } from './archiver'

/**
 * 将某仓库的历史运行摘要格式化为多行文本（倒序时间：最新在前）。
 *
 * 计数取自 `entry.repoStats` 中该仓库条目（RepositoryResult 口径）——
 * 多仓库一次运行时，`entry.summary` 是全局合计，不能代表单仓库趋势。
 *
 * 行格式：`YYYY-MM-DD HH:mm:ss  告警 N / 修复 N / 失败 N  时长 Xs  runId=...`
 * 无历史时返回提示行（非空，调用方直接打印）。
 */
export function formatHistory(entries: ArchiveRunEntry[], repo: string): string {
    if (entries.length === 0) {
        return 'No archived runs found for this repository (run dependfix at least once to populate history).'
    }

    const lines = ['Run history (newest first):']
    for (const entry of entries) {
        const repoStat = entry.repoStats.find((s) => s.repository === repo)
        // queryRepoHistory 已按 repositories.includes 过滤；未命中（索引形状异常）时跳过
        if (!repoStat) {
            continue
        }
        const time = entry.startedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
        lines.push(
            `${time}  alerts=${repoStat.alertsCount} fixed=${repoStat.fixed} failed=${repoStat.failed} duration=${Math.round(entry.durationMs / 1000)}s  runId=${entry.runId}`,
        )
    }
    return lines.join('\n')
}
