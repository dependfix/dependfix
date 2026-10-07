import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import { ScanRun } from '../../entities/scan-run'
import { Repository } from '../../entities/repository'
import { ensureDatabaseInitialized } from '../index'
import {
    applyRunFailureBackfill,
    computeRunFailureBackfill,
    formatRunFailureBackfillStats,
} from './backfill-run-failure'

const clearAllTables = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(ScanRun).clear()
    await ds.getRepository(Repository).clear()
}

const createRepo = async (id: string): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    await repoRepo.save(repoRepo.create({
        id,
        organizationId: null,
        owner: 'test-owner',
        name: `test-repo-${id}`,
        defaultBranch: 'main',
        packageManager: 'pnpm',
        executorKind: 'container',
    }))
}

const seedRun = async (overrides: {
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'dispatched' | 'degraded'
    errorJson?: string | null
    failureCode?: string | null
    failureStage?: 'source' | 'clone' | 'install' | 'fix' | 'verify' | 'deliver' | 'runtime' | 'cleanup' | 'unknown' | null
    failureKind?: 'transient' | 'deterministic' | 'unknown' | null
} = {}): Promise<ScanRun> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(ScanRun)
    const saved = await repo.save(repo.create({
        repositoryId: 'repo-a',
        mode: 'fix',
        severityThreshold: 'high',
        executorKind: 'container',
        status: overrides.status ?? 'failed',
        errorJson: overrides.errorJson ?? null,
        failureCode: overrides.failureCode ?? null,
        failureStage: overrides.failureStage ?? null,
        failureKind: overrides.failureKind ?? null,
    }))
    return Array.isArray(saved) ? saved[0] : saved
}

describe('backfill-run-failure', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        await clearAllTables()
        await createRepo('repo-a')
    })

    it('engine_delivery_failed 从 message 回读类别细分阶段', async () => {
        const ds = await ensureDatabaseInitialized()
        const run = await seedRun({
            errorJson: JSON.stringify({
                code: 'engine_delivery_failed',
                message: '引擎交付阶段失败（VERIFICATION_FAILED）：验证链失败',
            }),
        })

        const stats = await computeRunFailureBackfill(ds)
        expect(stats.fixable).toBe(1)
        expect(stats.unknownStage).toBe(0)
        expect(stats.changes[0]).toMatchObject({
            runId: run.id,
            status: 'failed',
            after: { code: 'VERIFICATION_FAILED', stage: 'verify', kind: 'deterministic' },
        })
    })

    it('无信息 failed 行写 unknown（不猜测）', async () => {
        const ds = await ensureDatabaseInitialized()
        await seedRun({ errorJson: null })

        const stats = await computeRunFailureBackfill(ds)
        expect(stats.fixable).toBe(1)
        expect(stats.unknownStage).toBe(1)
        expect(stats.changes[0]?.after).toEqual({ code: null, stage: 'unknown', kind: 'unknown' })
    })

    it('未映射码保留 code 供审计，阶段归 unknown', async () => {
        const ds = await ensureDatabaseInitialized()
        await seedRun({ errorJson: JSON.stringify({ code: 'brand_new_code', message: 'x' }) })

        const stats = await computeRunFailureBackfill(ds)
        expect(stats.changes[0]?.after).toEqual({ code: 'brand_new_code', stage: 'unknown', kind: 'unknown' })
    })

    it('completed 行残留分类被清空', async () => {
        const ds = await ensureDatabaseInitialized()
        const run = await seedRun({
            status: 'completed',
            failureCode: 'VERIFICATION_FAILED',
            failureStage: 'verify',
            failureKind: 'deterministic',
        })

        await applyRunFailureBackfill(ds)

        const stored = await ds.getRepository(ScanRun).findOneOrFail({ where: { id: run.id } })
        expect(stored.failureCode).toBeNull()
        expect(stored.failureStage).toBeNull()
        expect(stored.failureKind).toBeNull()
    })

    it('dry-run 不写库；apply 写入且幂等（二次 0 变更）', async () => {
        const ds = await ensureDatabaseInitialized()
        const run = await seedRun({ errorJson: JSON.stringify({ code: 'orphan_run', message: 'stale' }) })

        const preview = await computeRunFailureBackfill(ds)
        expect(preview.dryRun).toBe(true)
        expect(preview.fixable).toBe(1)
        // dry-run 未写库
        const untouched = await ds.getRepository(ScanRun).findOneOrFail({ where: { id: run.id } })
        expect(untouched.failureStage).toBeNull()

        const applied = await applyRunFailureBackfill(ds)
        expect(applied.dryRun).toBe(false)
        const stored = await ds.getRepository(ScanRun).findOneOrFail({ where: { id: run.id } })
        expect(stored).toMatchObject({ failureCode: 'orphan_run', failureStage: 'runtime', failureKind: 'transient' })

        // 幂等：二次计算无可订正项
        const second = await computeRunFailureBackfill(ds)
        expect(second.fixable).toBe(0)
    })

    it('脏 errorJson（非法 JSON）不阻塞回填，归 unknown', async () => {
        const ds = await ensureDatabaseInitialized()
        await seedRun({ errorJson: '{ not json' })

        const stats = await computeRunFailureBackfill(ds)
        expect(stats.changes[0]?.after).toEqual({ code: null, stage: 'unknown', kind: 'unknown' })
    })

    it('formatRunFailureBackfillStats 输出计划摘要与明细', async () => {
        const ds = await ensureDatabaseInitialized()
        await seedRun({ errorJson: JSON.stringify({ code: 'clone_timeout', message: 'x' }) })

        const output = formatRunFailureBackfillStats(await computeRunFailureBackfill(ds))
        expect(output).toContain('dry-run')
        expect(output).toContain('需要订正')
        expect(output).toContain('clone')
    })
})
