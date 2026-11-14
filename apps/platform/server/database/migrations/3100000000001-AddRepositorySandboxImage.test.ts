import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { AddRepositorySandboxImage3100000000001 } from './3100000000001-AddRepositorySandboxImage'

/**
 * Repository 仓库级沙箱镜像列迁移的正确性 + 幂等性。
 *
 * 覆盖点（与既有同类迁移用例同口径）：
 * 1. 默认前缀 `dependfix_` 下真正生效（前缀感知，非静默 no-op），且列**可空**（存量行保持 NULL）
 * 2. 无前缀表名（DATABASE_ENTITY_PREFIX=''）下同样生效
 * 3. up / down 各自幂等（二次运行不抛错）
 * 4. 目标表不存在时 no-op（不抛错）
 * 5. 前缀表与无前缀表并存时优先前缀表（不回落到无前缀表）
 */
describe('AddRepositorySandboxImage migration', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []
    const COLUMNS = ['sandbox_image'] as const

    const makeDataSource = async (entityPrefix: string): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-repository-sandbox-image-'))
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

    const columnInfos = async (ds: DataSource, table: string) =>
        await ds.query(`PRAGMA table_info('${table}')`) as { name: string, notnull: number }[]

    const columnNames = async (ds: DataSource, table: string): Promise<string[]> =>
        (await columnInfos(ds, table)).map((row) => row.name)

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

    it('adds the nullable sandbox_image column under the default dependfix_ prefix', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY, status varchar(32))')

        await withRunner(ds, (runner) => new AddRepositorySandboxImage3100000000001().up(runner))

        const infos = await columnInfos(ds, 'dependfix_repository')
        for (const column of COLUMNS) {
            expect(infos.map((info) => info.name)).toContain(column)
            // 可空：存量行不回填，UI 按「继承平台默认」展示（不得有 NOT NULL 默认值）
            expect(infos.find((info) => info.name === column)?.notnull).toBe(0)
        }
    })

    it('adds the column when prefix is empty', async () => {
        const ds = await makeDataSource('')
        await ds.query('CREATE TABLE repository (id varchar(36) PRIMARY KEY, status varchar(32))')

        await withRunner(ds, (runner) => new AddRepositorySandboxImage3100000000001().up(runner))

        const names = await columnNames(ds, 'repository')
        for (const column of COLUMNS) {
            expect(names).toContain(column)
        }
    })

    it('is idempotent: up twice adds each column exactly once without throwing', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY)')
        const migration = new AddRepositorySandboxImage3100000000001()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.up(runner)
        })

        const names = await columnNames(ds, 'dependfix_repository')
        for (const column of COLUMNS) {
            expect(names.filter((name) => name === column)).toHaveLength(1)
        }
    })

    it('down 幂等：删列后再删不抛错', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY)')
        const migration = new AddRepositorySandboxImage3100000000001()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.down(runner)
            await migration.down(runner)
        })

        expect(await columnNames(ds, 'dependfix_repository')).toEqual(['id'])
    })

    it('down drops the column and is idempotent', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY)')
        const migration = new AddRepositorySandboxImage3100000000001()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.down(runner)
            await migration.down(runner)
        })

        const names = await columnNames(ds, 'dependfix_repository')
        for (const column of COLUMNS) {
            expect(names).not.toContain(column)
        }
    })

    it('prefers the prefixed table when both prefixed and unprefixed tables exist', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_repository (id varchar(36) PRIMARY KEY)')
        await ds.query('CREATE TABLE repository (id varchar(36) PRIMARY KEY)')

        await withRunner(ds, (runner) => new AddRepositorySandboxImage3100000000001().up(runner))

        const prefixed = await columnNames(ds, 'dependfix_repository')
        const unprefixed = await columnNames(ds, 'repository')
        for (const column of COLUMNS) {
            expect(prefixed).toContain(column)
            expect(unprefixed).not.toContain(column)
        }
    })

    it('is a no-op when the target table does not exist', async () => {
        const ds = await makeDataSource('dependfix_')

        await expect(
            withRunner(ds, (runner) => new AddRepositorySandboxImage3100000000001().up(runner)),
        ).resolves.toBeUndefined()
        await expect(
            withRunner(ds, (runner) => new AddRepositorySandboxImage3100000000001().down(runner)),
        ).resolves.toBeUndefined()
    })
})
