// scan-run-start.ts — 运行起点写回的乐观锁（只允许「读到的状态」→ running 一次迁移）。
//
// 背景：起点写回曾用整行 `save`，并发清理侧（stale-cleanup / force-fail）已把同一
// run 置终态时，起点写会把终态「复活」成 running。这里改为条件更新：
// - 队列续跑：只允许 pending / running；
// - 用户主动复用（reuse）：允许终态，但要求库内状态仍等于「读取时的状态」（乐观锁），
//   期间被并发改写即放弃本次起点写回。
// `affected = 0` 时输出结构化告警并返回 `started: false`，由调用方决定跳过 / 报错。

import type { DataSource } from 'typeorm'
import { ScanRun } from '#server/entities/scan-run'
import { logger } from '#server/utils/logger'

/** 允许作为起点写的非终态（队列续跑）。 */
const STARTABLE_STATUSES = ['pending', 'running'] as const

export interface BeginScanRunExecutionParams {
    ds: DataSource
    runId: string
    /** 读取时的库内状态（乐观锁基值） */
    observedStatus: string
    /** 用户主动复用：允许从终态迁移，但仍要求库内状态未变 */
    allowTerminalReuse?: boolean
    /** 起点写回的列（status 固定为 running，由本函数统一设置） */
    patch: Partial<ScanRun>
}

export interface BeginScanRunExecutionResult {
    started: boolean
    /**
     * 未写回的结构化原因：
     * - `status_changed`：读取后状态已变（并发清理 / 另一次执行）
     */
    reason?: 'status_changed'
    currentStatus?: string | null
    run?: ScanRun
}

/**
 * 起点写回：`status='running'` 只在「库内状态仍等于 observedStatus」且（非复用路径）为
 * pending / running 时生效。
 */
export async function beginScanRunExecution(
    params: BeginScanRunExecutionParams,
): Promise<BeginScanRunExecutionResult> {
    const { ds, runId, observedStatus, allowTerminalReuse, patch } = params
    const repo = ds.getRepository(ScanRun)
    const query = repo.createQueryBuilder()
        .update(ScanRun)
        .set({ ...patch, status: 'running' })
        .where('id = :id', { id: runId })
        .andWhere('status = :observed', { observed: observedStatus })
    if (!allowTerminalReuse) {
        query.andWhere('status IN (:...startable)', { startable: [...STARTABLE_STATUSES] })
    }
    const update = await query.execute()
    // affected 缺省（部分驱动）按成功处理——与终态条件写回同口径
    if ((update.affected ?? 1) === 0) {
        const current = await repo.findOne({ where: { id: runId } })
        logger.warn('[scan] run_start_write_skipped', {
            runId,
            observedStatus,
            currentStatus: current?.status ?? 'missing',
            allowTerminalReuse: allowTerminalReuse === true,
        })
        return { started: false, reason: 'status_changed', currentStatus: current?.status ?? null }
    }
    const run = await repo.findOne({ where: { id: runId } })
    if (!run) {
        return { started: false, reason: 'status_changed', currentStatus: null }
    }
    // 回读与条件写之间可能又被并发置终态：只有仍是 running 才算起点成立，
    // 否则按起点失败返回（避免编排层在终态行上白跑一次）
    if (run.status !== 'running') {
        return { started: false, reason: 'status_changed', currentStatus: run.status }
    }
    return { started: true, run }
}
