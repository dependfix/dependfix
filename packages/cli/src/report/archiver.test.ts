import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    createEmptyRunSummary,
    type RunResult,
} from '@dependfix/core'
import {
    queryRepoHistory,
    readArchiveIndex,
    writeArchive,
} from './archiver'

function makeRunResult(overrides: Partial<RunResult> = {}): RunResult {
    return {
        runId: 'dependfix-test-abc123',
        startedAt: '2026-08-06T10:00:00.000Z',
        finishedAt: '2026-08-06T10:00:05.000Z',
        config: {
            mode: 'report-only',
            severityThreshold: 'high',
            repositories: ['foo/bar'],
            dryRun: true,
            createPullRequest: false,
            maxAlertsPerRepository: 20,
            alertSource: 'github-dependabot',
        },
        summary: {
            ...createEmptyRunSummary(),
            repositoriesScanned: 1,
            alertsFound: 3,
            alertsFixable: 2,
            alertsFixed: 1,
        },
        repositories: [{
            repository: 'foo/bar',
            defaultBranch: 'main',
            alertsCount: 3,
            fixable: 2,
            fixed: 1,
            failed: 0,
            lockfileRepaired: false,
            durationMs: 5000,
        }],
        alerts: [],
        actions: [],
        errors: [],
        ...overrides,
    }
}

describe('writeArchive', () => {
    let workDir: string
    let outputDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-archive-'))
        outputDir = join(workDir, 'dependfix-reports')
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('writes summary.json + per-repo md/json + index.json with month/runId structure', () => {
        const runResult = makeRunResult()
        const { summaryJsonPath, repoArtifacts } = writeArchive(runResult, outputDir)

        const runDir = join(outputDir, '2026-08', runResult.runId)
        expect(summaryJsonPath).toBe(join(runDir, 'summary.json'))
        expect(existsSync(join(runDir, 'summary.json'))).toBe(true)
        expect(existsSync(join(runDir, 'foo-bar.md'))).toBe(true)
        expect(existsSync(join(runDir, 'foo-bar.json'))).toBe(true)
        expect(repoArtifacts).toHaveLength(2)

        // 汇总 json 与单仓库报告同字段口径（RunResult 结构）
        const summary = JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf-8'))
        expect(summary.runId).toBe(runResult.runId)
        expect(summary.summary.alertsFound).toBe(3)
        const repoJson = JSON.parse(readFileSync(join(runDir, 'foo-bar.json'), 'utf-8'))
        expect(repoJson.repositories).toHaveLength(1)
        expect(repoJson.repositories[0].repository).toBe('foo/bar')

        // index.json 趋势条目
        const index = readArchiveIndex(outputDir)
        expect(index.runs).toHaveLength(1)
        const entry = index.runs[0]
        expect(entry.runId).toBe(runResult.runId)
        expect(entry.repositories).toEqual(['foo/bar'])
        expect(entry.summary.alertsFound).toBe(3)
        expect(entry.repoStats[0]).toMatchObject({
            repository: 'foo/bar',
            alertsCount: 3,
            fixed: 1,
            failed: 0,
        })
        expect(entry.durationMs).toBe(5000)
    })

    it('is idempotent for the same runId (overwrites entry) and appends new runs', () => {
        const runA = makeRunResult()
        const runB = makeRunResult({
            runId: 'dependfix-test-def456',
            startedAt: '2026-08-06T11:00:00.000Z',
            repositories: [{
                repository: 'other/app',
                defaultBranch: 'main',
                alertsCount: 1,
                fixable: 0,
                fixed: 0,
                failed: 1,
                lockfileRepaired: false,
                durationMs: 1000,
            }],
        })

        writeArchive(runA, outputDir)
        writeArchive(runA, outputDir) // 同 runId 重复 → 覆盖而非追加
        writeArchive(runB, outputDir)

        const index = readArchiveIndex(outputDir)
        expect(index.runs).toHaveLength(2)
        expect(index.runs.filter((r) => r.runId === runA.runId)).toHaveLength(1)
    })

    it('handles month rollover directories', () => {
        const runA = makeRunResult()
        const runB = makeRunResult({
            runId: 'dependfix-test-jan',
            startedAt: '2026-01-15T09:00:00.000Z',
            finishedAt: '2026-01-15T09:00:02.000Z',
        })

        writeArchive(runA, outputDir)
        writeArchive(runB, outputDir)

        expect(existsSync(join(outputDir, '2026-08', runA.runId, 'summary.json'))).toBe(true)
        expect(existsSync(join(outputDir, '2026-01', runB.runId, 'summary.json'))).toBe(true)
        expect(readArchiveIndex(outputDir).runs).toHaveLength(2)
    })

    it('skips repos with empty repository names in file naming', () => {
        const runResult = makeRunResult({
            repositories: [{
                repository: '',
                defaultBranch: '',
                alertsCount: 0,
                fixable: 0,
                fixed: 0,
                failed: 0,
                lockfileRepaired: false,
                durationMs: 0,
            }],
        })

        const { repoArtifacts } = writeArchive(runResult, outputDir)
        expect(repoArtifacts).toEqual([])
    })
})

describe('queryRepoHistory', () => {
    let workDir: string
    let outputDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-history-'))
        outputDir = join(workDir, 'dependfix-reports')
        writeArchive(makeRunResult({
            runId: 'dependfix-test-1',
            startedAt: '2026-08-06T08:00:00.000Z',
        }), outputDir)
        writeArchive(makeRunResult({
            runId: 'dependfix-test-2',
            startedAt: '2026-08-06T09:00:00.000Z',
        }), outputDir)
        writeArchive(makeRunResult({
            runId: 'dependfix-test-3',
            startedAt: '2026-08-06T10:00:00.000Z',
            repositories: [{
                repository: 'other/app',
                defaultBranch: 'main',
                alertsCount: 1,
                fixable: 0,
                fixed: 0,
                failed: 0,
                lockfileRepaired: false,
                durationMs: 1000,
            }],
        }), outputDir)
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('returns repo runs in reverse chronological order', () => {
        const history = queryRepoHistory('foo/bar', outputDir)
        expect(history).toHaveLength(2)
        expect(history[0].runId).toBe('dependfix-test-2')
        expect(history[1].runId).toBe('dependfix-test-1')
        // 趋势基础字段可查询（repoStats 仓库级计数随时间变化）
        expect(history.map((h) => h.repoStats[0].alertsCount)).toEqual([3, 3])
        expect(history.map((h) => h.repoStats[0].fixed)).toEqual([1, 1])
    })

    it('returns per-repo stats when a run covered multiple repositories', () => {
        // 双仓库一次运行：repoStats 各自计数（--history 消费仓库级而非全局 summary）
        writeArchive(makeRunResult({
            runId: 'dependfix-test-multi',
            startedAt: '2026-08-06T12:00:00.000Z',
            repositories: [
                {
                    repository: 'foo/bar',
                    defaultBranch: 'main',
                    alertsCount: 3,
                    fixable: 2,
                    fixed: 1,
                    failed: 1,
                    lockfileRepaired: false,
                    durationMs: 1000,
                },
                {
                    repository: 'other/app',
                    defaultBranch: 'main',
                    alertsCount: 1,
                    fixable: 1,
                    fixed: 1,
                    failed: 0,
                    lockfileRepaired: false,
                    durationMs: 2000,
                },
            ],
        }), outputDir)

        const history = queryRepoHistory('foo/bar', outputDir)
        expect(history).toHaveLength(3)
        expect(history[0].runId).toBe('dependfix-test-multi')
        const barStat = history[0].repoStats.find((s) => s.repository === 'foo/bar')
        expect(barStat).toMatchObject({ alertsCount: 3, fixed: 1, failed: 1 })
        const appStat = history[0].repoStats.find((s) => s.repository === 'other/app')
        expect(appStat).toMatchObject({ alertsCount: 1, fixed: 1, failed: 0 })
    })

    it('returns empty for unknown repo', () => {
        expect(queryRepoHistory('nope/missing', outputDir)).toEqual([])
    })

    it('returns empty for missing index file', () => {
        const empty = join(workDir, 'empty-reports')
        expect(queryRepoHistory('foo/bar', empty)).toEqual([])
    })

    it('recovers from corrupted index.json', () => {
        writeFileSync(join(outputDir, 'index.json'), '{ broken json', 'utf-8')
        expect(readArchiveIndex(outputDir)).toEqual({ runs: [] })
        expect(queryRepoHistory('foo/bar', outputDir)).toEqual([])
    })
})
