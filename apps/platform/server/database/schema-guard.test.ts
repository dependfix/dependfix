import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type DataSourceOptions } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { isEmptySqliteDatabase } from './schema-guard'

describe('isEmptySqliteDatabase', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-schema-guard-'))
        const ds = new DataSource({
            type: 'better-sqlite3',
            database: join(dir, 'test.sqlite'),
            driver: betterSqlite3,
            entities: [],
            migrations: [],
            synchronize: false,
        })
        dataSources.push(ds)
        await ds.initialize()
        return ds
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

    it('returns true for an empty sqlite database', async () => {
        const ds = await makeDataSource()
        await expect(isEmptySqliteDatabase(ds)).resolves.toBe(true)
    })

    it('returns false once a business table exists', async () => {
        const ds = await makeDataSource()
        await ds.query('CREATE TABLE dependfix_organization (id varchar(36) PRIMARY KEY)')
        await expect(isEmptySqliteDatabase(ds)).resolves.toBe(false)
    })

    it('ignores the typeorm migrations table', async () => {
        const ds = await makeDataSource()
        await ds.query('CREATE TABLE migrations (id integer PRIMARY KEY, timestamp integer)')
        await expect(isEmptySqliteDatabase(ds)).resolves.toBe(true)
    })

    it('returns false for non-sqlite backends without querying', async () => {
        const ds = new DataSource({ type: 'mysql', url: 'mysql://user:pass@localhost:3306/db' } as DataSourceOptions)
        await expect(isEmptySqliteDatabase(ds)).resolves.toBe(false)
    })
})
