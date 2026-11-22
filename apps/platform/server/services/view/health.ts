import { resolveBuildInfo, resolveStartedAt } from '#server/utils/build-info'
import { getSchemaStatus } from '#server/database/schema-drift'

/**
 * 健康视图（`/api/health` 与 `/api/v1/health` 共用）。
 *
 * 只暴露部署产物标识、进程启动时间与 schema 漂移状态枚举；不含凭据 / 环境变量 / 表列明细。
 * **不 import 数据库连接 / 引导模块**：liveness 端点不得触碰 DB；仅读取 schema-drift 的状态枚举
 * （依赖就绪见 `readiness.ts`）。
 */
export const toHealthView = () => {
    const config = useRuntimeConfig()
    return {
        ...resolveBuildInfo(config),
        startedAt: resolveStartedAt(),
        schema: getSchemaStatus(),
    }
}
