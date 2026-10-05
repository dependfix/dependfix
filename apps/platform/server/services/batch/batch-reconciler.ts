import { In } from 'typeorm'
import { aggregateScanRuns, EMPTY_BATCH_SUMMARY } from './batch-aggregate'
import { persistBatchAggregation, persistBatchIfRunning } from './batch-writeback'
import { ensureDatabaseInitialized } from '#server/database'
import { BatchRun } from '#server/entities/batch-run'
import { ScanResult } from '#server/entities/scan-result'
import { ScanRun } from '#server/entities/scan-run'

/**
 * BatchRun 周期兜底对账。
 *
 * 背景：BatchRun 的计数 / 状态 / summary 原先只由详情接口 `GET /api/batch-runs/[id]` 实时聚合写回
 * （原设计 §5.2「方案 A 轮询更新」）——终态化完全依赖用户查看。`stale-cleanup` 只覆盖「子 run 卡死」
 * 场景（要求至少一个 stale 子 ScanRun），对「子项全部终态但父批次未被查看」与「零子项」两类
 * 主失败模式无覆盖，导致父批次永久 running、进度停留在 0（生产事故实证）。
 *
 * 本服务补上周期兜底通道：扫描全部 `status='running'` 的 BatchRun，聚合子 ScanRun 并写回
 * 终态 / 进度；由 `stale-cleanup` 插件按固定节拍调用。聚合仍复用纯函数，不引入 Worker 回调。
 *
 * 边界：
 * - 零子项且创建超过阈值的 running 批次视为孤儿 → failed（触发进程在建子项前异常 / 子仓库级联删除）；
 *   零子项且未超阈值的批次（async 正在逐个建子项）保持不动。
 * - 有子项但仍有 pending/running → 仅写回进度计数，状态保持 running。
 * - 已终态（completed / failed）批次不在扫描范围内，不会被改写。
 */
export interface ReconcileOptions {
    /** 零子项 running 批次判定为孤儿的阈值（ms）；默认 30 分钟 = 单次执行超时 */
    batchRunTimeoutMs?: number
}

export interface ReconcileResult {
    /** 扫描到的 running 批次数 */
    scanned: number
    /** 本次终结为 completed 的批次数 */
    completed: number
    /** 仅写回进度（仍 running）的批次数 */
    progressUpdated: number
    /** 零子项超阈值后被判定为孤儿 failed 的批次数 */
    orphaned: number
    /** 检查时刻（ISO 字符串，便于审计） */
    checkedAt: string
}

const DEFAULT_BATCH_RUN_TIMEOUT_MS = 30 * 60 * 1000

/** 单次 IN 查询分块大小（SQLite 默认变量上限 999，留余量避免超限） */
const IN_QUERY_CHUNK_SIZE = 500

/** 把数组切成固定大小分块（避免超大 IN 列表触发参数上限 / 内存压力） */
const chunk = <T>(items: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size))
    }
    return out
}

export const reconcileRunningBatchRuns = async (options: ReconcileOptions = {}): Promise<ReconcileResult> => {
    const timeoutMs = options.batchRunTimeoutMs ?? DEFAULT_BATCH_RUN_TIMEOUT_MS
    const now = new Date()
    const cutoff = new Date(now.getTime() - timeoutMs)

    const ds = await ensureDatabaseInitialized()
    const batchRepo = ds.getRepository(BatchRun)
    const runningBatches = await batchRepo.find({ where: { status: 'running' } })

    if (runningBatches.length === 0) {
        return { scanned: 0, completed: 0, progressUpdated: 0, orphaned: 0, checkedAt: now.toISOString() }
    }

    const batchIds = runningBatches.map((batch) => batch.id)
    const scanRunRepo = ds.getRepository(ScanRun)
    const runs: ScanRun[] = []
    for (const ids of chunk(batchIds, IN_QUERY_CHUNK_SIZE)) {
        runs.push(...await scanRunRepo.find({ where: { batchRunId: In(ids) } }))
    }
    const runsByBatch = new Map<string, ScanRun[]>()
    for (const run of runs) {
        if (!run.batchRunId) {
            continue
        }
        const list = runsByBatch.get(run.batchRunId)
        if (list) {
            list.push(run)
        } else {
            runsByBatch.set(run.batchRunId, [run])
        }
    }

    // 一次性加载全部子项的 ScanResult（供 severityCounts 聚合），按 scanRunId 分组
    const runIds = runs.map((run) => run.id)
    const scanResultRepo = ds.getRepository(ScanResult)
    const results: ScanResult[] = []
    for (const ids of chunk(runIds, IN_QUERY_CHUNK_SIZE)) {
        results.push(...await scanResultRepo.find({ where: { scanRunId: In(ids) } }))
    }
    const resultsByRun = new Map<string, ScanResult[]>()
    for (const result of results) {
        const list = resultsByRun.get(result.scanRunId)
        if (list) {
            list.push(result)
        } else {
            resultsByRun.set(result.scanRunId, [result])
        }
    }

    /**
     * 条件写回统一下沉至 `batch-writeback.ts`（persistBatchIfRunning / persistBatchAggregation）：
     * 对账预加载 running 批次后逐条处理，期间 admin 可能 `force-fail`——条件更新保证
     * `failed` 终态幂等保护，不被覆盖回 `completed` / `running`。
     */

    let completed = 0
    let progressUpdated = 0
    let orphaned = 0

    for (const batch of runningBatches) {
        const batchRuns = runsByBatch.get(batch.id) ?? []

        if (batchRuns.length === 0) {
            // 零子项：超阈值 → 孤儿 failed；未超阈值（async 正在建子项）保持不动
            if (batch.createdAt < cutoff) {
                batch.status = 'failed'
                batch.finishedAt = now
                if (!batch.summaryJson) {
                    batch.summaryJson = JSON.stringify(EMPTY_BATCH_SUMMARY)
                }
                if (await persistBatchIfRunning(batchRepo, batch)) {
                    orphaned++
                }
            }
            continue
        }

        const batchResults = batchRuns.flatMap((run) => resultsByRun.get(run.id) ?? [])
        const aggregation = aggregateScanRuns(batchRuns, batchResults)
        const { persisted } = await persistBatchAggregation(batchRepo, batch, aggregation, batchRuns)
        if (persisted) {
            if (aggregation.status === 'completed') {
                completed++
            } else {
                progressUpdated++
            }
        }
    }

    return { scanned: runningBatches.length, completed, progressUpdated, orphaned, checkedAt: now.toISOString() }
}
