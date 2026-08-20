import type { RunResult } from '@dependfix/core'

/** 状态机决策结果 */
export interface ScanRunStateDecision {
    status: 'completed' | 'failed' | 'dispatched' | 'degraded'
    /** 需要写入 ScanRun.errorJson 的提示（dispatched 但结果未就绪时 / degraded 路径偏离原因） */
    errorJson?: { code: string, message: string } | null
}

/**
 * 扫描状态机决策（纯函数，可单测）。
 *
 * > **⚠️ 实现进度（2026-08-20）**：本注释描述的 `degraded` 状态机扩展与 `degradedReason` 参数契约
 * > 是 [backlog T1005-C](../../../../../docs/plan/backlog.md)（状态机扩展 `degraded` 状态）实施阶段的预期契约，
 * > 详细设计已落盘到 [executor-sandbox.md §7.8](../../../../../docs/design/governance/executor-sandbox.md) 降级状态机契约章节。
 * > 函数体当前仅返回 `'completed' | 'failed' | 'dispatched'`，degraded 分支与 degradedReason 参数处理
 * > 待 T1005-C 实现批次落地。当前调用方（scan-orchestrator.service.ts）暂未传递 degradedReason，
 * > 也不消费 `decision.status === 'degraded'` 分支。
 *
 * **降级场景边界（M11 T1005-C 引入，2026-08-20）**：sandbox 路由的 `sandbox_unavailable` 错误码
 * 在两种场景下产生，但语义边界不同——状态机根据「是否拿到 result + 是否记录降级原因」分流：
 *
 * - **A 场景（启动时降级）**：`sandbox.isAvailable()` 返回 false → orchestrator 走 ContainerExecutor 降级
 *   并记录 `degradedReason` → 状态机拿到 result（业务完整）+ degradedReason → **degraded**（业务结果保留，路径偏离）
 * - **B 场景（运行时降级）**：`sandbox.isAvailable()` 通过但 `execute()` 抛 errno → 不静默降级（避免掩盖
 *   真实错误），result 为 undefined → 状态机 error.code === 'sandbox_unavailable' 且 !result → **failed**
 *   （业务未完成，UI warn 告警「环境容器可能发生变化」）
 *
 * 详细契约与背景见 [executor-sandbox.md §7.8 降级状态机契约](../../../../docs/design/governance/executor-sandbox.md)。
 *
 * B 模式（github-action）三分支：
 * - 触发已受理但结果未就绪（`result_fetch_failed` / `run_url_not_resolved`）→ dispatched
 *   （action 已在目标仓库运行，不误报 failed；注意 run_url_not_resolved 时 executor 仍返回最小 result）
 * - 触发级失败（workflow 未配置/不存在/无权限，action 未运行）→ failed
 * - 结果已拉取 → completed
 *
 * A 模式（container / sandbox）：
 * - push 成功 + PR 失败（`pr_creation_failed`，分支已推）→ dispatched
 *   （与 B 模式 `dispatched` 语义对齐：副作用已落库，runUrl 仍可访问，便于用户手动重试）
 * - 启动时降级（`degradedReason` 有值 + result 存在）→ **degraded**（业务结果完整，UI info 提示）
 * - 其他执行级失败（push_failed / execution_failed / execution_timeout / sandbox_unavailable 运行时失败）→ failed（不写半截结果）
 * - 成功（push + PR 都成功）→ completed
 */
export const resolveScanRunState = (
    executorKind: 'container' | 'github-action' | 'sandbox',
    error: { code: string, message: string } | undefined,
    result: RunResult | undefined,
    /** A 场景降级信号（仅 sandbox 路由启动时不可用触发） */
    degradedReason?: { code: string, message: string },
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
    // A 模式（container / sandbox 路由等价：sandbox 当前复用 A 模式 push + PR 链路）
    // PR 创建失败（分支已推）→ dispatched（runUrl 兜底为 branch URL）
    if (error?.code === 'pr_creation_failed') {
        return { status: 'dispatched', errorJson: error ?? null }
    }
    // 其他错误（push_failed / execution_failed / execution_timeout / sandbox_unavailable 运行时失败）→ failed
    if (error && !result) {
        return { status: 'failed' }
    }
    return { status: 'completed' }
}
