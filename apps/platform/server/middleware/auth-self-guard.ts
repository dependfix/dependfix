import type { H3Event } from 'h3'
import { getAuth } from '#server/utils/auth'
import { ensureDatabaseInitialized } from '#server/database'
import { User } from '#server/entities/user'

/**
 * 服务端强制拦截：admin 自修改防护 + 最后 admin 保留逻辑。
 *
 * 背景：前端 UI 拦截（C65-A1 app/utils/user-protection.ts isSelfTarget +
 * users.vue Select disabled）只是 UX 层——devtools 直接调用
 * authClient.admin.setRole / banUser / removeUser / impersonateUser / updateUser
 * 等 API 可绕过；恶意客户端可任意修改服务端状态。
 *
 * 拦截目标（better-auth admin 插件 5 个写端点）：
 * - set-role / ban-user / remove-user / impersonate-user / update-user 自我 target
 *   → 防止 admin 通过任一通道自降级 / 自禁用 / 自删 / 自模拟 / 自改字段
 * - demote / ban / remove / update-user(role→非admin) / update-user(banned=true)
 *   最后一个有效 admin（保留最后 admin 兜底）
 *   → 防止唯一 admin 被 demote / ban / remove 后无 admin 可恢复
 *
 * 纵深防御：UI 拦截（C65-A1）+ 服务端强制（本中间件）= 真拦截
 *
 * 路径匹配：仅 /api/auth/admin/* 5 个端点；其他 better-auth 端点不动
 * （better-auth 内部 adminMiddleware 仅校验权限"有 set-role 权限"，不校验 self-target
 * 也不校验最后 admin 兜底——这是已知 gap，本中间件补齐）。
 */

/** 自修改端点白名单（仅 POST） */
const SELF_MUTATION_ENDPOINTS = new Set([
    '/api/auth/admin/set-role',
    '/api/auth/admin/ban-user',
    '/api/auth/admin/remove-user',
    '/api/auth/admin/impersonate-user',
    '/api/auth/admin/update-user',
])

/** 构造 better-auth api.getSession 所需的 fetch Headers（从 H3 event 转发 cookie/UA 等） */
const buildAuthHeaders = (event: H3Event): Headers => {
    const headers = new Headers()
    for (const [k, v] of Object.entries(event.node.req.headers)) {
        if (Array.isArray(v)) {
            headers.set(k, v.join(', '))
        } else if (typeof v === 'string') {
            headers.set(k, v)
        }
    }
    return headers
}

/** 拒绝原因码常量（响应 data.code 字段，供前端 mapping） */
const SELF_MUTATION_FORBIDDEN = 'SELF_MUTATION_FORBIDDEN'
const LAST_ADMIN_GUARD = 'LAST_ADMIN_GUARD'
const NO_SESSION = 'NO_SESSION'

export default defineEventHandler(async (event) => {
    const url = getRequestURL(event)
    const path = url.pathname

    // 快速过滤：仅匹配 better-auth admin 自修改端点（POST）
    if (!path.startsWith('/api/auth/admin/')) {
        return
    }
    if (event.method !== 'POST') {
        return
    }
    if (!SELF_MUTATION_ENDPOINTS.has(path)) {
        return
    }

    // 解析 session：从 cookie 提取 user.id（better-auth api.getSession 接受 fetch Headers）
    const auth = await getAuth()
    const headers = buildAuthHeaders(event)
    const sessionResult = await auth.api.getSession({ headers })
    const sessionUser = sessionResult?.user
    if (!sessionUser) {
        // 无 session：adminMiddleware 兜底 401；本中间件保底 403
        throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden',
            data: { code: NO_SESSION, message: 'unauthenticated' },
        })
    }
    const currentUserId = sessionUser.id

    // 解析 body：5 个端点都要求 userId（Zod schema 校验）
    // update-user 端点的字段在 body.data 下（与其他端点的平铺不同）
    const body = await readBody<{
        userId?: string
        role?: string | string[]
        data?: { role?: string | string[], banned?: boolean }
    }>(event)
    const targetUserId = body?.userId
    if (!targetUserId) {
        return // 路径不要求 userId 时放行（罕见，但保险）
    }

    // === 检查 1：self-target 拦截 ===
    if (targetUserId === currentUserId) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden',
            data: {
                code: SELF_MUTATION_FORBIDDEN,
                message: `cannot perform '${path.split('/').pop()}' on yourself`,
            },
        })
    }

    // === 检查 2：最后 admin 兜底 ===
    // 触发条件：
    // - set-role：target 当前 role === 'admin' 且 new role !== 'admin'
    //   → demote 后失去 admin
    // - ban-user：target 当前 role === 'admin'
    //   → ban 后 role 仍 admin 但 banned=true，下次登录被拒
    // - remove-user：target 当前 role === 'admin'
    //   → remove 后永久丢失
    // - update-user：data.role 非 admin 或 data.banned === true
    //   → 等价 demote / ban 路径
    // - impersonate-user：不涉及 role/banned 变更，无兜底必要
    let willDemoteLastAdmin = false
    if (path === '/api/auth/admin/set-role') {
        // body.role 可能是 string 或 string[]（多角色场景，取首个判断）
        const newRole = Array.isArray(body.role) ? body.role[0] : body.role
        if (newRole && newRole !== 'admin') {
            willDemoteLastAdmin = true // 需要查 target 当前 role 才能决定
        }
    } else if (path === '/api/auth/admin/ban-user' || path === '/api/auth/admin/remove-user') {
        willDemoteLastAdmin = true // 需要查 target 当前 role 才能决定
    } else if (path === '/api/auth/admin/update-user') {
        // update-user 的字段在 body.data 下（与 set-role/ban-user 平铺不同）
        // 触发 demote：data.role 存在且 !== 'admin'
        // 触发 ban：data.banned === true（不论 role 变化）
        const data = body.data
        if (data) {
            const isDemote = data.role !== undefined && (
                Array.isArray(data.role) ? data.role[0] !== 'admin' : data.role !== 'admin'
            )
            const isBan = data.banned === true
            if (isDemote || isBan) {
                willDemoteLastAdmin = true
            }
        }
    }

    if (willDemoteLastAdmin) {
        const ds = await ensureDatabaseInitialized()
        const userRepo = ds.getRepository(User)
        const target = await userRepo.findOne({ where: { id: targetUserId } })
        // target 不存在由 better-auth 兜底 404；本中间件不重判（避免双查）
        if (target?.role === 'admin') {
            // 统计当前 active admin 数（role=admin 且 banned=false）。
            // 这里的"active"语义：role 已是 admin 且未被禁用；本操作后剩余数。
            // - set-role demote：本操作完成后 target 不再 active
            // - ban-user：本操作完成后 target 不再 active
            // - remove-user：本操作完成后 target 直接消失
            // 统一以"<=" 1 判断（即 demote/ban/remove 后剩 0 admin）。
            const remainingActiveAdmins = await userRepo.count({
                where: { role: 'admin', banned: false },
            })
            if (remainingActiveAdmins <= 1) {
                throw createError({
                    statusCode: 403,
                    statusMessage: 'Forbidden',
                    data: {
                        code: LAST_ADMIN_GUARD,
                        message: 'cannot remove or demote the last active admin',
                    },
                })
            }
        }
    }
})
