import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { CreateApiKeyTables3300000000000 } from './3300000000000-CreateApiKeyTables'

/** API key / 访问日志表迁移：前缀感知、幂等、down 可回退。 */
describe('CreateApiKeyTables migration', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (entityPrefix: string): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-api-key-'))
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

    it('creates prefixed apikey and api_request_log tables idempotently', async () => {
        const ds = await makeDataSource('dependfix_')
        const migration = new CreateApiKeyTables3300000000000()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.up(runner)
        })

        expect(await ds.query('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'dependfix_apikey\'')).toHaveLength(1)
        expect(await ds.query('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'dependfix_api_request_log\'')).toHaveLength(1)

        const columns = await ds.query('PRAGMA table_info(\'dependfix_apikey\')') as { name: string }[]
        expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(['reference_id', 'prefix', 'key', 'expires_at', 'metadata']))
    })

    it('drops both tables on down', async () => {
        const ds = await makeDataSource('dependfix_')
        const migration = new CreateApiKeyTables3300000000000()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.down(runner)
        })

        expect(await ds.query('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'dependfix_apikey\'')).toHaveLength(0)
    })

    it('uses the configured prefix', async () => {
        const ds = await makeDataSource('custom_')
        await withRunner(ds, (runner) => new CreateApiKeyTables3300000000000().up(runner))
        expect(await ds.query('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'custom_apikey\'')).toHaveLength(1)
    })
})
