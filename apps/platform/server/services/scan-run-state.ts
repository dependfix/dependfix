import type { RunResult } from '@dependfix/core'

/** 状态机决策结果 */
export interface ScanRunStateDecision {
    status: 'completed' | 'failed' | 'dispatched'
    /** 需要写入 ScanRun.errorJson 的提示（dispatched 但结果未就绪时） */
    errorJson?: { code: string, message: string } | null
}

/**
 * 扫描状态机决策（纯函数，可单测）。
 *
 * B 模式（github-action）三分支：
 * - 触发已受理但结果未就绪（`result_fetch_failed` / `run_url_not_resolved`）→ dispatched
 *   （action 已在目标仓库运行，不误报 failed；注意 run_url_not_resolved 时 executor 仍返回最小 result）
 * - 触发级失败（workflow 未配置/不存在/无权限，action 未运行）→ failed
 * - 结果已拉取 → completed
 *
 * A 模式（container）：
 * - push 成功 + PR 失败（`pr_creation_failed`，分支已推）→ dispatched
 *   （与 B 模式 `dispatched` 语义对齐：副作用已落库，runUrl 仍可访问，便于用户手动重试）
 * - 其他执行级失败（push_failed / execution_failed / execution_timeout）→ failed（不写半截结果）
 * - 成功（push + PR 都成功）→ completed
 */
export const resolveScanRunState = (
    executorKind: 'container' | 'github-action',
    error: { code: string, message: string } | undefined,
    result: RunResult | undefined,
): ScanRunStateDecision => {
    if (executorKind === 'github-action') {
        const acceptedButPending = error?.code === 'result_fetch_failed' || error?.code === 'run_url_not_resolved'
        if (acceptedButPending) {
            return { status: 'dispatched', errorJson: error ?? null }
        }
        if (error) {
            return { status: 'failed' }
        }
        if (result) {
            return { status: 'completed' }
        }
        return { status: 'dispatched' }
    }
    // A 模式（container）
    // PR 创建失败（分支已推）→ dispatched（runUrl 兜底为 branch URL）
    if (error?.code === 'pr_creation_failed') {
        return { status: 'dispatched', errorJson: error ?? null }
    }
    // 其他错误（push_failed / execution_failed / execution_timeout）→ failed
    if (error && !result) {
        return { status: 'failed' }
    }
    return { status: 'completed' }
}
