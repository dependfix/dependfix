import 'reflect-metadata'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent } from 'h3'

/**
 * auth-self-guard middleware 单测（todo.md §M16.5 T701-e2e 管理端点集成测试补强）。
 *
 * 覆盖矩阵：5 better-auth admin 自修改端点 × { self-target / non-self / last-admin 兜底 } 三类拦截。
 *
 * | 端点              | self-target 403 | non-self last-admin 403 | non-self multi-admin 放行 |
 * | ----------------- | --------------- | ---------------------- | ------------------------ |
 * | set-role          | ✓               | ✓                      | ✓                        |
 * | ban-user          | ✓               | ✓                      | ✓                        |
 * | remove-user       | ✓               | ✓                      | ✓                        |
 * | impersonate-user  | ✓               | N/A(无兜底)            | ✓                        |
 * | update-user       | ✓               | ✓（data.role/banned）   | ✓（data.name 等放行）     |
 *
 * middleware 行为契约：
 * - 路径不在 SELF_MUTATION_ENDPOINTS / method != POST / body.userId 缺失 → 放行
 * - 无 session → 403 NO_SESSION
 * - targetUserId === currentUserId → 403 SELF_MUTATION_FORBIDDEN
 * - 将导致"最后 admin 丢失" → 403 LAST_ADMIN_GUARD
 */

const { mockGetSession, mockEnsureDatabaseInitialized, MockUserRepo } = vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockEnsureDatabaseInitialized: vi.fn(),
    MockUserRepo: vi.fn(),
}))

vi.mock('#server/utils/auth', () => ({
    getAuth: () => ({
        api: {
            getSession: mockGetSession,
        },
    }),
}))

vi.mock('#server/database', () => ({
    ensureDatabaseInitialized: mockEnsureDatabaseInitialized,
}))

vi.mock('#server/entities/user', () => ({
    User: { name: 'User' },
}))

import authSelfGuard from './auth-self-guard'

/** 构造最小 h3 event + 调用 middleware;返回 { statusCode?, data? }（抛错时 catch） */
async function callMiddleware(
    method: string,
    path: string,
    body: unknown,
): Promise<{ statusCode: number, data: Record<string, unknown>, message?: string } | void> {
    const req = new IncomingMessage(new Socket())
    req.method = method
    req.url = path
    req.headers = { 'content-type': 'application/json', cookie: 'session=fake' }
    ;(req as unknown as { body: string }).body = JSON.stringify(body)
    const res = new ServerResponse(req)
    const event = createEvent(req, res)
    // h3 getRequestURL 走 event.node.req.originalUrl || event.path;
    // createEvent 内部从 req.url 推断 event.path,无需手动设置
    try {
        await authSelfGuard(event)
        return undefined // 放行
    } catch (err) {
        const e = err as { statusCode?: number, data?: Record<string, unknown>, message?: string }
        return { statusCode: e.statusCode ?? 0, data: e.data ?? {}, message: e.message }
    }
}

/** 配置 session + User repo mock 返回 */
function setupMocks(opts: {
    sessionUserId?: string
    targetRole?: 'admin' | 'org_admin' | 'viewer' | null
    activeAdminCount?: number
    targetExists?: boolean
}): void {
    mockGetSession.mockResolvedValue(
        opts.sessionUserId ? { user: { id: opts.sessionUserId } } : null,
    )
    const findOne = vi.fn(async () => {
        if (opts.targetExists === false) {
            return null
        }
        return { id: 'target', role: opts.targetRole ?? 'viewer', banned: false }
    })
    const count = vi.fn(async () => opts.activeAdminCount ?? 2)
    MockUserRepo.mockImplementation(() => ({ findOne, count }))
    mockEnsureDatabaseInitialized.mockResolvedValue({
        getRepository: MockUserRepo,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('auth-self-guard middleware（todo.md §M16.5）', () => {
    describe('快速过滤', () => {
        it('path 不以 /api/auth/admin/ 开头 → 放行', async () => {
            setupMocks({ sessionUserId: 'admin-1' })
            const result = await callMiddleware('POST', '/api/repos', { owner: 'x' })
            expect(result).toBeUndefined()
        })

        it('path 在 /api/auth/admin/ 但不在 5 端点白名单 → 放行', async () => {
            setupMocks({ sessionUserId: 'admin-1' })
            const result = await callMiddleware('POST', '/api/auth/admin/list-users', {})
            expect(result).toBeUndefined()
        })

        it('method 不是 POST → 放行（仅拦截写操作）', async () => {
            setupMocks({ sessionUserId: 'admin-1' })
            const result = await callMiddleware('GET', '/api/auth/admin/set-role', {})
            expect(result).toBeUndefined()
        })
    })

    describe('无 session', () => {
        it('auth.api.getSession 返回 null → 403 NO_SESSION', async () => {
            setupMocks({ sessionUserId: undefined })
            const result = await callMiddleware('POST', '/api/auth/admin/set-role', {
                userId: 'target-1',
                role: 'viewer',
            })
            expect(result).toMatchObject({ statusCode: 403, data: { code: 'NO_SESSION' } })
        })
    })

    describe('self-target 拦截', () => {
        // 5 端点统一检查：body.userId === session.user.id → 403 SELF_MUTATION_FORBIDDEN
        for (const path of [
            '/api/auth/admin/set-role',
            '/api/auth/admin/ban-user',
            '/api/auth/admin/remove-user',
            '/api/auth/admin/impersonate-user',
            '/api/auth/admin/update-user',
        ]) {
            const endpointName = path.split('/').pop()
            it(`${endpointName}：target === self → 403 SELF_MUTATION_FORBIDDEN`, async () => {
                setupMocks({ sessionUserId: 'admin-self', activeAdminCount: 3 })
                const body = path === '/api/auth/admin/update-user'
                    ? { userId: 'admin-self', data: { role: 'viewer' } }
                    : { userId: 'admin-self', role: 'viewer' }
                const result = await callMiddleware('POST', path, body)
                expect(result).toMatchObject({ statusCode: 403, data: { code: 'SELF_MUTATION_FORBIDDEN' } })
            })
        }
    })

    describe('non-self：last-admin 兜底', () => {
        it('set-role demote last admin（activeCount=1）→ 403 LAST_ADMIN_GUARD', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/set-role', {
                userId: 'target-admin',
                role: 'viewer',
            })
            expect(result).toMatchObject({ statusCode: 403, data: { code: 'LAST_ADMIN_GUARD' } })
        })

        it('set-role demote non-last admin（activeCount=2）→ 放行', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 2, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/set-role', {
                userId: 'target-admin',
                role: 'viewer',
            })
            expect(result).toBeUndefined()
        })

        it('set-role 同 admin→admin（不变更 role）→ 放行（不会触发 last-admin 检查）', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            // role 不变（仍是 admin）→ willDemoteLastAdmin 判定跳过 → 放行
            const result = await callMiddleware('POST', '/api/auth/admin/set-role', {
                userId: 'target-admin',
                role: 'admin',
            })
            expect(result).toBeUndefined()
        })

        it('ban-user last admin → 403 LAST_ADMIN_GUARD', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/ban-user', {
                userId: 'target-admin',
            })
            expect(result).toMatchObject({ statusCode: 403, data: { code: 'LAST_ADMIN_GUARD' } })
        })

        it('ban-user viewer（非 admin）→ 放行（last-admin 检查仅针对 admin target）', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'viewer', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/ban-user', {
                userId: 'target-viewer',
            })
            expect(result).toBeUndefined()
        })

        it('remove-user last admin → 403 LAST_ADMIN_GUARD', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/remove-user', {
                userId: 'target-admin',
            })
            expect(result).toMatchObject({ statusCode: 403, data: { code: 'LAST_ADMIN_GUARD' } })
        })

        it('impersonate-user non-self → 放行（无 last-admin 兜底）', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/impersonate-user', {
                userId: 'target-admin',
            })
            expect(result).toBeUndefined()
        })

        it('update-user data.role 非 admin + last admin → 403 LAST_ADMIN_GUARD', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/update-user', {
                userId: 'target-admin',
                data: { role: 'viewer' },
            })
            expect(result).toMatchObject({ statusCode: 403, data: { code: 'LAST_ADMIN_GUARD' } })
        })

        it('update-user data.banned=true + last admin → 403 LAST_ADMIN_GUARD', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/update-user', {
                userId: 'target-admin',
                data: { banned: true },
            })
            expect(result).toMatchObject({ statusCode: 403, data: { code: 'LAST_ADMIN_GUARD' } })
        })

        it('update-user data.name 改名（非 admin 字段） + last admin → 放行', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            // data.role 缺失且 data.banned !== true → willDemoteLastAdmin false → 放行
            const result = await callMiddleware('POST', '/api/auth/admin/update-user', {
                userId: 'target-admin',
                data: { name: 'renamed' },
            })
            expect(result).toBeUndefined()
        })

        it('update-user data.role 是数组 ["viewer"] → 视为 demote（取首个判断）', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/update-user', {
                userId: 'target-admin',
                data: { role: ['viewer'] },
            })
            expect(result).toMatchObject({ statusCode: 403, data: { code: 'LAST_ADMIN_GUARD' } })
        })

        it('set-role role 是数组 ["admin"]（保持 admin）→ 不触发 last-admin 兜底 → 放行', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetRole: 'admin', activeAdminCount: 1, targetExists: true })
            const result = await callMiddleware('POST', '/api/auth/admin/set-role', {
                userId: 'target-admin',
                role: ['admin'],
            })
            expect(result).toBeUndefined()
        })
    })

    describe('body 防御', () => {
        it('body 缺 userId → 放行（罕见端点不要求 userId）', async () => {
            setupMocks({ sessionUserId: 'admin-1' })
            const result = await callMiddleware('POST', '/api/auth/admin/set-role', { role: 'viewer' })
            expect(result).toBeUndefined()
        })
    })

    describe('target 不存在', () => {
        it('target 在数据库中不存在 → better-auth 兜底 404，本中间件不重复判断', async () => {
            setupMocks({ sessionUserId: 'admin-1', targetExists: false })
            // willDemoteLastAdmin 仅在目标 role === 'admin' 时触发 last-admin 检查
            // targetExists=false → findOne 返回 null → role !== 'admin' → 放行
            const result = await callMiddleware('POST', '/api/auth/admin/set-role', {
                userId: 'nonexistent',
                role: 'viewer',
            })
            expect(result).toBeUndefined()
        })
    })
})
