import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import patchHandler from './[id].patch'
import { PRCheck } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (id: string, body: Record<string, unknown>) => patchHandler(
    makeEvent('PATCH', `/api/pr-checks/${id}`, body, {}, { id }),
)

describe('PATCH /api/pr-checks/[id]', () => {
    let firingId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }

        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(PRCheck)
        const saved = await repo.save(repo.create({
            repositoryId: created.id,
            prNumber: 1,
            headSha: 'a'.repeat(40),
            authorLogin: 'dependabot[bot]',
            conclusion: 'failure',
            alertFiring: true,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-03T00:00:00Z'),
        }))
        firingId = saved.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('ack 成功：alertFiring=false + acknowledgedAt 非空 + acknowledgedByUserId 写入', async () => {
        const result = await call(firingId, { alertFiring: false }) as {
            id: string
            alertFiring: boolean
            acknowledgedAt: string | null
            acknowledgedByUserId: string | null
            conclusion: string
        }
        expect(result.id).toBe(firingId)
        expect(result.alertFiring).toBe(false)
        expect(result.acknowledgedAt).not.toBeNull()
        expect(result.acknowledgedByUserId).toBe('u1')
        // 关键决策 D3：ack 不修改 conclusion（service polling 继续独立判定）
        expect(result.conclusion).toBe('failure')
    })

    it('不存在的 id → 404 + PR_CHECK_NOT_FOUND', async () => {
        await expect(call('no-such-id', { alertFiring: false })).rejects.toMatchObject({
            statusCode: 404,
            data: { code: 'PR_CHECK_NOT_FOUND' },
        })
    })

    it('alertFiring 不是 false → 400 + PR_CHECK_ACK_VALIDATION_FAILED', async () => {
        await expect(call(firingId, { alertFiring: true })).rejects.toMatchObject({
            statusCode: 400,
            data: { code: 'PR_CHECK_ACK_VALIDATION_FAILED' },
        })
    })

    it('缺 id → 400 + PR_CHECK_ID_MISSING', async () => {
        await expect(patchHandler(makeEvent('PATCH', '/api/pr-checks/', { alertFiring: false }, {}, {}))).rejects.toMatchObject({
            statusCode: 400,
            data: { code: 'PR_CHECK_ID_MISSING' },
        })
    })

    // 防御性 ack 验证：成功 ack 后数据库持久化
    describe('ack 后数据库持久化', () => {
        let secondFiringId: string

        beforeAll(async () => {
            // 复用外层 beforeAll 已创建的 demo/app，插入第二行 PRCheck（同一仓库不同 prNumber）
            const ds = await ensureDatabaseInitialized()
            const repo = ds.getRepository(PRCheck)
            // 取外层 beforeAll 已建仓库的 repositoryId（通过列已存在行反查）
            const existing = await repo.findOne({ where: {} })
            const repositoryId = existing?.repositoryId
            if (!repositoryId) {
                throw new Error('ack 后数据库持久化 测试需要先有 PRCheck 行')
            }
            const saved = await repo.save(repo.create({
                repositoryId,
                prNumber: 2,
                headSha: 'b'.repeat(40),
                authorLogin: 'dependfix[bot]',
                conclusion: 'failure',
                alertFiring: true,
                acknowledgedAt: null,
                acknowledgedByUserId: null,
                lastPolledAt: new Date('2026-09-03T00:00:00Z'),
            }))
            secondFiringId = saved.id
        })

        it('ack 后再次查询数据库：alertFiring=false', async () => {
            await call(secondFiringId, { alertFiring: false })
            const ds = await ensureDatabaseInitialized()
            const row = await ds.getRepository(PRCheck).findOne({ where: { id: secondFiringId } })
            expect(row?.alertFiring).toBe(false)
            expect(row?.acknowledgedAt).toBeInstanceOf(Date)
            expect(row?.acknowledgedByUserId).toBe('u1')
        })
    })
})
