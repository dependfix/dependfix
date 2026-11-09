import type { H3Event } from 'h3'
import { requireAuth } from '#server/utils/guard'
import {
    MAX_CLONE_TIMEOUT_MS,
    MAX_COMMAND_TIMEOUT_MS,
    MAX_INSTALL_TIMEOUT_MS,
    MIN_CLONE_TIMEOUT_MS,
    MIN_COMMAND_TIMEOUT_MS,
    MIN_EXECUTION_TIMEOUT_MS,
    MIN_INSTALL_TIMEOUT_MS,
    resolveExecutionLimits,
} from '#server/utils/execution-limits'

/**
 * GET /api/settings/execution-limits：执行预算的全局生效值 + 合法范围（只读）。
 *
 * 用途：仓库表单的「继承全局」占位、行内合法范围提示与客户端校验边界，
 * 设置页只读卡片展示**当前生效值**——前端禁止硬编码 30 / 10 / 5 分钟
 * （否则 env 调整后界面与实际不一致）。只读端点不提供写入口
 * （全局值仍由部署 env 管理，见 repo-execution-limits.md §8.3）。
 */
const getExecutionLimits = async (event: H3Event) => {
    await requireAuth(event)
    const resolved = resolveExecutionLimits(null, process.env)
    return {
        executionTimeoutMs: resolved.executionTimeoutMs,
        maxExecutionTimeoutMs: resolved.ceilingMs,
        verifyCommandTimeoutMs: resolved.verifyCommandTimeoutMs,
        installTimeoutMs: resolved.installTimeoutMs,
        cloneTimeoutMs: resolved.cloneTimeoutMs,
        // 客户端校验与提示的边界（服务端 schema 仍是最终裁决）；
        // 执行上限的 max 用运行期封顶值，而不是 schema 的 4h 理论上限。
        bounds: {
            execution: { minMs: MIN_EXECUTION_TIMEOUT_MS, maxMs: resolved.ceilingMs },
            verifyCommand: { minMs: MIN_COMMAND_TIMEOUT_MS, maxMs: MAX_COMMAND_TIMEOUT_MS },
            install: { minMs: MIN_INSTALL_TIMEOUT_MS, maxMs: MAX_INSTALL_TIMEOUT_MS },
            clone: { minMs: MIN_CLONE_TIMEOUT_MS, maxMs: MAX_CLONE_TIMEOUT_MS },
        },
    }
}

export default defineEventHandler(getExecutionLimits)
