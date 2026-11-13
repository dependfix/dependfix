// scan-run-post-completion.ts — 「业务结论已成功、异常只发生在收尾」的终态保留。
//
// 反例（2026-11-13 复盘）：有提交且日志 completed exitCode 0 的运行被编排 catch-all 落成
// failed / orchestration_failed，读者无法判断修复是否已交付。收尾异常（reconcile / 落库 /
// 通知准备）不得翻转业务结论：保留状态、结果快照、runUrl 与 PR 号；异常追加进 logsJson，
// 使运行记录本身可见原因（不只留在进程日志）。

import type { DataSource } from 'typeorm'
import type { RunResult } from '@dependfix/core'
import { applyFailureClassification } from './run-failure-classify'
import type { ExecutorResourceUsage } from './executor/types'
import type { ScanRun } from '#server/entities/scan-run'
import { unavailableResourceUsage } from '#server/utils/resource-usage'
import { buildRunSummarySnapshot } from '#server/utils/run-summary-snapshot'

/** 已判定的成功终态（completed / degraded 语义同为业务完整）。 */
export type PostCompletionStatus = 'completed' | 'degraded'

export interface PostCompletionDeps {
    ds: DataSource
    run: ScanRun
    status: PostCompletionStatus
    result: RunResult
    runUrl: string | null
    /**
     * 终态 errorJson 取值：`completed` 传 `null`（清空）；`degraded` 必须传状态机给出的降级原因
     * （`sandbox_unavailable` 等），否则运行详情 / 审计看不到「路径偏离」证据。
     */
    errorJson: { code?: string | null, message?: string | null } | null
    resource?: ExecutorResourceUsage
    logsJson?: string | null
    /** 收尾阶段的原始异常（追加进 logsJson，不改结论） */
    error: unknown
    /** 终态条件写回（与正常路径同一守卫） */
    persist: (ds: DataSource, run: ScanRun) => Promise<{ run: ScanRun, written: boolean }>
    /** 终态通知（由调用方负责 fire-and-forget 与失败捕获） */
    notify: (run: ScanRun) => void
    /** 写回后的收尾副作用（最近扫描时间 / 降级审计事件）；失败不影响结论 */
    onPersisted?: (run: ScanRun) => Promise<void> | void
    logger: { error: (message: string) => void }
}

/**
 * 保留成功结论并写回终态，返回库内行。
 *
 * 只在状态机已判定 `completed` / `degraded` 且已产出 result 时调用；调用方必须先做该判定，
 * 否则会把真正的编排失败（无 result / 状态机判 failed）也保留成成功。
 */
export async function persistPostCompletionOutcome(deps: PostCompletionDeps): Promise<ScanRun> {
    const { ds, run, status, result, resource, logsJson, error, persist, notify, onPersisted, logger } = deps
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
        `[scan-orchestrator] post-completion error after status=${status}: ${message} — `
        + 'keeping the completed outcome and delivery fields',
    )
    run.status = status
    run.finishedAt = new Date()
    run.summaryJson = JSON.stringify(buildRunSummarySnapshot(result))
    run.runUrl = deps.runUrl ?? run.runUrl
    run.errorJson = deps.errorJson ? JSON.stringify(deps.errorJson) : null
    applyFailureClassification(run, { status, error: deps.errorJson ?? null })
    const snapshot = resource ?? unavailableResourceUsage('post-completion error before resource snapshot')
    run.memoryMaxBytes = snapshot.memoryMaxBytes
    run.peakRssBytes = snapshot.peakRssBytes
    run.oomKilled = snapshot.oomKilled
    run.resourceJson = JSON.stringify(snapshot)
    run.logsJson = appendErrorLog(logsJson, `post-completion error after status=${status}: ${message}`)
    const { run: persisted, written } = await persist(ds, run)
    if (written) {
        notify(persisted)
        try {
            await onPersisted?.(persisted)
        } catch (sideEffectError) {
            const reason = sideEffectError instanceof Error ? sideEffectError.message : String(sideEffectError)
            logger.error(`[scan-orchestrator] post-completion side effect failed: ${reason}`)
        }
    }
    return persisted
}

/** 把收尾异常追加到执行日志数组尾部（`LogEntry[]` 形态）；解析失败时保留原值并降级为仅进程日志。 */
function appendErrorLog(logsJson: string | null | undefined, message: string): string | null {
    const entry = { timestamp: new Date().toISOString(), level: 'error' as const, message }
    if (!logsJson) {
        return JSON.stringify([entry])
    }
    try {
        const parsed: unknown = JSON.parse(logsJson)
        const entries = Array.isArray(parsed) ? parsed : [parsed]
        entries.push(entry)
        return JSON.stringify(entries)
    } catch {
        return logsJson
    }
}
