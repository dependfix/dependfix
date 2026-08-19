import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsIndexHandler from '../credentials/index'
import batchImportHandler from './batch.post'
import reposIndexHandler from './index'
import { Credential } from '#server/entities/credential'
import { Organization } from '#server/entities/organization'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (body?: unknown) => batchImportHandler(makeEvent('POST', '/api/repos/batch', body))

const repoItem = (owner: string, name: string) => ({
    owner,
    name,
    platform: 'github',
    defaultBranch: 'main',
    packageManager: 'pnpm',
    executorKind: 'container',
})

describe('POST /api/repos/batch', () => {
    beforeAll(() => {
        setupMemoryDatabase()
        process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'
    })

    afterAll(() => {
        teardownMemoryDatabase()
        delete process.env.ENCRYPTION_KEY
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects invalid body with 400', async () => {
        await expectError(call({ repos: [{ owner: 'x' }] }), 400)
        await expectError(call({}), 400)
    })

    it('imports new repositories and skips duplicates', async () => {
        await reposIndexHandler(makeEvent('POST', '/api/repos', repoItem('demo', 'existing')))

        const result = await call({
            repos: [
                repoItem('demo', 'existing'),
                repoItem('demo', 'new-a'),
                repoItem('demo', 'new-b'),
            ],
        }) as Record<string, unknown>
        expect(result).toEqual({
            results: [
                { owner: 'demo', name: 'existing', imported: false, skipped: true },
                { owner: 'demo', name: 'new-a', imported: true, skipped: false },
                { owner: 'demo', name: 'new-b', imported: true, skipped: false },
            ],
            imported: 2,
            skipped: 1,
        })

        // 列表确认只新增 2 个
        const list = await reposIndexHandler(makeEvent('GET', '/api/repos')) as Record<string, unknown>[]
        expect(list).toHaveLength(3)
    })

    it('rejects empty repos array with 400 (at least one repository required)', async () => {
        await expectError(call({ repos: [] }), 400)
    })

    // docs/plan/todo.md §PR3-3 C50：defaultCredentialId 三路径校验
    describe('defaultCredentialId 前置校验', () => {
        let credentialId: string

        beforeAll(async () => {
            // 创建凭据（属于默认组织 'dependfix-default'）
            const created = await credentialsIndexHandler(makeEvent('POST', '/api/credentials', {
                name: 'github-pat-c50',
                type: 'classic-pat',
                token: 'ghp_batch-test-token',
            })) as { id: string }
            credentialId = created.id
        })

        it('defaultCredentialId 不存在 → 400', async () => {
            const err = await expectError(call({
                repos: [repoItem('demo', 'nonexistent-cred')],
                defaultCredentialId: '00000000-0000-0000-0000-000000000000',
            }), 400)
            expect(err.message).toContain('defaultCredentialId 不存在')
        })

        it('defaultCredentialId 跨组织 → 403（防误关联 FK 悬空）', async () => {
            // 准备：先在 organization 表插入外组织（FK 约束要求），再把凭据挂过去
            const ds = await ensureDatabaseInitialized()
            await ds.getRepository(Organization).save({
                id: 'foreign-org-not-current',
                name: 'Foreign Org',
            })
            await ds.getRepository(Credential).update(
                { id: credentialId },
                { organizationId: 'foreign-org-not-current' },
            )

            const err = await expectError(call({
                repos: [repoItem('demo', 'cross-org-test')],
                defaultCredentialId: credentialId,
            }), 403)
            expect(err.message).toContain('默认凭据不属于当前组织')

            // 清理：恢复组织避免影响后续测试
            await ds.getRepository(Credential).update(
                { id: credentialId },
                { organizationId: 'dependfix-default' },
            )
        })

        it('defaultCredentialId 正常透传 → 所有新建仓库写库带 credentialId', async () => {
            const result = await call({
                repos: [
                    repoItem('demo', 'c50-a'),
                    repoItem('demo', 'c50-b'),
                ],
                defaultCredentialId: credentialId,
            }) as Record<string, unknown>

            expect(result.imported).toBe(2)
            expect(result.skipped).toBe(0)

            // 数据库验证：两个新建仓库的 credentialId 等于传入的 credentialId
            const list = await reposIndexHandler(makeEvent('GET', '/api/repos')) as {
                owner: string
                name: string
                credentialId: string | null
            }[]
            const c50a = list.find((r) => r.name === 'c50-a')
            const c50b = list.find((r) => r.name === 'c50-b')
            expect(c50a?.credentialId).toBe(credentialId)
            expect(c50b?.credentialId).toBe(credentialId)
        })

        it('defaultCredentialId 缺省（null/undefined）→ 仓库 credentialId=null 保持兼容', async () => {
            const result = await call({
                repos: [repoItem('demo', 'c50-no-default')],
                defaultCredentialId: null,
            }) as Record<string, unknown>
            expect(result.imported).toBe(1)

            const list = await reposIndexHandler(makeEvent('GET', '/api/repos')) as {
                name: string
                credentialId: string | null
            }[]
            expect(list.find((r) => r.name === 'c50-no-default')?.credentialId).toBeNull()
        })
    })
})
