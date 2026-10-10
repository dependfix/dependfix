import { resolveBuildInfo, resolveStartedAt } from '#server/utils/build-info'

/**
 * GET /api/health：部署产物版本戳健康端点（公开只读，无鉴权）。
 *
 * 返回 `{ version, commit, startedAt }`——仅暴露部署产物标识与进程启动时间，不含任何凭据 / 环境变量，
 * 允许编排器与运维直接 `curl` 核对运行态产物（无需会话），用于消除陈旧产物误判。
 * 版本 / commit 来源与口径见 docs/standards/platform.md §10.7。
 */
export default defineEventHandler(() => {
    const config = useRuntimeConfig()
    return {
        ...resolveBuildInfo(config),
        startedAt: resolveStartedAt(),
    }
})
