import { requireRole } from '#server/utils/guard'
import { SandboxExecutor } from '#server/services/executor/sandbox-executor'

/**
 * GET /api/sandbox/self-check：沙箱执行器只读自检（管理员可见）。
 *
 * 返回：daemon 可用性与结构化原因、平台侧镜像候选 + 本地存在性、出站白名单主机概览、
 * 支持的执行模式。**只读**：不拉取镜像、不启动容器、不返回任何 token / 凭据 / 完整 URL。
 *
 * 权限：admin / org_admin（部署形态信息，不对 viewer 开放）。
 * 用途：运维判定「当前部署能不能用沙箱」并给出可操作原因；运行详情降级提示引用同一原因口径。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const sandbox = new SandboxExecutor()
    const report = await sandbox.getSelfCheck()
    return {
        ...report,
        checkedAt: new Date().toISOString(),
        docs: {
            deployment: '/docs/guide/deployment.md',
            security: '/docs/standards/security.md',
        },
    }
})
