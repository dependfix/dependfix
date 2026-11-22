import { toReadinessView } from '#server/services/view/readiness'

/**
 * GET /api/health/ready：readiness 探针（公开只读，无鉴权）。
 *
 * 与 `/api/health`（liveness）分工：
 * - liveness 只回答「进程还活着」——不碰数据库，供容器 `HEALTHCHECK` 使用（DB 慢不得触发重启循环）；
 * - readiness 回答「依赖就绪」——`SELECT 1` 验证数据库可读，200 ready / 503 not_ready。
 *
 * 响应只含 `{ status, schema }`：不含数据库类型 / 路径 / 错误正文（口径见 platform-observability.md §5）。
 */
export default defineEventHandler(async (event) => {
    const view = await toReadinessView()
    if (view.status !== 'ready') {
        setResponseStatus(event, 503)
    }
    return view
})
