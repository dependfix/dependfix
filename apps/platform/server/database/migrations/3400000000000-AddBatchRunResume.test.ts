import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { AddBatchRunResume3400000000000 } from './3400000000000-AddBatchRunResume'

/** batch_run.resumed_from_batch_run_id 迁移：前缀感知 + 幂等 + 存量行为 NULL。 */
describe('AddBatchRunResume migration', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (entityPrefix: string): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-batch-resume-'))
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

    const withRunner = async <T>(ds: DataSource, fn: (runner: QueryRunner) => Promise<T>): Promise<T> => {
        const runner = ds.createQueryRunner()
        try {
            return await fn(runner)
        } finally {
            await runner.release()
        }
    }

    const columnNames = async (ds: DataSource, table: string): Promise<string[]> => {
        const rows = await ds.query(`PRAGMA table_info('${table}')`) as { name: string }[]
        return rows.map((row) => row.name)
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

    it('adds the column and index under a prefix, preserving existing rows as NULL', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_batch_run (id varchar(36) PRIMARY KEY, status varchar(32))')
        await ds.query('INSERT INTO dependfix_batch_run (id, status) VALUES (\'b-1\', \'completed\')')

        await withRunner(ds, (runner) => new AddBatchRunResume3400000000000().up(runner))

        expect(await columnNames(ds, 'dependfix_batch_run')).toContain('resumed_from_batch_run_id')
        const rows = await ds.query('SELECT id, resumed_from_batch_run_id FROM dependfix_batch_run') as { id: string, resumed_from_batch_run_id: string | null }[]
        expect(rows).toEqual([{ id: 'b-1', resumed_from_batch_run_id: null }])
        const indexes = await ds.query('PRAGMA index_list(\'dependfix_batch_run\')') as { name: string }[]
        expect(indexes.map((index) => index.name)).toContain('idx_batch_run_resumed_from')
    })

    it('is idempotent on up / down', async () => {
        const ds = await makeDataSource('')
        await ds.query('CREATE TABLE batch_run (id varchar(36) PRIMARY KEY)')
        const migration = new AddBatchRunResume3400000000000()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.up(runner)
        })
        expect((await columnNames(ds, 'batch_run')).filter((name) => name === 'resumed_from_batch_run_id')).toHaveLength(1)

        await withRunner(ds, async (runner) => {
            await migration.down(runner)
            await migration.down(runner)
        })
        expect(await columnNames(ds, 'batch_run')).not.toContain('resumed_from_batch_run_id')
    })

    it('is a no-op when the table does not exist', async () => {
        const ds = await makeDataSource('')
        await expect(withRunner(ds, (runner) => new AddBatchRunResume3400000000000().up(runner))).resolves.toBeUndefined()
    })
})
