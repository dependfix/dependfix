import type { FixError, RunResult } from '@dependfix/core'

/** 运行结果可信度字段（与状态机决策分离：只有拿到 result 时才写）。 */
export interface ScanRunOutcomeFields {
    /** 引擎进程级退出码；无 result / B 模式触发受理哨兵 / 编排失败均为 null。 */
    exitCode: number | null
    /** 环境性失败事件数；无 result（含执行器合成码 2 的超时 / 失败）为 null（UI 按 0 降级）。 */
    environmentalFailureCount: number | null
}

/**
 * 把执行结果映射为 ScanRun 的可查询事实（纯函数，避免编排层双源判定）。
 *
 * - **只有拿到 result 才落库两列**：执行器在超时 / 容器不可用 / 交付失败时会返回合成 `exitCode=2`
 *   （见 container-executor / sandbox-executor），它不是引擎进程退出码；无 result 时若原样落库，
 *   会让「结果缺失」的 run 同时显示 `退出码 2`，形成自相矛盾。B 模式执行器的 0/2 同理是触发受理
 *   哨兵，编排层不传递。
 * - `exitCode` 有 result 时原样落库（undefined → null；0 是有效值，不得用 `||` 折叠）。
 * - `environmentalFailureCount`：result.summary 存在时取 `environmentalFailures`（旧引擎 / action
 *   报告缺字段按 0，表示「有结果但没报环境性失败」）；result 存在但 summary 缺失（畸形 action 报告）
 *   与无 result 同归 null，供 UI 统一判「结果缺失」。
 */
export function resolveScanRunOutcome(
    result: RunResult | undefined,
    exitCode: number | undefined,
): ScanRunOutcomeFields {
    if (!result?.summary || typeof result.summary !== 'object') {
        return { exitCode: null, environmentalFailureCount: null }
    }
    const count = result.summary.environmentalFailures
    return {
        exitCode: exitCode ?? null,
        environmentalFailureCount: typeof count === 'number' && Number.isFinite(count) ? count : 0,
    }
}

/** 状态机决策结果 */
export interface ScanRunStateDecision {
    status: 'completed' | 'failed' | 'dispatched' | 'degraded'
    /** 需要写入 ScanRun.errorJson 的提示（dispatched 但结果未就绪时 / degraded 路径偏离原因） */
    errorJson?: { code: string, message: string } | null
}

/**
 * 引擎在「已拿到 result、但交付阶段失败」时记录的 category 集合。
 *
 * 触发场景：引擎 `fix` / `fix-and-pr` 内部流程走到交付阶段后失败（git commit 失败、提交集合不合法、
 * PR 创建失败、验证门禁回滚、catch-all FATAL）。这些错误**不应**让状态机误判为 `completed`——否则 UI 会显示
 * "已完成 + 已修复 N"，但远程实际没有分支/PR 落地，与 [C53 状态机契约](../../../../docs/design/governance/executor-sandbox-implementation.md) 的
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
    'UNEXPECTED_CHANGES',
    'NO_CHANGES',
    'PR_CREATION_FAILED',
    'PUSH_FAILED',
    'VERIFICATION_FAILED',
    'ROLLBACK_FAILED',
    'FATAL',
])

/**
 * 本次运行是否被 deny-by-default 拦截过非白名单外联（引擎 `NETWORK_VIOLATION` 审计错误）。
 *
 * 返回可读消息（含最小化目标，已脱敏）；无违规返回 null。
 */
function hasNetworkViolation(result: RunResult | undefined): string | null {
    const violation = result?.errors?.find((error) => error.category === 'NETWORK_VIOLATION')
    return violation?.message ?? null
}

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
 * - **A 场景（启动时不可用 / fix 策略降级）**：`sandbox.isAvailable()` 返回 false 或 fix 模式未接入出站代理 →
 *   orchestrator 强制走 ContainerExecutor 降级并记录 `degradedReason` → 状态机拿到 result（业务完整）+ degradedReason → **degraded**（业务结果保留，路径偏离）
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
 * 详细契约与背景见 [executor-sandbox.md §7.8 降级状态机契约](../../../../docs/design/governance/executor-sandbox-implementation.md)、
 * [executor-sandbox.md §8 push + PR 机制](../../../../docs/design/governance/executor-sandbox-implementation.md)。
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
    /** A 场景降级信号（sandbox 启动时不可用 / fix 策略降级触发） */
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
    // 外联违规对所有执行器一致：deny-by-default 拦截过非白名单外联的运行不得判「已完成」。
    // （B 模式：artifact 回传的 JSON 报告同样携带 errors；错过此处会出现「分类认得、状态不认」）
    const networkViolation = hasNetworkViolation(result)
    if (networkViolation && !(error && !result)) {
        return {
            status: 'failed',
            errorJson: { code: 'network_violation', message: networkViolation },
        }
    }
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
    // 引擎交付阶段失败：result 存在但 errors 含 COMMIT_FAILED / UNEXPECTED_CHANGES / NO_CHANGES /
    // PR_CREATION_FAILED / VERIFICATION_FAILED / ROLLBACK_FAILED / FATAL 之一 → 远程实际未完整落地，标记 failed
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
    // 启动时降级（A 场景：sandbox 启动时不可用 / fix 策略降级 → 自动降级 ContainerExecutor 跑成功）
    // 必须放在 error && !result 分支之前：degraded 场景 result 存在 + degradedReason 有值
    // 语义：「你让我做的事，做成了，但走的路不是你想要的那条」（业务结果完整，路径偏离）
    // 详见 executor-sandbox-implementation.md §7.8.1 A 场景
    if (result && degradedReason) {
        return { status: 'degraded', errorJson: degradedReason }
    }
    // 其他错误（push_failed / execution_failed / execution_timeout / sandbox_unavailable 运行时失败）→ failed
    if (error && !result) {
        return { status: 'failed' }
    }
    return { status: 'completed' }
}
