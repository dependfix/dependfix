#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-unused-vars -- entity imports 仅触发 TypeORM 装饰器注册副作用（tsx CLI 不走 Nitro auto-load），运行时无实际引用 */
/**
 * backfill-run-failure：把存量 ScanRun 按 `errorJson` 尽力回填失败分类三列。
 *
 * 背景（详见 [run-failure-taxonomy.md §5.6](../../../../docs/design/governance/run-failure-taxonomy.md)）：
 * 新增的 `failure_code` / `failure_stage` / `failure_kind` 三列支持失败阶段筛选，新增列对存量行
 * 为 NULL。本脚本对历史 `failed` / `dispatched` 行按落库的 `errorJson` 归一出阶段与处置建议；
 * 无法判定一律写 `unknown`（不猜测，保守口径）。`completed` / `running` / `pending` / `degraded`
 * 行若残留分类则清空（复用 run 记录场景的防御性订正）。
 *
 * 用法：
 *   pnpm db:backfill:run-failure:dry-run    # 预览订正计划（默认，不写库）
 *   pnpm db:backfill:run-failure            # 实跑（必须 --apply + y/N 确认）
 *
 * 安全门：
 * - 默认 dry-run，只输出计划，不写库
 * - apply 必须显式 --apply + y/N 二次确认
 * - 幂等：仅写与当前列值不同的行（二次运行 0 变更）
 * - 引擎 `result.errors` 未落库，细分依赖 `engine_delivery_failed` message 中回读的类别
 */
import { pathToFileURL } from 'node:url'
import type { DataSource } from 'typeorm'
import { ensureDatabaseInitialized } from '../index'
// 注册 entities 到 TypeORM metadata（tsx CLI 不走 Nitro auto-load；side-effect import）
import { ScanRun } from '../../entities/scan-run'
import { Repository } from '../../entities/repository'
import { Organization } from '../../entities/organization'
import { ScanResult } from '../../entities/scan-result'
import { BatchRun } from '../../entities/batch-run'
import { Credential } from '../../entities/credential'
import { Schedule } from '../../entities/schedule'
import { AuditEvent } from '../../entities/audit-event'
import { PRCheck } from '../../entities/pr-check'
import { User } from '../../entities/user'
import { Session } from '../../entities/session'
import { Account } from '../../entities/account'
import { Verification } from '../../entities/verification'
import {
    classifyRunFailure,
    type RunFailureClassification,
} from '../../services/run-failure-classify'

/** 单条 run 的订正记录 */
export interface RunFailureBackfillChange {
    runId: string
    status: string
    before: RunFailureClassification
    after: RunFailureClassification
}

/** 订正统计（dry-run 与 apply 共用） */
export interface RunFailureBackfillStats {
    /** 扫描的 ScanRun 总数 */
    scanned: number
    /** 需要订正的行数 */
    fixable: number
    /** 订正后 stage=unknown 的行数（无法判定） */
    unknownStage: number
    /** dry-run 模式标记 */
    dryRun: boolean
    /** 按阶段分布（订正后） */
    byStage: Record<string, number>
    /** 订正明细 */
    changes: RunFailureBackfillChange[]
}

/** 防御性解析 errorJson（脏数据 / 非对象 → null，不阻塞回填） */
const parseErrorJson = (raw: string | null): { code?: string | null, message?: string | null } | null => {
    if (!raw) {
        return null
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as { code?: string | null, message?: string | null }
            : null
    } catch {
        return null
    }
}

/** 计算需要回填的计划（纯查询，无副作用） */
export const computeRunFailureBackfill = async (ds: DataSource): Promise<RunFailureBackfillStats> => {
    const runs = await ds.getRepository(ScanRun).find()
    const stats: RunFailureBackfillStats = {
        scanned: runs.length,
        fixable: 0,
        unknownStage: 0,
        dryRun: true,
        byStage: {},
        changes: [],
    }

    for (const run of runs) {
        const after = classifyRunFailure({
            status: run.status,
            error: parseErrorJson(run.errorJson),
        })
        const before: RunFailureClassification = {
            code: run.failureCode ?? null,
            stage: run.failureStage ?? null,
            kind: run.failureKind ?? null,
        }
        if (before.code === after.code && before.stage === after.stage && before.kind === after.kind) {
            continue
        }
        stats.fixable++
        if (after.stage === 'unknown') {
            stats.unknownStage++
        }
        if (after.stage) {
            stats.byStage[after.stage] = (stats.byStage[after.stage] ?? 0) + 1
        }
        stats.changes.push({ runId: run.id, status: run.status, before, after })
    }

    return stats
}

/** 执行回填（事务内写库） */
export const applyRunFailureBackfill = async (ds: DataSource): Promise<RunFailureBackfillStats> => {
    const stats = await computeRunFailureBackfill(ds)
    await ds.transaction(async (manager) => {
        const repo = manager.getRepository(ScanRun)
        for (const change of stats.changes) {
            await repo.update(
                { id: change.runId },
                {
                    failureCode: change.after.code,
                    failureStage: change.after.stage,
                    failureKind: change.after.kind,
                },
            )
        }
    })
    return { ...stats, dryRun: false }
}

/** 格式化统计输出 */
export const formatRunFailureBackfillStats = (stats: RunFailureBackfillStats): string => {
    const lines = [
        '',
        `ScanRun 失败分类回填${stats.dryRun ? '（dry-run 预览）' : '（已实跑）'}`,
        `  扫描运行:       ${stats.scanned}`,
        `  需要订正:       ${stats.fixable}`,
        `  无法判定(unknown): ${stats.unknownStage}`,
        '',
    ]
    const stages = Object.keys(stats.byStage).sort()
    if (stages.length > 0) {
        lines.push('订正后阶段分布:')
        for (const stage of stages) {
            lines.push(`  ${stage.padEnd(12)}${stats.byStage[stage]}`)
        }
        lines.push('')
    }
    if (stats.changes.length > 0) {
        lines.push('订正明细:')
        for (const change of stats.changes.slice(0, 50)) {
            const before = `${change.before.stage ?? 'null'}/${change.before.kind ?? 'null'}`
            const after = `${change.after.stage ?? 'null'}/${change.after.kind ?? 'null'}`
            lines.push(`  ${change.runId.slice(0, 8)} [${change.status}] ${before} → ${after}`)
        }
        if (stats.changes.length > 50) {
            lines.push(`  ... 其余 ${stats.changes.length - 50} 条省略`)
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
backfill-run-failure：ScanRun 存量失败分类回填

用法：
  pnpm db:backfill:run-failure:dry-run   预览订正计划（默认，不写库）
  pnpm db:backfill:run-failure           实跑订正（必须 --apply + y/N 确认）

参数：
  --dry-run    仅输出计划，不写库（默认）
  --apply      实跑订正（必须 + y/N 二次确认）
  --help, -h   显示帮助
        `.trim())
        process.exit(0)
    }

    const ds = await ensureDatabaseInitialized()

    if (!isApply) {
        console.log(formatRunFailureBackfillStats(await computeRunFailureBackfill(ds)))
        process.exit(0)
    }

    const preview = await computeRunFailureBackfill(ds)
    console.log(formatRunFailureBackfillStats(preview))
    console.log('⚠️  即将按上述计划写入 failure_code / failure_stage / failure_kind（无法判定写 unknown）。')
    const readline = await import('node:readline/promises')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('确认实跑？(yes/no): ')
    rl.close()
    if (answer.trim().toLowerCase() !== 'yes' && answer.trim().toLowerCase() !== 'y') {
        console.log('已取消。')
        process.exit(0)
    }
    try {
        console.log(formatRunFailureBackfillStats(await applyRunFailureBackfill(ds)))
    } catch (error) {
        console.error('回填失败，事务已回滚：', error)
        process.exit(1)
    }
}
