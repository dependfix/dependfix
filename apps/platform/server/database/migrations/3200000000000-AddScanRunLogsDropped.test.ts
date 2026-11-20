import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScanRunLogsDropped3200000000000 } from './3200000000000-AddScanRunLogsDropped'

/**
 * ScanRun.logsDropped 迁移：前缀感知 + 幂等 + 存量行取值为 NULL（不伪装为 0）。
 * 口径见 platform-public-api.md §6.4。
 */
describe('AddScanRunLogsDropped migration', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (entityPrefix: string): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-logs-dropped-'))
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

    it('adds logs_dropped under the default dependfix_ prefix', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_scan_run (id varchar(36) PRIMARY KEY, status varchar(32))')

        await withRunner(ds, (runner) => new AddScanRunLogsDropped3200000000000().up(runner))

        expect(await columnNames(ds, 'dependfix_scan_run')).toContain('logs_dropped')
    })

    it('adds logs_dropped when the prefix is empty', async () => {
        const ds = await makeDataSource('')
        await ds.query('CREATE TABLE scan_run (id varchar(36) PRIMARY KEY, status varchar(32))')

        await withRunner(ds, (runner) => new AddScanRunLogsDropped3200000000000().up(runner))

        expect(await columnNames(ds, 'scan_run')).toContain('logs_dropped')
    })

    it('keeps existing rows at NULL instead of pretending they were 0', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_scan_run (id varchar(36) PRIMARY KEY, status varchar(32))')
        await ds.query('INSERT INTO dependfix_scan_run (id, status) VALUES (\'run-1\', \'completed\')')

        await withRunner(ds, (runner) => new AddScanRunLogsDropped3200000000000().up(runner))

        const rows = await ds.query('SELECT id, logs_dropped FROM dependfix_scan_run') as { id: string, logs_dropped: number | null }[]
        expect(rows).toEqual([{ id: 'run-1', logs_dropped: null }])
    })

    it('is idempotent on up and down', async () => {
        const ds = await makeDataSource('dependfix_')
        await ds.query('CREATE TABLE dependfix_scan_run (id varchar(36) PRIMARY KEY)')
        const migration = new AddScanRunLogsDropped3200000000000()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.up(runner)
        })
        expect((await columnNames(ds, 'dependfix_scan_run')).filter((name) => name === 'logs_dropped')).toHaveLength(1)

        await withRunner(ds, async (runner) => {
            await migration.down(runner)
            await migration.down(runner)
        })
        expect(await columnNames(ds, 'dependfix_scan_run')).not.toContain('logs_dropped')
    })

    it('is a no-op when the target table does not exist', async () => {
        const ds = await makeDataSource('dependfix_')

        await expect(
            withRunner(ds, (runner) => new AddScanRunLogsDropped3200000000000().up(runner)),
        ).resolves.toBeUndefined()
        await expect(
            withRunner(ds, (runner) => new AddScanRunLogsDropped3200000000000().down(runner)),
        ).resolves.toBeUndefined()
    })
})
