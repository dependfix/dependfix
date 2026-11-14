import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposHandler from './index'
import { ensureDatabaseInitialized } from '#server/database'
import { AuditEvent } from '#server/entities/audit-event'
import { Repository } from '#server/entities/repository'

// 鉴权由 guard.test.ts 单独覆盖：API handler 测试 mock guard 层，聚焦业务逻辑；
// 但 todo.md §M16.5 T701-e2e 补强要求 API handler 测试也覆盖三角色鉴权——
// 这里把 mock 改为可重写（默认 admin），三角色相关 case 用 mockRequireRole.mockResolvedValueOnce 切换
const { mockRequireAuth, mockRequireRole } = vi.hoisted(() => ({
    mockRequireAuth: vi.fn(async () => ({ user: { id: 'user-1', email: 'admin@test.dev' } })),
    mockRequireRole: vi.fn(async () => ({ user: { id: 'user-1', email: 'admin@test.dev' } })),
}))
vi.mock('#server/utils/guard', () => ({
    requireAuth: mockRequireAuth,
    requireRole: mockRequireRole,
}))

const call = (method: string, url: string, body?: unknown) => reposHandler(makeEvent(method, url, body))

describe('GET /api/repos', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('returns empty list on fresh database', async () => {
        const result = await call('GET', '/api/repos')
        expect(result).toEqual([])
    })

    it('returns created repository in list view (with null credentialName)', async () => {
        await call('POST', '/api/repos', {
            owner: 'dependfix',
            name: 'dependfix',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'master',
            executorKind: 'container',
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({
            owner: 'dependfix',
            name: 'dependfix',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'master',
            credentialName: null,
            tags: [],
        })
        expect(list[0]!.id).toBeTruthy()
    })

    it('rejects duplicate repository with 409 (localized message + data.code, todo.md §M16.3)', async () => {
        const payload = {
            owner: 'dup',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }
        await call('POST', '/api/repos', payload)
        await expect(call('POST', '/api/repos', payload)).rejects.toMatchObject({
            statusCode: 409,
            // 默认 zh-CN locale（无 cookie / Accept-Language）→ 中文 message
            message: '该仓库已存在',
            // 错误码强契约位置：客户端通过 data.code 路由分支判断（h3 序列化保留 data）
            data: { code: 'REPO_DUPLICATE' },
        })
    })

    it('defaults allowMajorUpgrade to false when body omits it and no platform default is set', async () => {
        const created = await call('POST', '/api/repos', {
            owner: 'major-off',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }) as { allowMajorUpgrade: boolean }
        expect(created.allowMajorUpgrade).toBe(false)
    })

    it('stores a repository-level sandbox image and returns it in views', async () => {
        const created = await call('POST', '/api/repos', {
            owner: 'sandbox-image',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
            sandboxImage: 'ghcr.io/owner/dependfix:1.2.3',
        }) as { sandboxImage: string | null }
        expect(created.sandboxImage).toBe('ghcr.io/owner/dependfix:1.2.3')

        const list = await call('GET', '/api/repos') as { owner: string, sandboxImage: string | null }[]
        expect(list.find((item) => item.owner === 'sandbox-image')?.sandboxImage).toBe('ghcr.io/owner/dependfix:1.2.3')
    })

    it('normalizes a blank sandbox image to null and rejects invalid references', async () => {
        const blank = await call('POST', '/api/repos', {
            owner: 'sandbox-blank',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
            sandboxImage: '   ',
        }) as { sandboxImage: string | null }
        expect(blank.sandboxImage).toBeNull()

        await expect(call('POST', '/api/repos', {
            owner: 'sandbox-bad',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
            sandboxImage: 'https://ghcr.io/owner/dependfix:latest',
        })).rejects.toMatchObject({ statusCode: 400 })
    })

    it('uses runtime-config default for allowMajorUpgrade when body omits it', async () => {
        const globalScope = globalThis as { useRuntimeConfig?: () => unknown }
        const original = globalScope.useRuntimeConfig
        globalScope.useRuntimeConfig = () => ({ public: { allowMajorUpgradeDefault: true } })
        try {
            const base = { platform: 'github', packageManager: 'pnpm', defaultBranch: 'main', executorKind: 'container' }
            const created = await call('POST', '/api/repos', {
                ...base,
                owner: 'major-default',
                name: 'repo',
            }) as { allowMajorUpgrade: boolean }
            expect(created.allowMajorUpgrade).toBe(true)

            // 默认开启仍走审计留痕
            const ds = await ensureDatabaseInitialized()
            const saved = await ds.getRepository(Repository).findOneByOrFail({ owner: 'major-default', name: 'repo' })
            const events = await ds.getRepository(AuditEvent).find({
                where: { repositoryId: saved.id, type: 'major_upgrade_policy_update' },
            })
            expect(events).toHaveLength(1)

            // 请求体显式 false 优先于平台默认值（表单编辑 / 显式关闭）
            const explicit = await call('POST', '/api/repos', {
                ...base,
                owner: 'major-explicit',
                name: 'repo',
                allowMajorUpgrade: false,
            }) as { allowMajorUpgrade: boolean }
            expect(explicit.allowMajorUpgrade).toBe(false)
        } finally {
            globalScope.useRuntimeConfig = original
        }
    })

    it('rejects invalid body with 400 + data.code: REPO_VALIDATION_FAILED + data.issues 透传', async () => {
        await expect(call('POST', '/api/repos', { owner: 'x' })).rejects.toMatchObject({
            statusCode: 400,
            message: '参数校验失败',
            data: {
                code: 'REPO_VALIDATION_FAILED',
                issues: expect.any(Array),
            },
        })
    })

    it('persists tags array as JSON column and reads back', async () => {
        await call('POST', '/api/repos', {
            owner: 'tags',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
            tags: ['prod', 'core'],
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        const item = list.find((r) => r.owner === 'tags')
        expect(item?.tags).toEqual(['prod', 'core'])
    })

    it('persists sandboxLimits object as JSON column and reads back', async () => {
        // POST 路径序列化 sandboxLimits → toView 反序列化读取
        // （sandbox 入口已恢复：report-only 真实执行；字段用于仓库级资源限额）
        await call('POST', '/api/repos', {
            owner: 'sb-limits',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
            sandboxLimits: { memoryMb: 8192, cpu: 1.5 },
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        const item = list.find((r) => r.owner === 'sb-limits')
        expect(item?.sandboxLimits).toEqual({ memoryMb: 8192, cpu: 1.5 })
    })

    it('accepts sandbox executor (entry restored)', async () => {
        await call('POST', '/api/repos', {
            owner: 'sb-enabled',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        const item = list.find((r) => r.owner === 'sb-enabled')
        expect(item?.executorKind).toBe('sandbox')
    })

    it('omits sandboxLimits when not provided (走平台 SANDBOX_DEFAULTS)', async () => {
        await call('POST', '/api/repos', {
            owner: 'no-limits',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        const item = list.find((r) => r.owner === 'no-limits')
        expect(item?.sandboxLimits).toBeUndefined()
    })

    it('rejects unsupported method with 405', async () => {
        await expect(call('PUT', '/api/repos')).rejects.toMatchObject({ statusCode: 405 })
    })

    describe('verifyCommands（平台侧自定义验证命令）', () => {
        it('persists verifyCommands array as JSON column and reads back', async () => {
            await call('POST', '/api/repos', {
                owner: 'vc-list',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
                verifyCommands: ['pnpm install --frozen-lockfile', 'pnpm test'],
            })
            const list = await call('GET', '/api/repos') as Record<string, unknown>[]
            const item = list.find((r) => r.owner === 'vc-list')
            expect(item?.verifyCommands).toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])
        })

        it('returns empty verifyCommands when not provided (走引擎默认验证链)', async () => {
            await call('POST', '/api/repos', {
                owner: 'vc-empty',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            })
            const list = await call('GET', '/api/repos') as Record<string, unknown>[]
            expect(list.find((r) => r.owner === 'vc-empty')?.verifyCommands).toEqual([])
        })

        it('rejects verifyCommands with control characters (400, 保持「一项 = 一条命令行」)', async () => {
            await expect(call('POST', '/api/repos', {
                owner: 'vc-invalid',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
                verifyCommands: ['pnpm lint\nrm -rf /'],
            })).rejects.toMatchObject({
                statusCode: 400,
                data: { code: 'REPO_VALIDATION_FAILED' },
            })
        })

        it('records verify_commands_update audit event on create', async () => {
            const created = await call('POST', '/api/repos', {
                owner: 'vc-audit',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
                verifyCommands: ['pnpm test'],
            }) as { id: string }

            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({ where: { repositoryId: created.id } })
            expect(events).toHaveLength(1)
            expect(events[0]!.type).toBe('verify_commands_update')
            expect(JSON.parse(events[0]!.payloadJson!)).toEqual({
                repository: 'vc-audit/repo',
                previous: [],
                next: ['pnpm test'],
            })
        })

        it('does not record audit event on create without commands', async () => {
            const created = await call('POST', '/api/repos', {
                owner: 'vc-no-audit',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            }) as { id: string }

            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({ where: { repositoryId: created.id } })
            expect(events).toHaveLength(0)
        })
    })

    describe('prCheckFocus（PR Check 告警关注集）', () => {
        it('persists prCheckFocus on create and returns the normalized view', async () => {
            await call('POST', '/api/repos', {
                owner: 'focus-create',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
                prCheckFocus: {
                    providers: [' Vercel ', 'vercel'],
                    names: [' Test '],
                    kinds: ['check'],
                },
            })
            const list = await call('GET', '/api/repos') as Record<string, unknown>[]
            expect(list.find((r) => r.owner === 'focus-create')?.prCheckFocus).toEqual({
                providers: ['vercel'],
                names: ['Test'],
                kinds: ['check'],
            })
        })

        it('returns null prCheckFocus when not configured（未配置 = 全量告警）', async () => {
            await call('POST', '/api/repos', {
                owner: 'focus-empty',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            })
            const list = await call('GET', '/api/repos') as Record<string, unknown>[]
            expect(list.find((r) => r.owner === 'focus-empty')?.prCheckFocus).toBeNull()
        })

        it('rejects prCheckFocus with invalid kind (400)', async () => {
            await expect(call('POST', '/api/repos', {
                owner: 'focus-invalid',
                name: 'repo',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
                prCheckFocus: { kinds: ['bogus'] },
            })).rejects.toMatchObject({
                statusCode: 400,
                data: { code: 'REPO_VALIDATION_FAILED' },
            })
        })
    })
})

/**
 * 三角色鉴权验证（todo.md §M16.5 T701-e2e）：
 * viewer 只读 / admin + org_admin 写操作 / 未登录 401
 *
 * 默认 mock 为 admin 通过；以下 case 用 mockRequireRole.mockImplementationOnce / mockRequireAuth.mockImplementationOnce
 * 让 guard 抛 401/403 模拟角色权限拦截。
 *
 * 角色语义：
 * - viewer：只能 GET（只读）；POST / PUT / DELETE 应被 403 拦截
 * - org_admin：可写（与 admin 同等权限），POST / PUT / DELETE 通过
 * - admin：默认全权限
 * - 未登录：GET 也应被 401 拦截
 */
describe('/api/repos 三角色鉴权（todo.md §M16.5）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('viewer 调 POST /api/repos → 403 (requireRole 拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(call('POST', '/api/repos', {
            owner: 'viewer-blocked',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })).rejects.toMatchObject({ statusCode: 403 })
    })

    it('org_admin 调 POST /api/repos → 200 (write 权限放行)', async () => {
        mockRequireRole.mockResolvedValueOnce({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        const created = await call('POST', '/api/repos', {
            owner: 'orgadmin-success',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }) as { id: string, owner: string }
        expect(created.owner).toBe('orgadmin-success')
        expect(created.id).toBeTruthy()
    })

    it('viewer 调 GET /api/repos → 200 (只读放行)', async () => {
        mockRequireAuth.mockResolvedValueOnce({ user: { id: 'viewer-1', email: 'viewer@test.dev' } })
        const list = await call('GET', '/api/repos')
        expect(Array.isArray(list)).toBe(true)
    })

    it('未登录调 GET /api/repos → 401 (requireAuth 拒绝)', async () => {
        mockRequireAuth.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Unauthorized' })
        })
        await expect(call('GET', '/api/repos')).rejects.toMatchObject({ statusCode: 401 })
    })
})
