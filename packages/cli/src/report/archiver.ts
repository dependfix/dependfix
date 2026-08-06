// archiver.ts（M4 T404）
// 报告归档与趋势统计：dependfix-reports/{YYYY-MM}/{runId}/ 多仓库各自 md/json + 汇总 json，
// 并维护 dependfix-reports/index.json 趋势索引。
// 现有 writeReport（dependfix-report-*.md|.json 平铺输出）保持不变（向后兼容）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    createEmptyRunSummary,
    generateJsonReport,
    generateMarkdownReport,
    type RepositoryResult,
    type RunResult,
} from '@dependfix/core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchiveRepoStats {
    repository: string
    alertsCount: number
    fixable: number
    fixed: number
    failed: number
    lockfileRepaired: boolean
    durationMs: number
}

/** index.json 单条趋势记录（字段与 RunSummary/RepositoryResult 口径一致）。 */
export interface ArchiveRunEntry {
    runId: string
    startedAt: string
    /** 本次运行总时长（finishedAt - startedAt，毫秒） */
    durationMs: number
    repositories: string[]
    /** 全局汇总（复用 RunSummary 字段口径） */
    summary: ReturnType<typeof createEmptyRunSummary>
    /** 按仓库统计（趋势基础字段） */
    repoStats: ArchiveRepoStats[]
}

export interface ArchiveIndex {
    runs: ArchiveRunEntry[]
}

export interface ArchiveResult {
    /** 汇总 json 路径 */
    summaryJsonPath: string
    /** 单仓库报告文件路径列表 */
    repoArtifacts: string[]
}

// ---------------------------------------------------------------------------
// Archive writer
// ---------------------------------------------------------------------------

/**
 * 归档一次运行结果：
 * - `{outputDir}/{YYYY-MM}/{runId}/summary.json`：全局 RunResult 汇总（同字段口径）
 * - `{outputDir}/{YYYY-MM}/{runId}/{owner}-{repo}.md|.json`：每仓库报告切分
 * - 更新 `{outputDir}/index.json`（runId 幂等：重复归档同一 runId 覆盖旧条目）
 *
 * 现有 `writeReport` 平铺输出不受影响（向后兼容）。
 */
export function writeArchive(runResult: RunResult, outputDir = './dependfix-reports'): ArchiveResult {
    const monthDir = extractYearMonth(runResult.startedAt)
    const runDir = join(outputDir, monthDir, runResult.runId)
    mkdirSync(runDir, { recursive: true })

    const summaryJsonPath = join(runDir, 'summary.json')
    writeFileSync(summaryJsonPath, generateJsonReport(runResult), 'utf-8')

    const repoArtifacts: string[] = []
    for (const repoResult of runResult.repositories) {
        const slug = repoSlug(repoResult.repository)
        if (!slug) {
            continue
        }
        const repoRun = sliceRunResultByRepo(runResult, repoResult)
        const mdPath = join(runDir, `${slug}.md`)
        const jsonPath = join(runDir, `${slug}.json`)
        writeFileSync(mdPath, generateMarkdownReport(repoRun), 'utf-8')
        writeFileSync(jsonPath, generateJsonReport(repoRun), 'utf-8')
        repoArtifacts.push(mdPath, jsonPath)
    }

    const index = readArchiveIndex(outputDir)
    const entry: ArchiveRunEntry = buildArchiveEntry(runResult)
    const existingIdx = index.runs.findIndex((r) => r.runId === entry.runId)
    if (existingIdx >= 0) {
        index.runs[existingIdx] = entry
    } else {
        index.runs.push(entry)
    }
    writeFileSync(join(outputDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf-8')

    return { summaryJsonPath, repoArtifacts }
}

// ---------------------------------------------------------------------------
// History queries
// ---------------------------------------------------------------------------

/** 读取归档索引（不存在时返回空索引；条目级字段兜底防旧版/手写索引形状异常）。 */
export function readArchiveIndex(outputDir = './dependfix-reports'): ArchiveIndex {
    const indexPath = join(outputDir, 'index.json')
    if (!existsSync(indexPath)) {
        return { runs: [] }
    }
    try {
        const parsed = JSON.parse(readFileSync(indexPath, 'utf-8')) as ArchiveIndex
        return {
            runs: Array.isArray(parsed.runs)
                ? parsed.runs
                    .filter((r) => r && typeof r === 'object')
                    .map((r) => ({
                        ...r,
                        repositories: Array.isArray(r.repositories) ? r.repositories : [],
                        summary: r.summary && typeof r.summary === 'object'
                            ? { ...createEmptyRunSummary(), ...r.summary }
                            : createEmptyRunSummary(),
                        repoStats: Array.isArray(r.repoStats) ? r.repoStats : [],
                    }))
                : [],
        }
    } catch {
        // 索引损坏：返回空（不阻塞 history 查询，也不覆盖写坏数据——写盘时按空索引追加）
        return { runs: [] }
    }
}

/**
 * 查询某仓库的历史运行摘要（倒序时间：最新在前）。
 * 仅返回包含该仓库的运行；无结果返回 []。
 */
export function queryRepoHistory(
    repo: string,
    outputDir = './dependfix-reports',
): ArchiveRunEntry[] {
    const index = readArchiveIndex(outputDir)
    return index.runs
        .filter((r) => r.repositories.includes(repo))
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 从 ISO 时间提取 `YYYY-MM`（归档目录层级）。 */
function extractYearMonth(iso: string): string {
    const match = /^(\d{4})-(\d{2})/.exec(iso)
    return match ? `${match[1]}-${match[2]}` : new Date().toISOString().slice(0, 7)
}

/** `owner/repo` → `owner-repo`（归档文件名，兼容 `local` 等无斜杠名）。 */
function repoSlug(repo: string): string {
    return repo.replace(/[^a-zA-Z0-9_.-]/g, '-')
}

/**
 * 构造按仓库切分的 RunResult 视图：
 * - repositories 仅含该仓库
 * - alerts / actions / errors 过滤该仓库
 * - summary 保持全局（字段口径一致；跨仓库计数不在此层拆分）
 */
function sliceRunResultByRepo(runResult: RunResult, repoResult: RepositoryResult): RunResult {
    return {
        ...runResult,
        repositories: [repoResult],
        alerts: runResult.alerts.filter((a) => a.repository === repoResult.repository),
        actions: runResult.actions.filter((a) => a.repository === repoResult.repository),
        errors: runResult.errors.filter((e) => e.repository === repoResult.repository),
    }
}

function buildArchiveEntry(runResult: RunResult): ArchiveRunEntry {
    const startedMs = new Date(runResult.startedAt).getTime()
    const finishedMs = new Date(runResult.finishedAt).getTime()
    const durationMs = Number.isFinite(startedMs) && Number.isFinite(finishedMs)
        ? Math.max(0, finishedMs - startedMs)
        : 0
    return {
        runId: runResult.runId,
        startedAt: runResult.startedAt,
        durationMs,
        repositories: runResult.repositories.map((r) => r.repository),
        summary: {
            ...createEmptyRunSummary(),
            ...runResult.summary,
        },
        repoStats: runResult.repositories.map((r) => ({
            repository: r.repository,
            alertsCount: r.alertsCount,
            fixable: r.fixable,
            fixed: r.fixed,
            failed: r.failed,
            lockfileRepaired: r.lockfileRepaired,
            durationMs: r.durationMs,
        })),
    }
}
