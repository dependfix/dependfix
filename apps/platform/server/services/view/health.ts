import { resolveBuildInfo, resolveStartedAt } from '#server/utils/build-info'
import { getSchemaStatus } from '#server/database/schema-drift'

/**
 * 健康视图（`/api/health` 与 `/api/v1/health` 共用）。
 *
 * 只暴露部署产物标识、进程启动时间与 schema 漂移状态枚举；不含凭据 / 环境变量 / 表列明细。
 */
export const toHealthView = () => {
    const config = useRuntimeConfig()
    return {
        ...resolveBuildInfo(config),
        startedAt: resolveStartedAt(),
        schema: getSchemaStatus(),
    }
}
