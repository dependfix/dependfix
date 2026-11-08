import { In, IsNull, LessThan, MoreThanOrEqual } from 'typeorm'
import { applyFailureClassification } from '../run-failure-classify'
import { isTerminalScanRunStatus } from '../scan-run-status'
import { isTerminalScanJobState, type ScanJobInspection } from '../queue/scan-queue'
import { notifyBatchTerminal } from '../notification/batch-notification.service'
import { notifyRunTerminal } from '../notification/run-notification.service'
import { persistBatchFailedIfRunning } from './batch-writeback'
import { ScanRun } from '#server/entities/scan-run'
import { BatchRun } from '#server/entities/batch-run'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * 孤儿运行兜底清理：
 * - ScanRun stale：running 超过「执行超时 + 宽限期」、pending 超过 pending 阈值 →
 *   强制 failed + errorJson 标记 orphan_run；
 * - BatchRun stale：createdAt 距今 > batchRunTimeoutMs，状态仍为 running，
 *   且至少有一个下属 stale ScanRun → 强制 failed + finishedAt（避免 BatchRun 永远聚合 running）。
 *
 * 触发场景：sync 模式进程崩溃 / async worker SIGKILL / GitHub Action runner 永久不回执 /
 * 宿主机重启后 worker 未恢复等导致 ScanRun 已落库为非终态但永远无终态的边界场景。
 *
 * 设计原则：
 * - 仅清理超过执行超时的 running（避免误杀正在执行的长任务）；
 * - pending 不再被「队列里有 job」一票否决：真正排队 / 执行中的 run 不应误杀，但
 *   「队列无消费者」「job 归属的 run 已终态 / 不存在」「job 已终态」都属确定孤儿；
 * - 幂等：仅命中 status='running' / 'pending' 且条件更新 affected > 0 的行，不重复处理终态；
 * - 失败路径抛错给调用方记录日志，下次重试。
 */
export interface QueueJobProbe {
    /** 查询仓库当前 job 现场（不存在 → null） */
    inspect: (repositoryId: string) => Promise<ScanJobInspection | null>
    /** 队列是否存在消费者：true / false / null（未知） */
    hasConsumers: () => Promise<boolean | null>
}

export interface CleanupOptions {
    /**
     * running ScanRun 的基础阈值（ms）；缺省 30 分钟 = `DEFAULT_EXECUTION_TIMEOUT_MS`。
     * 生产调用方（stale-cleanup 插件）传 `resolveExecutionTimeoutMs()` 保持与执行超时同源。
     */
    scanRunTimeoutMs?: number
    /** running 超过基础阈值后的宽限期（ms）；默认 5 分钟，避免与执行器超时收尾竞态 */
    runningGraceMs?: number
    /**
     * pending ScanRun 进入孤儿判定前的等待时长（ms）。
     * 提供 `queueJobProbe` 时默认 5 分钟（无消费者 / job 归属终态可快速收敛）；
     * 仅提供旧 `isPendingOrphan` 时默认取 `scanRunTimeoutMs`，保持既有语义。
     */
    pendingOrphanAgeMs?: number
    /** BatchRun stale 阈值（ms）；默认 30 分钟 */
    batchRunTimeoutMs?: number
    /** 队列现场探针：提供后启用「归属 run / 消费者存在性 / job 状态」三类确定性孤儿判定 */
    queueJobProbe?: QueueJobProbe
    /**
     * 旧版 pending 孤儿判定回调（保留兼容与单测注入）：
     * - 返回 true → 视为孤儿（force failed + orphan_run）
     * - 返回 false → 仍在队列中排队 / 执行，跳过
     * 与 `queueJobProbe` 同时提供时以本回调为准。
     */
    isPendingOrphan?: (run: ScanRun) => Promise<boolean>
}

export interface CleanupResult {
    scanRunsFailed: number
    batchRunsFailed: number
    /** 被 force failed 的孤儿 run（供调用方按 run 归属释放队列去重键） */
    orphanedRuns: OrphanedRunRef[]
    /** 检查时刻（ISO 字符串，便于审计） */
    checkedAt: string
}

/** 孤儿 run 引用：repositoryId 定位队列 jobId，runId 用于归属校验 */
export interface OrphanedRunRef {
    repositoryId: string
    runId: string
}

const DEFAULT_SCAN_RUN_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_RUNNING_GRACE_MS = 5 * 60 * 1000
const DEFAULT_PENDING_ORPHAN_AGE_MS = 5 * 60 * 1000
const DEFAULT_BATCH_RUN_TIMEOUT_MS = 30 * 60 * 1000

/** 失败提示里展示的超时分钟数（running / pending 各取自己的阈值） */
const describeTimeoutMinutes = (ms: number): number => Math.max(1, Math.round(ms / 60000))

/** 释放重试窗口：active 锁未过期导致本轮 remove 失败时，后续轮次仍可再次尝试（幂等） */
const DEFAULT_RELEASE_RETRY_WINDOW_MS = 2 * 60 * 60 * 1000
/** 单轮释放候选上限（避免事故后大规模积压时逐 run 探针拖长清理轮） */
const DEFAULT_RELEASE_CANDIDATE_LIMIT = 200

/**
 * 近期已被判 `orphan_run` 的 run（释放重试候选）。
 *
 * 背景：释放 job 只在本轮新失败的 run 上执行时，若 `active` 锁尚未过期导致 remove 失败，
 * 该 run 已落 failed、下一轮不再进入 `orphanedRuns`，去重键将失去自动回收机会。
 * 本函数按 `failed + failureCode=orphan_run + finishedAt` 窗口补出候选；释放侧按归属幂等处理
 * （job 不存在 / 已归属新 run 时自然跳过）。
 */
export const findRecentOrphanedRuns = async (options: {
    withinMs?: number
    limit?: number
} = {}): Promise<OrphanedRunRef[]> => {
    const withinMs = options.withinMs ?? DEFAULT_RELEASE_RETRY_WINDOW_MS
    const limit = options.limit ?? DEFAULT_RELEASE_CANDIDATE_LIMIT
    const ds = await ensureDatabaseInitialized()
    const runs = await ds.getRepository(ScanRun).find({
        where: {
            status: 'failed',
            failureCode: 'orphan_run',
            finishedAt: MoreThanOrEqual(new Date(Date.now() - withinMs)),
        },
        // ASC：优先重试最早失败（锁最可能已过期）的 run，避免大量积压时最新 200 条反复占用名额
        order: { finishedAt: 'ASC' },
        take: limit,
        select: { id: true, repositoryId: true },
    })
    return runs.map((run) => ({ repositoryId: run.repositoryId, runId: run.id }))
}

export const cleanupStaleRuns = async (options: CleanupOptions = {}): Promise<CleanupResult> => {
    const scanRunTimeoutMs = options.scanRunTimeoutMs ?? DEFAULT_SCAN_RUN_TIMEOUT_MS
    const runningGraceMs = options.runningGraceMs ?? DEFAULT_RUNNING_GRACE_MS
    const batchRunTimeoutMs = options.batchRunTimeoutMs ?? DEFAULT_BATCH_RUN_TIMEOUT_MS
    const pendingOrphanAgeMs = options.pendingOrphanAgeMs
        ?? (options.queueJobProbe ? DEFAULT_PENDING_ORPHAN_AGE_MS : scanRunTimeoutMs)
    const now = new Date()
    const runningCutoff = new Date(now.getTime() - scanRunTimeoutMs - runningGraceMs)
    const pendingCutoff = new Date(now.getTime() - pendingOrphanAgeMs)
    const batchCutoff = new Date(now.getTime() - batchRunTimeoutMs)

    const ds = await ensureDatabaseInitialized()
    const scanRepo = ds.getRepository(ScanRun)
    const batchRepo = ds.getRepository(BatchRun)

    // 1. 找出 stale ScanRun（status in [running, pending] 且超阈值）
    // 注：running 用 startedAt，startedAt 为 NULL 的脏数据回退 createdAt（避免 NULL 比较永不命中）；
    // pending 用 createdAt，是否孤儿由 job 现场 / 旧回调判定——不直接按非终态 job 一票否决
    const staleScanRuns = await scanRepo.find({
        where: [
            { status: 'running', startedAt: LessThan(runningCutoff) },
            { status: 'running', startedAt: IsNull(), createdAt: LessThan(runningCutoff) },
            { status: 'pending', createdAt: LessThan(pendingCutoff) },
        ],
    })

    // 逐 run 精判（仓库级执行上限快照）：查询下界用全局默认（保守、走索引），
    // 候选集里可能包含「按自身 60 分钟上限仍在执行」的运行，必须剔除——否则长预算运行被误杀。
    const nowMs = now.getTime()
    const effectiveStaleScanRuns = staleScanRuns.filter((run) => {
        if (run.status !== 'running') {
            return true
        }
        const startedMs = (run.startedAt ?? run.createdAt).getTime()
        const effectiveTimeoutMs = run.executionTimeoutMs ?? scanRunTimeoutMs
        return startedMs < nowMs - effectiveTimeoutMs - runningGraceMs
    })

    let scanRunsFailed = 0
    const failedRuns: ScanRun[] = []

    /**
     * pending 孤儿判定（顺序 = 确定性从高到低）：
     * 1. 旧回调（调用方显式注入）优先；
     * 2. job 不存在 / job 已终态 → 孤儿；
     * 3. job 归属另一个 run 且该 run 已终态或不存在 → 孤儿；
     * 4. 队列无消费者且已超过 pending 阈值 → 孤儿；
     * 5. 其余视为合法排队 / 执行。
     *
     * 查询失败按「仍在队列中」保守跳过，避免 Redis 抖动误杀。
     */
    const resolvePendingOrphan = async (run: ScanRun): Promise<boolean> => {
        if (options.isPendingOrphan) {
            return options.isPendingOrphan(run)
        }
        if (!options.queueJobProbe) {
            return true
        }
        const job = await options.queueJobProbe.inspect(run.repositoryId)
        if (!job) {
            return true
        }
        if (isTerminalScanJobState(job.state)) {
            return true
        }
        // 归属不同：job 承载的是另一个 run。其 owner 已终态 / 不存在 → 当前 run 的 job 已丢失
        if (job.runId && job.runId !== run.id) {
            const owner = await scanRepo.findOne({ where: { id: job.runId }, select: { id: true, status: true } })
            if (!owner || isTerminalScanRunStatus(owner.status)) {
                return true
            }
        }
        // worker 进程不存在：waiting / active job 都不会再被消费（active 锁过期后也无人接手）。
        // 要求 job 年龄 ≥ 2× pending 宽限（缺省 10 分钟）：worker 滚动重启 / 连接短暂为 0 时
        // 不误杀刚入队或尚在恢复窗口内的任务；同时避免「单次采样为 0」直接落 failed。
        const hasConsumers = await options.queueJobProbe.hasConsumers()
        if (hasConsumers === false && job.ageMs >= pendingOrphanAgeMs * 2) {
            return true
        }
        return false
    }

    for (const run of effectiveStaleScanRuns) {
        if (run.status === 'pending') {
            let orphan = true
            try {
                orphan = await resolvePendingOrphan(run)
            } catch (error) {
                // 队列 / 归属查询失败（Redis 抖动 / DB 瞬时错误）：保守判定为"仍在队列中"，
                // 避免误杀合法排队 run；下一轮再试
                console.warn(`[stale-cleanup] pending run ${run.id} 孤儿判定失败，跳过:`, error)
                orphan = false
            }
            if (!orphan) {
                continue
            }
        }

        const timeoutMs = run.status === 'running' ? scanRunTimeoutMs + runningGraceMs : pendingOrphanAgeMs
        const orphanFailure = {
            code: 'orphan_run',
            message: `超过 ${describeTimeoutMinutes(timeoutMs)} 分钟未到达终态，已被 stale cleanup 自动标记为失败`,
        }
        // 先按终态写回内存实体（供失败分类派生），再条件更新——条件更新避免覆盖并发完成的 run
        run.status = 'failed'
        run.finishedAt = now
        run.errorJson = JSON.stringify(orphanFailure)
        applyFailureClassification(run, { status: 'failed', error: orphanFailure })
        const update = await scanRepo.createQueryBuilder()
            .update(ScanRun)
            .set({
                status: 'failed',
                finishedAt: now,
                errorJson: run.errorJson,
                failureCode: run.failureCode ?? null,
                failureStage: run.failureStage ?? null,
                failureKind: run.failureKind ?? null,
                updatedAt: now,
            })
            .where('id = :id', { id: run.id })
            .andWhere('status IN (:...statuses)', { statuses: ['pending', 'running'] })
            .execute()
        // affected 缺省（部分驱动）按成功处理：与改动前「save 后即计入」口径一致
        if ((update.affected ?? 1) === 0) {
            continue
        }
        failedRuns.push(run)
        scanRunsFailed++
        void notifyRunTerminal(run).catch((notifyError) => {
            console.error('[notification] run terminal notify failed:', notifyError)
        })
    }

    const orphanedRuns: OrphanedRunRef[] = failedRuns.map((run) => ({
        repositoryId: run.repositoryId,
        runId: run.id,
    }))

    // 2. 找出 stale BatchRun（status='running' 且 createdAt < batchCutoff 且至少有一个下属 stale run）
    // 注：仅当下属确实存在 stale run 时才认为该 BatchRun 是孤儿 — 避免误杀"运行中但慢"的合法批次
    const staleBatchRunIds = new Set<string>()
    for (const run of failedRuns) {
        if (run.batchRunId) {
            staleBatchRunIds.add(run.batchRunId)
        }
    }
    const staleBatchCandidates = staleBatchRunIds.size > 0
        ? await batchRepo.find({
            where: {
                status: 'running',
                createdAt: LessThan(batchCutoff),
                id: In(Array.from(staleBatchRunIds)),
            },
        })
        : []

    let batchRunsFailed = 0
    for (const batch of staleBatchCandidates) {
        // 条件失败写回（乐观锁 = 读取时 running）：只写 status / finishedAt（+ 空 summary 兜底），
        // 不整行 save —— 候选实体为读取期快照，整行写会把并发聚合的计数覆盖回旧值
        const persisted = await persistBatchFailedIfRunning(batchRepo, batch, {
            finishedAt: now,
            fillEmptySummary: true,
        })
        if (persisted) {
            batchRunsFailed++
            void notifyBatchTerminal(batch).catch((notifyError) => {
                console.error('[notification] batch terminal notify failed:', notifyError)
            })
        }
    }

    return {
        scanRunsFailed,
        batchRunsFailed,
        orphanedRuns,
        checkedAt: now.toISOString(),
    }
}
