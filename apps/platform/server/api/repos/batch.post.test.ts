import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsIndexHandler from '../credentials/index'
import batchImportHandler from './batch.post'
import reposIndexHandler from './index'
import { Repository } from '#server/entities/repository'
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

    it('persists actionWorkflowFile/note when provided (?? null truthy 路径)', async () => {
        const result = await call({
            repos: [{
                owner: 'demo',
                name: 'with-extras',
                platform: 'github',
                defaultBranch: 'main',
                packageManager: 'pnpm',
                executorKind: 'github-action',
                actionWorkflowFile: '.github/workflows/scan.yml',
                note: 'primary repo',
            }],
        }) as Record<string, unknown>
        expect(result.imported).toBe(1)

        const list = await reposIndexHandler(makeEvent('GET', '/api/repos')) as {
            name: string
            actionWorkflowFile: string | null
            note: string | null
        }[]
        const withExtras = list.find((r) => r.name === 'with-extras')
        expect(withExtras?.actionWorkflowFile).toBe('.github/workflows/scan.yml')
        expect(withExtras?.note).toBe('primary repo')
    })

    it('并发重复导入（UNIQUE constraint failed）→ 视为跳过，整体不失败', async () => {
        // 模拟并发场景：findOne 未命中但 save 撞唯一索引。
        // 真实生产中两个并发请求同时通过 findOne 检查后，第二个 save() 触发约束。
        const ds = await ensureDatabaseInitialized()
        const repoRepo = ds.getRepository(Repository)
        const saveSpy = vi.spyOn(repoRepo, 'save').mockRejectedValueOnce(
            new Error('SQLiteError: UNIQUE constraint failed: repository.owner, repository.name, repository.platform'),
        )

        try {
            const result = await call({
                repos: [repoItem('demo', 'concurrent-dup')],
            }) as Record<string, unknown>

            expect(result.results).toEqual([
                { owner: 'demo', name: 'concurrent-dup', imported: false, skipped: true },
            ])
            expect(result.imported).toBe(0)
            expect(result.skipped).toBe(1)
            expect(saveSpy).toHaveBeenCalledOnce()
        } finally {
            saveSpy.mockRestore()
        }
    })

    it('非唯一约束错误（磁盘满 / 网络断）→ 重新抛出，不静默吞掉', async () => {
        // 防御：handler 必须把非并发错误透传，避免掩盖真问题。
        const ds = await ensureDatabaseInitialized()
        const repoRepo = ds.getRepository(Repository)
        const saveSpy = vi.spyOn(repoRepo, 'save').mockRejectedValueOnce(new Error('disk full'))

        try {
            await expect(call({
                repos: [repoItem('demo', 'disk-error')],
            })).rejects.toThrow('disk full')
            expect(saveSpy).toHaveBeenCalledOnce()
        } finally {
            saveSpy.mockRestore()
        }
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

        // 测试隔离（todo.md §M17.4 commit 2）：L165 用例改 credential.organizationId 后 cleanup 须在 afterEach 兜底，
        // 否则 L190 等后续用例读到外组织凭据导致 RESOURCE_NOT_IN_ORG 误抛。
        afterEach(async () => {
            const ds = await ensureDatabaseInitialized()
            await ds.getRepository(Credential).update(
                { id: credentialId },
                { organizationId: 'dependfix-default' },
            )
        })

        it('defaultCredentialId 不存在 → 400', async () => {
            const err = await expectError(call({
                repos: [repoItem('demo', 'nonexistent-cred')],
                defaultCredentialId: '00000000-0000-0000-0000-000000000000',
            }), 400)
            expect(err.data?.code).toBe('CREDENTIAL_NOT_FOUND')
            expect(err.data?.field).toBe('defaultCredentialId')
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
            expect(err.data?.code).toBe('RESOURCE_NOT_IN_ORG')
            expect(err.data?.resource).toBe('credential')

            // cleanup 由 afterEach 兜底（见上）
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
