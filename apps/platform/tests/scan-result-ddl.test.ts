import { describe, it, expect, vi } from 'vitest'
import reposIndexHandler from '../server/api/repos/index'
import { ensureDatabaseInitialized } from '../server/database'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from './api-helper'

// 复用 repos API 创建仓库数据：guard 走 mock（真实 getAuth 依赖 Nuxt useRuntimeConfig）
vi.mock('../server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

/**
 * D 阶段自检强制项 §3b：
 * TypeORM 1.x 复合索引必须在类级声明，否则 e2e 二次运行时会暴露第二个仓库的 500 错误。
 *
 * 本测试验证：
 * 1. SQLite DDL 中确实生成了 `(repository_id, upstream_id)` 复合唯一索引
 * 2. 索引声明在类级（`@Index('idx_scan_result_repo_upstream', ['repositoryId', 'upstreamId'], { unique: true })`）
 * 3. INSERT 重复 (repositoryId, upstreamId) 组合会被数据库层拒掉
 */
describe('M20.3 ScanResult entity DDL validation', () => {
    it('composite unique index (repositoryId, upstreamId) is created at table level', async () => {
        setupMemoryDatabase()
        try {
            const ds = await ensureDatabaseInitialized()
            const queryRunner = ds.manager.connection.createQueryRunner()

            // 1. 查 ScanResult 表的所有索引
            const indices = await queryRunner.query(
                `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='dependfix_scan_result'`,
            )
            const uniqueIndex = indices.find((i: { sql: string }) =>
                i.sql?.includes('UNIQUE') && i.sql?.includes('repository_id') && i.sql?.includes('upstream_id'),
            )
            expect(uniqueIndex, '复合唯一索引 (repository_id, upstream_id) 必须存在').toBeDefined()

            // 2. 查 ScanResult 表所有列的 nullable 状态
            const columns = await queryRunner.query(
                `PRAGMA table_info('dependfix_scan_result')`,
            )
            const requiredFields = ['repository_id', 'upstream_id', 'first_seen_at', 'last_seen_at', 'occurrence_count']
            for (const field of requiredFields) {
                const col = columns.find((c: { name: string }) => c.name === field)
                expect(col, `${field} 列必须存在`).toBeDefined()
                expect(col.notnull, `${field} 列必须 NOT NULL（TypeORM nullable: false）`).toBe(1)
            }
        } finally {
            teardownMemoryDatabase()
        }
    })

    it('INSERT duplicate (repositoryId, upstreamId) is rejected by database unique constraint', async () => {
        setupMemoryDatabase()
        try {
            // 通过 repos API 创建仓库（自动处理 organizationId FK）
            const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
                owner: 'demo',
                name: 'unique-test',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            })) as { id: string }
            const repositoryId = created.id

            const ds = await ensureDatabaseInitialized()
            const { ScanRun: RunEntity } = await import('../server/entities/scan-run')
            const run = await ds.getRepository(RunEntity).save(ds.getRepository(RunEntity).create({
                repositoryId,
                mode: 'fix',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'completed',
            }))

            // 第一次插入 OK（用 create() 触发 BaseEntity @BeforeInsert 钩子生成 id）
            const resultRepo = ds.getRepository('ScanResult' as never)
            await resultRepo.save(resultRepo.create({
                scanRunId: run.id,
                repositoryId,
                upstreamId: 'unique-test:1',
                source: 'dependabot',
                severity: 'high',
                packageName: 'lodash',
                manifestPath: null,
                ruleId: null,
                summary: null,
                fixable: false,
                fixStrategy: null,
                recommendedVersion: null,
                htmlUrl: null,
                fixStatus: 'not-tried',
                errorMessage: null,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                occurrenceCount: 1,
                supersededAt: null,
            }))

            // 第二次插入同 (repositoryId, upstreamId) 应被 unique 约束拒掉
            await expect(
                resultRepo.save(resultRepo.create({
                    scanRunId: run.id,
                    repositoryId,
                    upstreamId: 'unique-test:1', // ← 重复
                    source: 'dependabot',
                    severity: 'critical', // ← 不同 severity 也不影响 unique
                    packageName: 'axios',
                    manifestPath: null,
                    ruleId: null,
                    summary: null,
                    fixable: false,
                    fixStrategy: null,
                    recommendedVersion: null,
                    htmlUrl: null,
                    fixStatus: 'not-tried',
                    errorMessage: null,
                    firstSeenAt: new Date(),
                    lastSeenAt: new Date(),
                    occurrenceCount: 1,
                    supersededAt: null,
                })),
            ).rejects.toThrow(/UNIQUE constraint failed/)
        } finally {
            teardownMemoryDatabase()
        }
    })
})
