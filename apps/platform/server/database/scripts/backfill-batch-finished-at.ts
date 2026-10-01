#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-unused-vars -- entity imports 仅触发 TypeORM 装饰器注册副作用（tsx CLI 不走 Nitro auto-load），运行时无实际引用 */
/**
 * backfill-batch-finished-at：一次性数据订正脚本。
 *
 * 背景（详见 docs/plan/todo-archive.md「M35 批量运行终态兜底对账」）：
 * - BatchRun 早期聚合口径把 `finishedAt` 写成「聚合触发时刻」= 用户首次查看详情的时刻
 * - 生产事故实证：4 条 2026-09-04~09-29 的批次 `finished_at` 全为同一时刻（本地 2026-10-02 00:39，
 *   间隔数秒）= 逐行展开动作的时间戳，而非真实完成时间
 * - 本脚本：对「有带 finishedAt 子项」的 BatchRun，把 `finishedAt` 重算为 `max(子项 finishedAt)`
 *
 * 用法：
 *   pnpm db:backfill:batch-finished-at:dry-run    # 预览订正计划（默认，不写库）
 *   pnpm db:backfill:batch-finished-at            # 实跑（必须 --apply + y/N 确认）
 *
 * 安全门：
 * - 默认 dry-run，只输出计划，不写库
 * - apply 必须显式 --apply + y/N 二次确认
 * - 无带 finishedAt 子项的批次跳过（无真实完成时间，不伪造）
 */
import { pathToFileURL } from 'node:url'
import type { DataSource } from 'typeorm'
import { ensureDatabaseInitialized } from '../index'
// 注册 entities 到 TypeORM metadata（tsx CLI 不走 Nitro auto-load；side-effect import）
import { BatchRun } from '../../entities/batch-run'
import { ScanRun } from '../../entities/scan-run'
import { Repository } from '../../entities/repository'
import { ScanResult } from '../../entities/scan-result'
import { User } from '../../entities/user'
import { Session } from '../../entities/session'
import { Account } from '../../entities/account'
import { Verification } from '../../entities/verification'
import { Credential } from '../../entities/credential'
import { Organization } from '../../entities/organization'
import { Schedule } from '../../entities/schedule'
import { AuditEvent } from '../../entities/audit-event'

/** 单条批次订正记录 */
export interface BatchFinishedAtFix {
    batchRunId: string
    status: string
    oldFinishedAt: string | null
    newFinishedAt: string
}

/** 订正统计（dry-run 与 apply 共用） */
export interface BatchFinishedAtStats {
    /** 扫描的 BatchRun 总数 */
    scanned: number
    /** 需要订正的批次数 */
    fixable: number
    /** 无带 finishedAt 子项、跳过的批次数 */
    skippedNoChild: number
    /** running 批次（终态未定，交由周期对账）、跳过的批次数 */
    skippedRunning: number
    /** dry-run 模式标记 */
    dryRun: boolean
    /** 订正明细 */
    fixes: BatchFinishedAtFix[]
}

/** 计算需要订正的 finishedAt 计划（纯查询，无副作用） */
export const computeBatchFinishedAtFixes = async (ds: DataSource): Promise<BatchFinishedAtStats> => {
    const batches = await ds.getRepository(BatchRun).find()
    const scanRuns = await ds.getRepository(ScanRun).find()

    const latestByBatch = new Map<string, number>()
    for (const run of scanRuns) {
        if (!run.batchRunId || !run.finishedAt) {
            continue
        }
        const time = run.finishedAt.getTime()
        const current = latestByBatch.get(run.batchRunId) ?? 0
        if (time > current) {
            latestByBatch.set(run.batchRunId, time)
        }
    }

    const stats: BatchFinishedAtStats = {
        scanned: batches.length,
        fixable: 0,
        skippedNoChild: 0,
        skippedRunning: 0,
        dryRun: true,
        fixes: [],
    }

    for (const batch of batches) {
        // 仅订正已终态批次：running 批次的 finishedAt 由周期对账按「全部子项终态」判定后写入，
        // 此处提前写 max(已终态子项) 会被 applyBatchAggregation 的「仅首次写入」护栏固化（过早值）
        if (batch.status === 'running') {
            stats.skippedRunning++
            continue
        }
        const latest = latestByBatch.get(batch.id)
        if (!latest) {
            stats.skippedNoChild++
            continue
        }
        const newFinishedAt = new Date(latest)
        if (batch.finishedAt?.getTime() === latest) {
            continue
        }
        stats.fixable++
        stats.fixes.push({
            batchRunId: batch.id,
            status: batch.status,
            oldFinishedAt: batch.finishedAt ? batch.finishedAt.toISOString() : null,
            newFinishedAt: newFinishedAt.toISOString(),
        })
    }

    return stats
}

/** 执行订正（事务内写库） */
export const applyBatchFinishedAtFixes = async (ds: DataSource): Promise<BatchFinishedAtStats> => {
    const stats = await computeBatchFinishedAtFixes(ds)
    await ds.transaction(async (manager) => {
        const repo = manager.getRepository(BatchRun)
        for (const fix of stats.fixes) {
            await repo.update({ id: fix.batchRunId }, { finishedAt: new Date(fix.newFinishedAt) })
        }
    })
    return { ...stats, dryRun: false }
}

/** 格式化统计输出 */
export const formatBatchFinishedAtStats = (stats: BatchFinishedAtStats): string => {
    const lines = [
        '',
        `BatchRun finishedAt 订正${stats.dryRun ? '（dry-run 预览）' : '（已实跑）'}`,
        `  扫描批次:     ${stats.scanned}`,
        `  需要订正:     ${stats.fixable}`,
        `  跳过（无子项）: ${stats.skippedNoChild}`,
        `  跳过（running）: ${stats.skippedRunning}`,
        '',
    ]
    if (stats.fixes.length > 0) {
        lines.push('订正明细:')
        for (const fix of stats.fixes.slice(0, 50)) {
            lines.push(`  ${fix.batchRunId.slice(0, 8)} [${fix.status}] ${fix.oldFinishedAt ?? 'null'} → ${fix.newFinishedAt}`)
        }
        if (stats.fixes.length > 50) {
            lines.push(`  ... 其余 ${stats.fixes.length - 50} 条省略`)
        }
        lines.push('')
    }
    return lines.join('\n')
}

function isExecutedAsEntryPoint(): boolean {
    const entry = process.argv[1]
    if (!entry) {
        return false
    }
    return import.meta.url === pathToFileURL(entry).href
}

if (isExecutedAsEntryPoint()) {
    const args = process.argv.slice(2)
    const isApply = args.includes('--apply')
    const isHelp = args.includes('--help') || args.includes('-h')

    if (isHelp) {
        console.log(`
backfill-batch-finished-at：BatchRun finishedAt 存量订正

用法：
  pnpm db:backfill:batch-finished-at:dry-run   预览订正计划（默认，不写库）
  pnpm db:backfill:batch-finished-at           实跑订正（必须 --apply + y/N 确认）

参数：
  --dry-run    仅输出计划，不写库（默认）
  --apply      实跑订正（必须 + y/N 二次确认）
  --help, -h   显示帮助
        `.trim())
        process.exit(0)
    }

    const ds = await ensureDatabaseInitialized()

    if (!isApply) {
        console.log(formatBatchFinishedAtStats(await computeBatchFinishedAtFixes(ds)))
        process.exit(0)
    }

    const preview = await computeBatchFinishedAtFixes(ds)
    console.log(formatBatchFinishedAtStats(preview))
    console.log('⚠️  即将把上述批次的 finishedAt 重算为 max(子项 finishedAt)。')
    const readline = await import('node:readline/promises')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('确认实跑？(yes/no): ')
    rl.close()
    if (answer.trim().toLowerCase() !== 'yes' && answer.trim().toLowerCase() !== 'y') {
        console.log('已取消。')
        process.exit(0)
    }
    try {
        console.log(formatBatchFinishedAtStats(await applyBatchFinishedAtFixes(ds)))
    } catch (error) {
        console.error('订正失败，事务已回滚：', error)
        process.exit(1)
    }
}
