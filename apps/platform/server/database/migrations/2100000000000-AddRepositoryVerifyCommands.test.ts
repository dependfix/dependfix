import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { AddRepositoryVerifyCommands2100000000000 } from './2100000000000-AddRepositoryVerifyCommands'

/**
 * Repository.verifyCommands 列迁移的正确性 + 幂等性（口径见 docs/standards/platform.md §3.8）。
 *
 * 覆盖点：
 * 1. 默认前缀 `dependfix_` 下真正生效（既有迁移硬编码无前缀表名会静默 no-op，本迁移前缀感知）
 * 2. 无前缀表名（DATABASE_ENTITY_PREFIX=''）下同样生效
 * 3. up / down 各自幂等（二次运行不抛错）
 * 4. 目标表不存在时 no-op（不抛错）
 */
describe('AddRepositoryVerifyCommands migration', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (entityPrefix: string): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-verify-cmds-'))
        const ds = new DataSource({
            type: 'better-sqlite3',
            database: join(dir, 'test.sqlite'),
            driver: betterSqlite3,
            entities: [],
            migrations: [],
            synchronize: false,
            entityPrefix,
        })
        dataSources.push(ds)
        await ds.initialize()
        return ds
    }

    const columnNames = async (ds: DataSource, table: string): Promise<string[]> => {
        const rows = await ds.query(`PRAGMA table_info('${table}')`) as { name: string }[]
        return rows.map((r) => r.name)
    }

    const withRunner = async <T>(ds: DataSource, fn: (runner: QueryRunner) => Promise<T>): Promise<T> => {
        const runner = ds.createQueryRunner()
        try {
            return await fn(runner)
        } finally {
            await runner.release()
        }
    }

    afterEach(async () => {
        for (const ds of dataSources.splice(0)) {
            if (ds.isInitialized) {
                await ds.destroy()
            }
        }
        if (dir) {
            await rm(dir, { recursive: true, force: true })
            dir = undefined
        }
    })

    it('adds verify_commands under the default dependfix_ prefix', async () => {
        // 平台默认 entityPrefix = 'dependfix_'（createDataSourceOptions）
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY, owner varchar(100))')

        await withRunner(ds, (runner) => new AddRepositoryVerifyCommands2100000000000().up(runner))

        expect(await columnNames(ds, 'dependfix_repository')).toContain('verify_commands')
    })

    it('adds verify_commands when prefix is empty', async () => {
        const ds = await makeDataSource('')
        await ds.query('CREATE TABLE repository (id varchar(36) PRIMARY KEY, owner varchar(100))')

        await withRunner(ds, (runner) => new AddRepositoryVerifyCommands2100000000000().up(runner))

        expect(await columnNames(ds, 'repository')).toContain('verify_commands')
    })

    it('is idempotent: up twice adds a single column without throwing', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY)')
        const migration = new AddRepositoryVerifyCommands2100000000000()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.up(runner)
        })

        const names = await columnNames(ds, 'dependfix_repository')
        expect(names.filter((n) => n === 'verify_commands')).toHaveLength(1)
    })

    it('down drops the column and is idempotent', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY)')
        const migration = new AddRepositoryVerifyCommands2100000000000()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.down(runner)
            await migration.down(runner)
        })

        expect(await columnNames(ds, 'dependfix_repository')).not.toContain('verify_commands')
    })

    it('prefers the prefixed table when both prefixed and unprefixed tables exist', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY)')
        await ds.query('CREATE TABLE repository (id varchar(36) PRIMARY KEY)')

        await withRunner(ds, (runner) => new AddRepositoryVerifyCommands2100000000000().up(runner))

        expect(await columnNames(ds, 'dependfix_repository')).toContain('verify_commands')
        expect(await columnNames(ds, 'repository')).not.toContain('verify_commands')
    })

    it('is a no-op when the target table does not exist', async () => {
        const ds = await makeDataSource('dependfix_')

        await expect(
            withRunner(ds, (runner) => new AddRepositoryVerifyCommands2100000000000().up(runner)),
        ).resolves.toBeUndefined()
        await expect(
            withRunner(ds, (runner) => new AddRepositoryVerifyCommands2100000000000().down(runner)),
        ).resolves.toBeUndefined()
    })
})
