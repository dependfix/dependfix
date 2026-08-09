import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 权限矩阵守卫测试：三角色（admin / org_admin / viewer）× requireAuth / requireRole / requireOrgResource。
 * 通过 mock getAuth 会话角色模拟三角色登录态，断言放行与 401/403 语义。
 */

const { mockGetSession, mockResolveOrganizationId } = vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockResolveOrganizationId: vi.fn(),
}))

vi.mock('#server/utils/auth', () => ({
    getAuth: vi.fn(async () => ({
        api: {
            getSession: mockGetSession,
        },
    })),
}))

vi.mock('#server/database', () => ({
    ensureDatabaseInitialized: vi.fn(async () => ({})),
}))

vi.mock('#server/utils/organization', () => ({
    resolveOrganizationId: mockResolveOrganizationId,
}))

import { requireAdmin, requireAuth, requireOrgResource, requireRole } from './guard'

const DEFAULT_ORG = 'org-default'

/** 构造最小 H3Event（守卫仅消费 headers） */
const makeEvent = (): H3Event => ({ headers: new Headers() }) as unknown as H3Event

/**
 * better-auth getSession 返回结构：顶层即 { user, session }。
 * requireAuth 检查返回值 .user，requireRole 读取 .user.role。
 */
const mockSession = (role?: string | null) => ({
    user: { id: 'u-1', email: 'user@example.com', role },
    session: { id: 's-1' },
})

const expectError = async (fn: () => Promise<unknown>, statusCode: number) => {
    try {
        await fn()
        throw new Error('expected to throw')
    } catch (err) {
        const e = err as { statusCode?: number, message?: string }
        if (e.message === 'expected to throw') {
            throw err
        }
        expect(e.statusCode).toBe(statusCode)
    }
}

describe('guard permissions', () => {
    beforeEach(() => {
        mockGetSession.mockReset()
        mockResolveOrganizationId.mockReset()
        mockResolveOrganizationId.mockResolvedValue(DEFAULT_ORG)
    })

    describe('requireAuth', () => {
        it('未登录抛 401', async () => {
            mockGetSession.mockResolvedValue(null)
            await expectError(async () => requireAuth(makeEvent()), 401)
        })

        it('已登录放行并返回 user', async () => {
            mockGetSession.mockResolvedValue(mockSession('viewer'))
            const { user } = await requireAuth(makeEvent())
            expect(user.id).toBe('u-1')
            expect(user.email).toBe('user@example.com')
        })
    })

    describe('requireRole', () => {
        it('admin 放行 admin 门槛', async () => {
            mockGetSession.mockResolvedValue(mockSession('admin'))
            await expect(requireRole(makeEvent(), ['admin'])).resolves.toBeTruthy()
        })

        it('org_admin 放行 [admin, org_admin] 门槛，拒绝 admin-only 门槛', async () => {
            mockGetSession.mockResolvedValue(mockSession('org_admin'))
            await expect(requireRole(makeEvent(), ['admin', 'org_admin'])).resolves.toBeTruthy()
            await expectError(async () => requireRole(makeEvent(), ['admin']), 403)
        })

        it('viewer 拒绝写操作门槛（403）', async () => {
            mockGetSession.mockResolvedValue(mockSession('viewer'))
            await expectError(async () => requireRole(makeEvent(), ['admin', 'org_admin']), 403)
        })

        it('角色缺失（无 role）拒绝（403）', async () => {
            mockGetSession.mockResolvedValue(mockSession(null))
            await expectError(async () => requireRole(makeEvent(), ['admin', 'org_admin']), 403)
        })
    })

    describe('requireAdmin（requireRole 别名，向后兼容）', () => {
        it('admin 放行', async () => {
            mockGetSession.mockResolvedValue(mockSession('admin'))
            await expect(requireAdmin(makeEvent())).resolves.toBeTruthy()
        })

        it('org_admin / viewer 拒绝（403）', async () => {
            mockGetSession.mockResolvedValue(mockSession('org_admin'))
            await expectError(async () => requireAdmin(makeEvent()), 403)
            mockGetSession.mockResolvedValue(mockSession('viewer'))
            await expectError(async () => requireAdmin(makeEvent()), 403)
        })
    })

    describe('requireOrgResource', () => {
        it('资源归属默认组织放行', async () => {
            await expect(requireOrgResource(makeEvent(), DEFAULT_ORG)).resolves.toBeUndefined()
        })

        it('资源归属其他组织拒绝（403）', async () => {
            await expectError(async () => requireOrgResource(makeEvent(), 'org-other'), 403)
        })

        it('资源无归属（null，存量未迁移数据）拒绝（403）', async () => {
            await expectError(async () => requireOrgResource(makeEvent(), null), 403)
        })

        it('资源不存在（undefined）拒绝（403）', async () => {
            await expectError(async () => requireOrgResource(makeEvent(), undefined), 403)
        })
    })
})
