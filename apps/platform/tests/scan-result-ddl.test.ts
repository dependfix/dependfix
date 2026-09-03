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
 * 4. M23.3 C66-A1 新增的 ghsa_id / cve_ids 列 + 复合索引 (repository_id, ghsa_id) 存在
 *    （migration raw SQL 必须用 snake_case 列名，详见 [todo.md §M24 follow-up #6](../plan/todo.md)）
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

    /**
     * M23.3 C66-A1 DDL 回归测试（2026-09-03 加固）：
     * 验证 ghsa_id / cve_ids 列 + 复合索引 `(repository_id, ghsa_id)` 正确生成。
     *
     * 背景：原 migration 1750000000000-AddScanResultIdentifiers raw SQL 用 camelCase 列名
     * （`repositoryId` / `ghsaId`），`queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`，
     * 实际表是 snake_case，导致 `no such column: repositoryId` 报错。
     * 修复后 raw SQL 改为 snake_case，本测试断言列名 + 索引按 snake_case 落地。
     */
    it('M23.3 ghsa_id / cve_ids columns + composite index (repository_id, ghsa_id) exist (snake_case regression)', async () => {
        setupMemoryDatabase()
        try {
            const ds = await ensureDatabaseInitialized()
            const queryRunner = ds.manager.connection.createQueryRunner()

            // 1. ghsa_id / cve_ids 列必须存在且 nullable
            const columns = await queryRunner.query(`PRAGMA table_info('dependfix_scan_result')`)
            const ghsaCol = columns.find((c: { name: string }) => c.name === 'ghsa_id')
            const cveCol = columns.find((c: { name: string }) => c.name === 'cve_ids')
            expect(ghsaCol, 'ghsa_id 列必须存在（migration raw SQL 必须用 snake_case）').toBeDefined()
            expect(ghsaCol.notnull, 'ghsa_id 列必须 nullable').toBe(0)
            expect(cveCol, 'cve_ids 列必须存在').toBeDefined()
            expect(cveCol.notnull, 'cve_ids 列必须 nullable').toBe(0)

            // 2. camelCase 形式不能存在（如果存在则说明 raw SQL 用了错误大小写）
            expect(columns.find((c: { name: string }) => c.name === 'ghsaId'), 'ghsaId 列不应存在（应为 snake_case ghsa_id）').toBeUndefined()
            expect(columns.find((c: { name: string }) => c.name === 'cveIds'), 'cveIds 列不应存在').toBeUndefined()

            // 3. 复合索引 (repository_id, ghsa_id) 必须存在
            const indices = await queryRunner.query(
                `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='dependfix_scan_result'`,
            )
            const repoGhsaIndex = indices.find((i: { name: string, sql: string }) =>
                i.name === 'idx_scan_result_repo_ghsa'
                && i.sql?.includes('repository_id')
                && i.sql?.includes('ghsa_id'),
            )
            expect(repoGhsaIndex, '复合索引 idx_scan_result_repo_ghsa (repository_id, ghsa_id) 必须存在').toBeDefined()
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
