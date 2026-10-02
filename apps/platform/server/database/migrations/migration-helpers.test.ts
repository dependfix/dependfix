import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import {
    addColumnIfMissing,
    createIndexIfMissing,
    dropColumnIfExists,
    prefixedTableName,
    resolveTableName,
} from './migration-helpers'

/**
 * migration-helpers 的前缀解析与幂等守卫直接单测（基线迁移的集成行为另见
 * `1600000000000-CreateInitialSchema.test.ts`）。
 */
describe('migration-helpers', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (entityPrefix: string): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-migration-helpers-'))
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

    const tableNames = async (ds: DataSource): Promise<string[]> => {
        const rows = await ds.query(
            'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\'',
        ) as { name: string }[]
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

    describe('resolveTableName / prefixedTableName', () => {
        it('prefers the prefixed table when both exist', async () => {
            const ds = await makeDataSource('dependfix_')
            await ds.query('CREATE TABLE dependfix_alpha (id integer PRIMARY KEY)')
            await ds.query('CREATE TABLE alpha (id integer PRIMARY KEY)')
            await withRunner(ds, async (runner) => {
                expect(await resolveTableName(runner, 'alpha')).toBe('dependfix_alpha')
                expect(prefixedTableName(runner, 'alpha')).toBe('dependfix_alpha')
            })
        })

        it('falls back to the unprefixed table and returns null when neither exists', async () => {
            const ds = await makeDataSource('dependfix_')
            await ds.query('CREATE TABLE alpha (id integer PRIMARY KEY)')
            await withRunner(ds, async (runner) => {
                expect(await resolveTableName(runner, 'alpha')).toBe('alpha')
                expect(await resolveTableName(runner, 'missing')).toBeNull()
            })
        })

        it('uses the bare name when prefix is empty', async () => {
            const ds = await makeDataSource('')
            await ds.query('CREATE TABLE alpha (id integer PRIMARY KEY)')
            await withRunner(ds, async (runner) => {
                expect(await resolveTableName(runner, 'alpha')).toBe('alpha')
                expect(prefixedTableName(runner, 'alpha')).toBe('alpha')
            })
        })
    })

    describe('addColumnIfMissing / dropColumnIfExists', () => {
        it('adds once, is idempotent, and no-ops when the table is missing', async () => {
            const ds = await makeDataSource('dependfix_')
            await ds.query('CREATE TABLE dependfix_alpha (id integer PRIMARY KEY)')
            await withRunner(ds, async (runner) => {
                expect(await addColumnIfMissing(runner, 'alpha', 'beta', 'beta text')).toBe(true)
                expect(await addColumnIfMissing(runner, 'alpha', 'beta', 'beta text')).toBe(false)
                expect(await addColumnIfMissing(runner, 'missing', 'beta', 'beta text')).toBe(false)
            })
            const rows = await ds.query('PRAGMA table_info(\'dependfix_alpha\')') as { name: string }[]
            expect(rows.map((row) => row.name)).toContain('beta')
        })

        it('drops once and is idempotent', async () => {
            const ds = await makeDataSource('dependfix_')
            await ds.query('CREATE TABLE dependfix_alpha (id integer PRIMARY KEY, beta text)')
            await withRunner(ds, async (runner) => {
                expect(await dropColumnIfExists(runner, 'alpha', 'beta')).toBe(true)
                expect(await dropColumnIfExists(runner, 'alpha', 'beta')).toBe(false)
                expect(await dropColumnIfExists(runner, 'missing', 'beta')).toBe(false)
            })
            const rows = await ds.query('PRAGMA table_info(\'dependfix_alpha\')') as { name: string }[]
            expect(rows.map((row) => row.name)).not.toContain('beta')
        })
    })

    describe('createIndexIfMissing', () => {
        it('creates the index once and is idempotent by name', async () => {
            const ds = await makeDataSource('dependfix_')
            await ds.query('CREATE TABLE dependfix_alpha (id integer PRIMARY KEY, beta text)')
            await withRunner(ds, async (runner) => {
                expect(await createIndexIfMissing(runner, 'alpha', 'idx_alpha_beta', ['beta'])).toBe(true)
                expect(await createIndexIfMissing(runner, 'alpha', 'idx_alpha_beta', ['beta'])).toBe(false)
            })
            const indexes = await ds.query('PRAGMA index_list(\'dependfix_alpha\')') as { name: string }[]
            expect(indexes.map((row) => row.name)).toContain('idx_alpha_beta')
        })

        it('skips when another index already covers the same columns', async () => {
            const ds = await makeDataSource('dependfix_')
            await ds.query('CREATE TABLE dependfix_alpha (id integer PRIMARY KEY, beta text)')
            await ds.query('CREATE INDEX existing_idx ON dependfix_alpha (beta)')
            await withRunner(ds, async (runner) => {
                expect(await createIndexIfMissing(runner, 'alpha', 'idx_alpha_beta', ['beta'])).toBe(false)
            })
            const indexes = await ds.query('PRAGMA index_list(\'dependfix_alpha\')') as { name: string }[]
            expect(indexes.map((row) => row.name)).not.toContain('idx_alpha_beta')
        })

        it('no-ops when the table is missing', async () => {
            const ds = await makeDataSource('dependfix_')
            await withRunner(ds, async (runner) => {
                expect(await createIndexIfMissing(runner, 'missing', 'idx_x', ['x'])).toBe(false)
            })
            expect(await tableNames(ds)).toEqual([])
        })
    })
})
