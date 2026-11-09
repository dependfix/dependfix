import { resolveBuildInfo, resolveStartedAt } from '#server/utils/build-info'
import { getSchemaStatus } from '#server/database/schema-drift'

/**
 * GET /api/health：部署产物版本戳与 schema 状态（公开只读，无鉴权）。
 *
 * 返回 `{ version, commit, startedAt, schema }`——只暴露部署产物标识、进程启动时间与
 * schema 漂移状态枚举，不含凭据 / 环境变量 / 表列明细，允许编排器与运维直接 `curl` 核对运行态产物
 * 与数据库迁移是否就绪（2026-11-09 存量库缺列事故的部署后自检入口）。
 * 版本 / commit 来源见 docs/standards/platform.md §10.7；schema 检测口径见 §3.3。
 */
export default defineEventHandler(() => {
    const config = useRuntimeConfig()
    return {
        ...resolveBuildInfo(config),
        startedAt: resolveStartedAt(),
        schema: getSchemaStatus(),
    }
})
