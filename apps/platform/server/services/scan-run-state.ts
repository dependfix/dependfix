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
 * - 执行级失败（超时/环境缺失）→ failed（不写半截结果）
 * - 成功 → completed
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
    if (error && !result) {
        return { status: 'failed' }
    }
    return { status: 'completed' }
}
