import type { H3Event } from 'h3'
import { requireAuth } from '#server/utils/guard'
import { resolveExecutionLimits } from '#server/utils/execution-limits'

/**
 * GET /api/settings/execution-limits：执行预算的全局生效值（只读）。
 *
 * 用途：仓库表单的「继承全局」占位与设置页只读卡片需要展示**当前生效值**，
 * 前端禁止硬编码 30 / 10 / 5 分钟（否则 env 调整后界面与实际不一致）。
 * 只读端点不提供写入口（全局值仍由部署 env 管理，见 repo-execution-limits.md §8.3）。
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
    }
}

export default defineEventHandler(getExecutionLimits)
