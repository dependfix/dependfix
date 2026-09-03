import type { FixError, RunResult } from '@dependfix/core'

/** 状态机决策结果 */
export interface ScanRunStateDecision {
    status: 'completed' | 'failed' | 'dispatched' | 'degraded'
    /** 需要写入 ScanRun.errorJson 的提示（dispatched 但结果未就绪时 / degraded 路径偏离原因） */
    errorJson?: { code: string, message: string } | null
}

/**
 * 引擎在「已拿到 result、但交付阶段失败」时记录的 category 集合。
 *
 * 触发场景：引擎 `fix` / `fix-and-pr` 内部流程走到交付阶段后失败（git commit 失败、PR 创建失败、
 * 验证门禁回滚、catch-all FATAL）。这些错误**不应**让状态机误判为 `completed`——否则 UI 会显示
 * "已完成 + 已修复 N"，但远程实际没有分支/PR 落地，与 [C53 状态机契约](../../../../docs/design/governance/executor-sandbox.md) 的
 * "副作用已落库" 语义直接冲突。
 *
 * 备注：commit failed 路径下 result 仍可能存在（前面几个仓库 commit 成功、最后一个失败）；
 *       pr_creation_failed 同理（catch block 推 + 创建失败时 result 已有）。
 *       verification_failed / rollback_failed 时 result 里的 alerts[].fixStatus 不可信——引擎已回滚，
 *       但 result 数据未清空；与 commit failed 一起 fail-closed。
 *
 * 与 executor-level `error.code`（pr_creation_failed / push_failed / execution_failed / sandbox_unavailable）
 * 是不同概念：executor-level 是平台侧捕获，引擎 category 是 result.errors 里的字符串标签。
 *
 *     本表作为「已知 + 防御性白名单」，未在表内的一律忽略（fail-open to `completed`，与原行为一致）。
 */
const ENGINE_DELIVERY_FAILED_CATEGORIES: ReadonlySet<string> = new Set([
    'COMMIT_FAILED',
    'PR_CREATION_FAILED',
    'VERIFICATION_FAILED',
    'ROLLBACK_FAILED',
    'FATAL',
])

function hasEngineDeliveryFailure(result: RunResult | undefined): FixError | null {
    if (!result) {
        return null
    }
    // 防御：测试 fixture / 老版本 RunResult 可能没有 errors 字段（理论不应发生，core 类型层是
    // errors: FixError[] 必填；此处加 nullish 兜底防止 for...of on undefined 抛 TypeError
    // 被 orchestrator try/catch 误判为 orchestration_failed）
    if (!Array.isArray(result.errors)) {
        return null
    }
    for (const err of result.errors) {
        if (err.category && ENGINE_DELIVERY_FAILED_CATEGORIES.has(err.category)) {
            return err
        }
    }
    return null
}

/**
 * 扫描状态机决策（纯函数，可单测）。
 *
 * **降级场景边界**：sandbox 路由的 `sandbox_unavailable` 错误码
 * 在两种场景下产生，但语义边界不同——状态机根据「是否拿到 result + 是否记录降级原因」分流：
 *
 * - **A 场景（启动时降级）**：`sandbox.isAvailable()` 返回 false → orchestrator 走 ContainerExecutor 降级
 *   并记录 `degradedReason` → 状态机拿到 result（业务完整）+ degradedReason → **degraded**（业务结果保留，路径偏离）
 * - **B 场景（运行时降级）**：`sandbox.isAvailable()` 通过但 `execute()` 抛 errno → 不静默降级（避免掩盖
 *   真实错误），result 为 undefined → 状态机 error.code === 'sandbox_unavailable' 且 !result → **failed**
 *   （业务未完成，UI warn 告警「环境容器可能发生变化」）
 *
 * **引擎交付阶段失败**：引擎在 fix / fix-and-pr 流程走到交付阶段后失败
 * （git commit 失败、PR 创建失败、验证门禁回滚、catch-all FATAL），result 仍可能存在
 * （前面仓库成功 / 后面失败；或 catch block 已 push + 后续步骤失败），不能误判 `completed`。
 * 状态机通过扫描 `result.errors[]` 的 category 命中白名单识别 → **failed**。
 * 该路径 errorJson 优先用引擎错（带 message），fallback 才用 executor error。
 *
 * 详细契约与背景见 [executor-sandbox.md §7.8 降级状态机契约](../../../../docs/design/governance/executor-sandbox.md)、
 * [executor-sandbox.md §8 push + PR 机制](../../../../docs/design/governance/executor-sandbox.md)。
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
    /**
     * DependfixApp.run() 返回的进程级 exit code（0 / 1 / 2）。仅在 result 存在但 status 不明时
     * 作为附加保险：exitCode=2 + result 存在 → 引擎 catch-all 抛错后仍产出了 result，但所有
     * 仓库失败/回滚，标记 `failed`。exitCode=0 / 1 + result 存在 → 至少部分成功，
     * 走常规 completed / 引擎交付失败分支（不提前 fail-closed）。
     *
     * 当前仅 A 模式（container）使用，B 模式（github-action）保留 undefined 行为不变。
     */
    exitCode?: number,
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
    // 引擎交付阶段失败：result 存在但 errors 含 COMMIT_FAILED / PR_CREATION_FAILED /
    // VERIFICATION_FAILED / ROLLBACK_FAILED / FATAL 之一 → 远程实际未完整落地，标记 failed
    // （关键修复：原行为 result 存在即 completed，会让"已修复 8 但无 PR"误报）
    const engineDeliveryErr = hasEngineDeliveryFailure(result)
    if (engineDeliveryErr) {
        return {
            status: 'failed',
            errorJson: {
                code: 'engine_delivery_failed',
                message: `引擎交付阶段失败（${engineDeliveryErr.category}）：${engineDeliveryErr.message}`,
            },
        }
    }
    // 进程级兜底：exitCode=2（catastrophic：所有仓库失败/回滚 + 仍产出 result）→ failed
    // exitCode=1 表示部分成功（不应 fail-closed），走 completed 即可
    if (exitCode === 2 && result) {
        return {
            status: 'failed',
            errorJson: error ?? {
                code: 'engine_exit_2',
                message: '引擎进程级 exitCode=2：所有仓库失败或全量回滚',
            },
        }
    }
    // 启动时降级（A 场景：sandbox 启动时不可用 → 自动降级 ContainerExecutor 跑成功）
    // 必须放在 error && !result 分支之前：degraded 场景 result 存在 + degradedReason 有值
    // 语义：「你让我做的事，做成了，但走的路不是你想要的那条」（业务结果完整，路径偏离）
    // 详见 executor-sandbox.md §7.8.1 A 场景
    if (result && degradedReason) {
        return { status: 'degraded', errorJson: degradedReason }
    }
    // 其他错误（push_failed / execution_failed / execution_timeout / sandbox_unavailable 运行时失败）→ failed
    if (error && !result) {
        return { status: 'failed' }
    }
    return { status: 'completed' }
}
