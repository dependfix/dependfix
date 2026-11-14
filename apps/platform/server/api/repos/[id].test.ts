import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIdHandler from './[id]'
import reposIndexHandler from './index'
import { ensureDatabaseInitialized } from '#server/database'
import { AuditEvent } from '#server/entities/audit-event'

// todo.md §M16.5 三角色鉴权：mock 改为可重写（默认 admin），三角色相关 case 用 mockRequireRole.mockImplementationOnce 切换
const { mockRequireAuth, mockRequireRole, mockRequireOrgResource } = vi.hoisted(() => ({
    mockRequireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    mockRequireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    mockRequireOrgResource: vi.fn(async () => undefined),
}))
vi.mock('#server/utils/guard', () => ({
    requireAuth: mockRequireAuth,
    requireRole: mockRequireRole,
    requireOrgResource: mockRequireOrgResource,
}))

const callIndex = (method: string, url: string, body?: unknown) => reposIndexHandler(makeEvent(method, url, body))
const callId = (method: string, url: string, body?: unknown, params: Record<string, string> = {}) =>
    reposIdHandler(makeEvent(method, url, body, {}, params))

const basePayload = {
    owner: 'demo',
    name: 'app',
    platform: 'github',
    packageManager: 'pnpm',
    defaultBranch: 'main',
    executorKind: 'container',
}

describe('GET /api/repos/[id]', () => {
    let id: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await callIndex('POST', '/api/repos', basePayload) as { id: string }
        id = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns repository detail', async () => {
        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail).toMatchObject({ id, owner: 'demo', name: 'app', packageManager: 'pnpm', tags: [] })
        expect(detail.sandboxLimits).toBeUndefined()
    })

    it('returns 404 for unknown repository', async () => {
        await expectError(callId('GET', '/api/repos/nonexistent', undefined, { id: 'nonexistent' }), 404)
    })

    it('updates fields via PUT', async () => {
        const result = await callId('PUT', `/api/repos/${id}`, { note: '新备注', tags: ['prod'] }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.note).toBe('新备注')
        expect(detail.tags).toEqual(['prod'])
    })

    it('updates and clears the repository-level sandbox image', async () => {
        await callId('PUT', `/api/repos/${id}`, { sandboxImage: 'ghcr.io/owner/dependfix:2.0.0' }, { id })
        let detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.sandboxImage).toBe('ghcr.io/owner/dependfix:2.0.0')

        // 省略字段的局部 PUT 不清空既有值
        await callId('PUT', `/api/repos/${id}`, { note: '只改备注' }, { id })
        detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.sandboxImage).toBe('ghcr.io/owner/dependfix:2.0.0')

        await callId('PUT', `/api/repos/${id}`, { sandboxImage: null }, { id })
        detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.sandboxImage).toBeNull()
    })

    it('rejects owner/name conflict with 409', async () => {
        await callIndex('POST', '/api/repos', { ...basePayload, owner: 'other', name: 'repo' })
        await expectError(
            callId('PUT', `/api/repos/${id}`, { owner: 'other', name: 'repo' }, { id }),
            409,
        )
    })

    it('rejects invalid body with 400', async () => {
        await expectError(callId('PUT', `/api/repos/${id}`, { executorKind: 'nope' }, { id }), 400)
    })

    it('accepts sandbox executor via PUT (entry restored)', async () => {
        const result = await callId('PUT', `/api/repos/${id}`, { executorKind: 'sandbox' }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })
        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.executorKind).toBe('sandbox')
    })

    it('persists sandboxLimits JSON via PUT', async () => {
        // 仓库级 sandboxLimits 序列化 + 更新语义（undefined=不修改 / null 或 object=更新）
        const result = await callId('PUT', `/api/repos/${id}`, { sandboxLimits: { memoryMb: 4096, cpu: 2.0 } }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.sandboxLimits).toEqual({ memoryMb: 4096, cpu: 2.0 })
    })

    it('clears sandboxLimits via PUT (null)', async () => {
        // 先设置 → 再清空 → 走平台 SANDBOX_DEFAULTS（detail.sandboxLimits === undefined）
        await callId('PUT', `/api/repos/${id}`, { sandboxLimits: { memoryMb: 1024 } }, { id })
        const cleared = await callId('PUT', `/api/repos/${id}`, { sandboxLimits: null }, { id }) as { updated: boolean }
        expect(cleared).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.sandboxLimits).toBeUndefined()
    })

    it('rejects PUT with sandboxLimits out of range (400)', async () => {
        await expectError(
            callId('PUT', `/api/repos/${id}`, { sandboxLimits: { memoryMb: 100000 } }, { id }),
            400,
        )
    })

    it('rejects PUT with unknown sandboxLimits key (如 gpu) → 400（strict，不静默剥离）', async () => {
        await expectError(
            callId('PUT', `/api/repos/${id}`, { sandboxLimits: { memoryMb: 2048, gpu: 1 } }, { id }),
            400,
        )
    })

    it('tags 缺省 = 不修改（其它字段更新不清空既有标签）', async () => {
        await callId('PUT', `/api/repos/${id}`, { tags: ['prod'] }, { id })
        await callId('PUT', `/api/repos/${id}`, { note: '仅改备注' }, { id })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as { tags: string[] }
        expect(detail.tags).toEqual(['prod'])
    })

    it('tags 写入即归一（trim + 去重），读回与写入一致', async () => {
        const result = await callId('PUT', `/api/repos/${id}`, {
            tags: [' prod ', 'prod', 'core'],
        }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as { tags: string[] }
        expect(detail.tags).toEqual(['prod', 'core'])
    })

    it('persists verifyCommands JSON via PUT', async () => {
        // 仓库级自定义验证命令序列化 + 读取（数组 → JSON 列 → 数组）
        const result = await callId('PUT', `/api/repos/${id}`, {
            verifyCommands: ['pnpm install --frozen-lockfile', 'pnpm test'],
        }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.verifyCommands).toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])
    })

    it('clears verifyCommands via PUT (null) → 走引擎默认验证链', async () => {
        await callId('PUT', `/api/repos/${id}`, { verifyCommands: ['pnpm test'] }, { id })
        const cleared = await callId('PUT', `/api/repos/${id}`, { verifyCommands: null }, { id }) as { updated: boolean }
        expect(cleared).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.verifyCommands).toEqual([])
    })

    it('persists prCheckFocus via PUT（规范化 + 重复保存幂等 + undefined 不修改 + null 清空）', async () => {
        const focus = {
            providers: [' Vercel ', 'vercel'],
            names: [' Test '],
            kinds: ['check', 'deployment'],
        }
        await callId('PUT', `/api/repos/${id}`, { prCheckFocus: focus }, { id })

        const expected = { providers: ['vercel'], names: ['Test'], kinds: ['check', 'deployment'] }
        const readFocus = async () => {
            const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
            return detail.prCheckFocus
        }
        expect(await readFocus()).toEqual(expected)

        // 重复保存同一配置 → 结果不变（幂等）
        await callId('PUT', `/api/repos/${id}`, { prCheckFocus: focus }, { id })
        expect(await readFocus()).toEqual(expected)

        // 未传该字段 → 不修改
        await callId('PUT', `/api/repos/${id}`, { note: 'unrelated update' }, { id })
        expect(await readFocus()).toEqual(expected)

        // null / 三维全空 → 清空（回到未配置）
        await callId('PUT', `/api/repos/${id}`, { prCheckFocus: { providers: [], names: [], kinds: [] } }, { id })
        expect(await readFocus()).toBeNull()
        await callId('PUT', `/api/repos/${id}`, { prCheckFocus: focus }, { id })
        await callId('PUT', `/api/repos/${id}`, { prCheckFocus: null }, { id })
        expect(await readFocus()).toBeNull()
    })

    it('records verify_commands_update audit only when commands actually change', async () => {
        const ds = await ensureDatabaseInitialized()
        const auditRepo = ds.getRepository(AuditEvent)
        const before = await auditRepo.find({ where: { repositoryId: id } })

        // 1) 设置命令 → 记 1 条审计（previous=[] / next=设置值）
        await callId('PUT', `/api/repos/${id}`, { verifyCommands: ['pnpm test'] }, { id })
        const afterSet = await auditRepo.find({ where: { repositoryId: id } })
        expect(afterSet.length).toBe(before.length + 1)
        const setEvent = afterSet[afterSet.length - 1]!
        expect(setEvent.type).toBe('verify_commands_update')
        expect(setEvent.severity).toBe('info')
        expect(JSON.parse(setEvent.payloadJson!)).toEqual({
            repository: 'demo/app',
            previous: [],
            next: ['pnpm test'],
        })

        // 2) 同一命令重复提交 → 无实际变化 → 不新增审计
        await callId('PUT', `/api/repos/${id}`, { verifyCommands: ['pnpm test'] }, { id })
        // 3) 仅更新其它字段（未触碰 verifyCommands）→ 同样不新增审计
        await callId('PUT', `/api/repos/${id}`, { note: 'no-op change' }, { id })
        const afterNoop = await auditRepo.find({ where: { repositoryId: id } })
        expect(afterNoop.length).toBe(afterSet.length)

        // 4) 改为其他命令 → 再记 1 条（previous / next 为变更前后值）
        await callId('PUT', `/api/repos/${id}`, { verifyCommands: ['pnpm lint', 'pnpm test'] }, { id })
        const afterChange = await auditRepo.find({ where: { repositoryId: id } })
        expect(afterChange.length).toBe(afterNoop.length + 1)
        expect(JSON.parse(afterChange[afterChange.length - 1]!.payloadJson!)).toEqual({
            repository: 'demo/app',
            previous: ['pnpm test'],
            next: ['pnpm lint', 'pnpm test'],
        })
    })

    it('deletes repository via DELETE', async () => {
        const result = await callId('DELETE', `/api/repos/${id}`, undefined, { id }) as { deleted: boolean }
        expect(result).toEqual({ id, deleted: true })
        await expectError(callId('GET', `/api/repos/${id}`, undefined, { id }), 404)
    })

    it('rejects unsupported method with 405', async () => {
        await expectError(callId('PATCH', `/api/repos/${id}`, undefined, { id }), 405)
    })
})

/**
 * 三角色鉴权（todo.md §M16.5）：viewer 只读 / admin + org_admin 写 / 未登录 401
 * 同时验证 requireOrgResource 在跨组织时的兜底（403）。
 */
describe('/api/repos/[id] 三角色鉴权（todo.md §M16.5）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('viewer 调 PUT /api/repos/[id] → 403 (requireRole 拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('PUT', `/api/repos/any-id`, { name: 'x' }, { id: 'any-id' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('viewer 调 DELETE /api/repos/[id] → 403 (requireRole 拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('DELETE', `/api/repos/any-id`, undefined, { id: 'any-id' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('viewer 调 GET /api/repos/[id] → 200 (只读放行)', async () => {
        mockRequireAuth.mockResolvedValueOnce({ user: { id: 'viewer-1', email: 'viewer@test.dev' } })
        // GET /api/repos/nonexistent → 404（业务查找）而非 403，证明鉴权通过
        await expect(callId('GET', `/api/repos/nonexistent`, undefined, { id: 'nonexistent' }))
            .rejects.toMatchObject({ statusCode: 404 })
    })

    it('org_admin 调 PUT /api/repos/[id] → 走 requireOrgResource', async () => {
        // org_admin 角色通过 requireRole，但 requireOrgResource 抛 403 表示资源不在当前组织
        mockRequireRole.mockResolvedValueOnce({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        mockRequireOrgResource.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        // repo 不存在 → findOne 返回 null → 抛 404（实际业务先于 requireOrgResource）
        // 改为 repo 存在场景：直接 PUT 现有 repoId 让 requireOrgResource 先抛
        // 这里先 seed 一条 repo
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'orgadmin-target',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        // 重置 mock：让 org_admin 通过 requireRole，但 requireOrgResource 抛
        mockRequireRole.mockResolvedValue({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        mockRequireOrgResource.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('PUT', `/api/repos/${created.id}`, { note: 'org-override' }, { id: created.id }))
            .rejects.toMatchObject({ statusCode: 403 })
    })
    it('PUT 只改 note 不重置执行器与四个执行超时（AC7）', async () => {
        // 隔离上一用例残留的 once mock（requireOrgResource）
        mockRequireOrgResource.mockReset()
        mockRequireOrgResource.mockImplementation(async () => undefined)
        const created = await callIndex('POST', '/api/repos', {
            ...basePayload,
            name: 'partial-update',
            executorKind: 'github-action',
            actionWorkflowFile: 'ci.yml',
            executionTimeoutMs: 2_700_000,
            verifyCommandTimeoutMs: 1_200_000,
        }) as { id: string }

        await callId('PUT', `/api/repos/${created.id}`, { note: '仅改备注' }, { id: created.id })

        const detail = await callId('GET', `/api/repos/${created.id}`, undefined, { id: created.id }) as Record<string, unknown>
        expect(detail.executorKind).toBe('github-action')
        expect(detail.executionTimeoutMs).toBe(2_700_000)
        expect(detail.verifyCommandTimeoutMs).toBe(1_200_000)
        expect(detail.note).toBe('仅改备注')
    })

    it('仓库执行上限超过平台封顶 → 400 且不落库（AC2）', async () => {
        mockRequireOrgResource.mockReset()
        mockRequireOrgResource.mockImplementation(async () => undefined)
        const created = await callIndex('POST', '/api/repos', { ...basePayload, name: 'ceiling-check' }) as { id: string }

        // 3.7h 在 schema 静态上限内，但超过默认封顶 60 分钟 → 由 API 层封顶校验拒绝
        const err = await expectError(
            callId('PUT', `/api/repos/${created.id}`, { executionTimeoutMs: 3_700_000 }, { id: created.id }),
            400,
        )
        expect(JSON.stringify(err.data)).toContain('封顶')

        const detail = await callId('GET', `/api/repos/${created.id}`, undefined, { id: created.id }) as Record<string, unknown>
        expect(detail.executionTimeoutMs).toBeNull()
    })

    it('执行超时实际变化时登记 execution_limits_update 审计（AC9）', async () => {
        mockRequireOrgResource.mockReset()
        mockRequireOrgResource.mockImplementation(async () => undefined)
        const created = await callIndex('POST', '/api/repos', { ...basePayload, name: 'limits-audit' }) as { id: string }

        await callId('PUT', `/api/repos/${created.id}`, { executionTimeoutMs: 2_700_000 }, { id: created.id })

        const ds = await ensureDatabaseInitialized()
        const events = await ds.getRepository(AuditEvent).find({ where: { type: 'execution_limits_update' } })
        const event = events.find((item) => item.repositoryId === created.id)
        expect(event).toBeDefined()
        expect(event!.payloadJson).toContain('2700000')
    })

    it('跨大版本授权：默认关闭、开启落库并登记审计、重复设置不新增审计', async () => {
        mockRequireOrgResource.mockReset()
        mockRequireOrgResource.mockImplementation(async () => undefined)
        const created = await callIndex('POST', '/api/repos', { ...basePayload, name: 'major-upgrade' }) as { id: string }

        const initial = await callId('GET', `/api/repos/${created.id}`, undefined, { id: created.id }) as Record<string, unknown>
        expect(initial.allowMajorUpgrade).toBe(false)

        await callId('PUT', `/api/repos/${created.id}`, { allowMajorUpgrade: true }, { id: created.id })
        const enabled = await callId('GET', `/api/repos/${created.id}`, undefined, { id: created.id }) as Record<string, unknown>
        expect(enabled.allowMajorUpgrade).toBe(true)

        const ds = await ensureDatabaseInitialized()
        const events = await ds.getRepository(AuditEvent).find({ where: { type: 'major_upgrade_policy_update' } })
        const mine = events.filter((item) => item.repositoryId === created.id)
        expect(mine).toHaveLength(1)
        expect(mine[0]!.payloadJson).toContain('"next":true')

        // 同值重复设置不新增审计
        await callId('PUT', `/api/repos/${created.id}`, { allowMajorUpgrade: true }, { id: created.id })
        const afterRepeat = await ds.getRepository(AuditEvent).find({ where: { type: 'major_upgrade_policy_update' } })
        expect(afterRepeat.filter((item) => item.repositoryId === created.id)).toHaveLength(1)
    })

})
