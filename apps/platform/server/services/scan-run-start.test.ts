// scan-run-start.test.ts — 运行起点写回的乐观锁语义（不依赖真实数据库）。
import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from 'typeorm'
import { beginScanRunExecution } from './scan-run-start'
import type { ScanRun } from '#server/entities/scan-run'

interface BuilderStub {
    update: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    andWhere: ReturnType<typeof vi.fn>
    execute: ReturnType<typeof vi.fn>
}

function makeDs(options: {
    affected: number
    current?: Partial<ScanRun> | null
}): { ds: DataSource, builder: BuilderStub, setSpy: ReturnType<typeof vi.fn>, findOne: ReturnType<typeof vi.fn> } {
    const builder: BuilderStub = {
        update: vi.fn(),
        set: vi.fn(),
        where: vi.fn(),
        andWhere: vi.fn(),
        execute: vi.fn(async () => ({ affected: options.affected })),
    }
    builder.update.mockReturnValue(builder)
    builder.set.mockReturnValue(builder)
    builder.where.mockReturnValue(builder)
    builder.andWhere.mockReturnValue(builder)
    const findOne = vi.fn(async () => (options.current === null ? null : { id: 'run-1', ...options.current }))
    const ds = {
        getRepository: () => ({ createQueryBuilder: () => builder, findOne }),
    } as unknown as DataSource
    return { ds, builder, setSpy: builder.set, findOne }
}

describe('beginScanRunExecution', () => {
    it('writes running when the observed status is still current', async () => {
        const { ds, setSpy, builder } = makeDs({ affected: 1, current: { status: 'running' } })

        const result = await beginScanRunExecution({
            ds,
            runId: 'run-1',
            observedStatus: 'pending',
            patch: { status: 'pending', buildVersion: '1.0.0' },
        })

        expect(result.started).toBe(true)
        expect(result.run?.status).toBe('running')
        // status 由函数统一设置，调用方无法覆盖
        expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'running', buildVersion: '1.0.0' }))
        expect(builder.andWhere).toHaveBeenCalledWith('status = :observed', { observed: 'pending' })
        // 非复用路径额外限制 pending / running
        expect(builder.andWhere).toHaveBeenCalledWith(
            'status IN (:...startable)',
            { startable: ['pending', 'running'] },
        )
    })

    it('skips the write when the status changed concurrently (affected = 0)', async () => {
        const { ds, findOne } = makeDs({ affected: 0, current: { status: 'failed' } })

        const result = await beginScanRunExecution({
            ds,
            runId: 'run-1',
            observedStatus: 'pending',
            patch: {},
        })

        expect(result).toEqual({ started: false, reason: 'status_changed', currentStatus: 'failed' })
        // 只回读状态，不追加写
        expect(findOne).toHaveBeenCalledTimes(1)
    })

    it('allows terminal reuse but still guards on the observed status', async () => {
        const { ds, builder } = makeDs({ affected: 1, current: { status: 'running' } })

        const result = await beginScanRunExecution({
            ds,
            runId: 'run-1',
            observedStatus: 'completed',
            allowTerminalReuse: true,
            patch: { summaryJson: null },
        })

        expect(result.started).toBe(true)
        // 复用路径只做状态等式守卫（不加 pending / running 限制）
        expect(builder.andWhere).toHaveBeenCalledWith('status = :observed', { observed: 'completed' })
        expect(builder.andWhere).not.toHaveBeenCalledWith(
            'status IN (:...startable)',
            expect.anything(),
        )
    })
})
