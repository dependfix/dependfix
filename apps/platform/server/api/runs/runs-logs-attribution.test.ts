// runs-logs-attribution.test.ts — 日志导出的失败归因小节。
//
// 背景（2026-11-01 复盘）：无日志的 failed 运行导出只有「（无执行日志）」，
// 离线无法区分 orchestration_failed / push_failed；导出需带错误码、失败阶段与资源信号。
import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import logsExportHandler from './logs-export.get'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const callExport = (query = '') => {
    const event = makeEvent('GET', `/api/runs/logs-export${query}`)
    return logsExportHandler(event)
}

describe('日志导出：失败归因', () => {
    let repositoryId: string

    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: `attribution-${Math.random().toString(36).slice(2, 8)}`,
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = created.id
    })

    it('无日志的失败运行导出失败归因而非空白', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(ScanRun)
        await repo.save(repo.create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'failed',
            startedAt: new Date('2026-10-01T00:00:00Z'),
            logsJson: null,
            errorJson: JSON.stringify({ code: 'execution_timeout', message: 'timed out' }),
            failureStage: 'execute' as never,
            failureKind: 'timeout' as never,
            oomKilled: false,
            peakRssBytes: 64 * 1024 * 1024,
        }))

        const body = await callExport(`?repositoryId=${repositoryId}`) as string

        expect(body).toContain('（无执行日志）')
        expect(body).toContain('# 失败归因：错误码：execution_timeout | 失败阶段：execute | 失败类别：timeout | 峰值 RSS：64 MB')
    })

    it('外联违规随导出可见（计数 + 最小化目标）', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(ScanRun)
        await repo.save(repo.create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'sandbox',
            status: 'completed',
            startedAt: new Date('2026-10-02T00:00:00Z'),
            summaryJson: JSON.stringify({
                repositoriesScanned: 1,
                networkViolations: 2,
                networkViolationTargets: [
                    { source: 'proxy', method: 'CONNECT', target: 'evil.example.com' },
                    { source: 'command-output', method: 'GET', target: 'cdn.example.com' },
                ],
            }),
            logsJson: JSON.stringify([{ timestamp: '2026-10-02T00:00:00.000Z', level: 'info', message: 'fix done' }]),
        }))

        const body = await callExport(`?repositoryId=${repositoryId}`) as string

        expect(body).toContain('外联违规：2')
        expect(body).toContain('外联目标：evil.example.com, cdn.example.com')
    })

    it('成功运行不输出失败归因行', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(ScanRun)
        await repo.save(repo.create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            startedAt: new Date('2026-10-01T00:00:00Z'),
            logsJson: JSON.stringify([{ timestamp: '2026-10-01T00:00:00.000Z', level: 'info', message: 'ok' }]),
        }))

        const body = await callExport(`?repositoryId=${repositoryId}`) as string

        expect(body).toContain('ok')
        expect(body).not.toContain('# 失败归因：')
    })
})
