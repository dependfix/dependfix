import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { AddProviderLogTargets3500000000000 } from './3500000000000-AddProviderLogTargets'

/**
 * Provider 日志富化列迁移：前缀感知 + 幂等 + 存量行取值为 NULL。
 * 口径见 pr-build-deploy-signals.md §3.12。
 */
describe('AddProviderLogTargets migration', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (entityPrefix: string): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-provider-log-targets-'))
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

    const createTables = async (ds: DataSource, prefix: string): Promise<void> => {
        await ds.query(`CREATE TABLE ${prefix}repository (id varchar(36) PRIMARY KEY, owner varchar(100))`)
        await ds.query(`CREATE TABLE ${prefix}pr_check (id varchar(36) PRIMARY KEY, pr_number integer)`)
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

    it('adds the repository target columns and pr_check provider logs column under the default prefix', async () => {
        const ds = await makeDataSource('dependfix_')
        await createTables(ds, 'dependfix_')

        await withRunner(ds, (runner) => new AddProviderLogTargets3500000000000().up(runner))

        expect(await columnNames(ds, 'dependfix_repository')).toEqual(expect.arrayContaining([
            'vercel_project_id',
            'cloudflare_account_id',
            'cloudflare_worker_tag',
        ]))
        expect(await columnNames(ds, 'dependfix_pr_check')).toContain('provider_logs_json')
    })

    it('adds the columns when the prefix is empty', async () => {
        const ds = await makeDataSource('')
        await createTables(ds, '')

        await withRunner(ds, (runner) => new AddProviderLogTargets3500000000000().up(runner))

        expect(await columnNames(ds, 'repository')).toContain('cloudflare_worker_tag')
        expect(await columnNames(ds, 'pr_check')).toContain('provider_logs_json')
    })

    it('keeps existing rows at NULL (no guessed target / no backfilled log)', async () => {
        const ds = await makeDataSource('dependfix_')
        await createTables(ds, 'dependfix_')
        await ds.query('INSERT INTO dependfix_repository (id, owner) VALUES (\'repo-1\', \'acme\')')
        await ds.query('INSERT INTO dependfix_pr_check (id, pr_number) VALUES (\'check-1\', 7)')

        await withRunner(ds, (runner) => new AddProviderLogTargets3500000000000().up(runner))

        const repos = await ds.query('SELECT vercel_project_id, cloudflare_account_id, cloudflare_worker_tag FROM dependfix_repository') as Record<string, unknown>[]
        expect(repos).toEqual([{
            vercel_project_id: null,
            cloudflare_account_id: null,
            cloudflare_worker_tag: null,
        }])
        const checks = await ds.query('SELECT provider_logs_json FROM dependfix_pr_check') as { provider_logs_json: string | null }[]
        expect(checks).toEqual([{ provider_logs_json: null }])
    })

    it('is idempotent on up and down', async () => {
        const ds = await makeDataSource('dependfix_')
        await createTables(ds, 'dependfix_')
        const migration = new AddProviderLogTargets3500000000000()

        await withRunner(ds, async (runner) => {
            await migration.up(runner)
            await migration.up(runner)
        })
        expect((await columnNames(ds, 'dependfix_repository')).filter((name) => name === 'vercel_project_id')).toHaveLength(1)
        expect((await columnNames(ds, 'dependfix_pr_check')).filter((name) => name === 'provider_logs_json')).toHaveLength(1)

        await withRunner(ds, async (runner) => {
            await migration.down(runner)
            await migration.down(runner)
        })
        expect(await columnNames(ds, 'dependfix_repository')).not.toContain('vercel_project_id')
        expect(await columnNames(ds, 'dependfix_pr_check')).not.toContain('provider_logs_json')
    })

    it('is a no-op when the target tables do not exist', async () => {
        const ds = await makeDataSource('dependfix_')

        await expect(
            withRunner(ds, (runner) => new AddProviderLogTargets3500000000000().up(runner)),
        ).resolves.toBeUndefined()
        await expect(
            withRunner(ds, (runner) => new AddProviderLogTargets3500000000000().down(runner)),
        ).resolves.toBeUndefined()
    })
})
