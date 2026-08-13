import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataSourceOptions, currentDatabaseType } from './index'

const realEnv = { ...process.env }

const setEnv = (values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) {
        process.env[key] = value
    }
}

describe('createDataSourceOptions', () => {
    beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'test')
    })

    afterEach(() => {
        process.env = { ...realEnv }
        vi.unstubAllEnvs()
    })

    it('defaults to sqlite with dev synchronize enabled', () => {
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.type).toBe('better-sqlite3')
        expect(options.database).toBe('data/dependfix.sqlite')
        expect(options.synchronize).toBe(true)
        expect(options.entityPrefix).toBe('dependfix_')
        // 实体清单齐备
        expect((options.entities as unknown[]).length).toBeGreaterThanOrEqual(10)
    })

    it('honors DATABASE_PATH and DATABASE_ENTITY_PREFIX overrides', () => {
        setEnv({ DATABASE_PATH: 'custom/db.sqlite', DATABASE_ENTITY_PREFIX: 'dfx_' })
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.database).toBe('custom/db.sqlite')
        expect(options.entityPrefix).toBe('dfx_')
    })

    it('uses mysql driver when DATABASE_TYPE=mysql', () => {
        setEnv({ DATABASE_TYPE: 'mysql', DATABASE_URL: 'mysql://user:pass@localhost:3306/db' })
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.type).toBe('mysql')
        expect(options.url).toBe('mysql://user:pass@localhost:3306/db')
        expect(options.driver).toBeTruthy()
        expect(currentDatabaseType()).toBe('mysql')
    })

    it('uses postgres driver when DATABASE_TYPE=postgres', () => {
        setEnv({ DATABASE_TYPE: 'postgres', DATABASE_URL: 'postgres://user:pass@localhost:5432/db' })
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.type).toBe('postgres')
        expect(options.url).toBe('postgres://user:pass@localhost:5432/db')
        expect(options.driver).toBeTruthy()
        expect(currentDatabaseType()).toBe('postgres')
    })

    it('enables SSL for mysql/postgres when DATABASE_SSL=true', () => {
        setEnv({ DATABASE_TYPE: 'postgres', DATABASE_URL: 'postgres://x', DATABASE_SSL: 'true' })
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.ssl).toEqual({ rejectUnauthorized: false })
    })
})
