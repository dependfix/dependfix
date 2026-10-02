import 'reflect-metadata'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource, type DataSourceOptions } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { createDataSourceOptions } from '../index'

/**
 * 基线迁移（CreateInitialSchema）的自举 / 幂等 / 前缀感知验证。
 *
 * 覆盖点：
 * 1. 全新空库跑完整迁移链 → 13 张业务表 + 基础列 + 外键全部建成（此前无基线迁移，首个
 *    `ALTER TABLE` 即报 `no such table`）
 * 2. 二次执行幂等（0 条待执行）
 * 3. 自定义 `entityPrefix` 下建表 / 迁移均生效（前缀感知，存量早期迁移非默认前缀会静默 no-op）
 * 4. 存量库（表已存在）基线 no-op，不破坏既有数据
 * 5. down 反向删除全部业务表
 */

const BUSINESS_TABLES = [
    'account',
    'audit_event',
    'batch_run',
    'credential',
    'organization',
    'pr_check',
    'repository',
    'scan_result',
    'scan_run',
    'schedule',
    'session',
    'user',
    'verification',
] as const

describe('CreateInitialSchema baseline migration', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (entityPrefix = 'dependfix_'): Promise<DataSource> => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-baseline-'))
        const base = createDataSourceOptions()
        const ds = new DataSource({
            ...base,
            database: join(dir, 'test.sqlite'),
            entityPrefix,
            synchronize: false,
            migrationsRun: false,
        } as DataSourceOptions)
        dataSources.push(ds)
        await ds.initialize()
        return ds
    }

    const columnNames = async (ds: DataSource, table: string): Promise<string[]> => {
        const rows = await ds.query(`PRAGMA table_info('${table}')`) as { name: string }[]
        return rows.map((row) => row.name)
    }

    const hasTable = async (ds: DataSource, table: string): Promise<boolean> => {
        const runner = ds.createQueryRunner()
        try {
            return await runner.hasTable(table)
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

    it('creates all base tables, columns and foreign keys on a fresh database', async () => {
        const ds = await makeDataSource()

        const applied = await ds.runMigrations()
        expect(applied.map((migration) => migration.name)).toContain('CreateInitialSchema1600000000000')

        for (const baseName of BUSINESS_TABLES) {
            expect(await hasTable(ds, `dependfix_${baseName}`)).toBe(true)
        }
        expect(await hasTable(ds, 'migrations')).toBe(true)

        // 基线建列 + 增量迁移守卫：迁移链新增列全部存在
        expect(await columnNames(ds, 'dependfix_scan_result')).toEqual(
            expect.arrayContaining(['ghsa_id', 'cve_ids']),
        )
        expect(await columnNames(ds, 'dependfix_scan_run')).toEqual(
            expect.arrayContaining(['logs_json', 'ai_config_snapshot']),
        )
        expect(await columnNames(ds, 'dependfix_schedule')).toContain('kind')
        expect(await columnNames(ds, 'dependfix_organization')).toEqual(
            expect.arrayContaining(['ai_provider', 'ai_model', 'ai_base_url', 'ai_api_url']),
        )
        expect(await columnNames(ds, 'dependfix_credential')).toContain('owner_login')
        expect(await columnNames(ds, 'dependfix_repository')).toEqual(
            expect.arrayContaining(['verify_commands', 'ai_enabled', 'ai_trigger']),
        )

        // 外键内联建表（SQLite 通过 createTable 内联，而非 createForeignKeys 重建）
        const scanRunForeignKeys = await ds.query('PRAGMA foreign_key_list(dependfix_scan_run)') as {
            table: string
            from: string
            on_delete: string
        }[]
        expect(scanRunForeignKeys).toEqual([
            expect.objectContaining({ table: 'dependfix_repository', from: 'repository_id', on_delete: 'CASCADE' }),
        ])
    })

    it('is idempotent: second run applies zero migrations', async () => {
        const ds = await makeDataSource()

        await ds.runMigrations()
        const secondRun = await ds.runMigrations()

        expect(secondRun).toEqual([])
    })

    it('honors a custom entity prefix across baseline and incremental migrations', async () => {
        const ds = await makeDataSource('myapp_')

        await ds.runMigrations()

        expect(await hasTable(ds, 'myapp_organization')).toBe(true)
        expect(await hasTable(ds, 'myapp_scan_result')).toBe(true)
        expect(await hasTable(ds, 'myapp_repository')).toBe(true)
        expect(await hasTable(ds, 'dependfix_organization')).toBe(false)
        // 前缀感知：增量迁移在 myapp_ 前缀下也真正加列
        expect(await columnNames(ds, 'myapp_scan_result')).toEqual(
            expect.arrayContaining(['ghsa_id', 'cve_ids']),
        )
        expect(await columnNames(ds, 'myapp_repository')).toContain('verify_commands')
    })

    it('is a no-op on an existing database and preserves data', async () => {
        const ds = await makeDataSource()
        // 模拟存量库：基础表已由 synchronize 建好（此处仅建其中一张 + 一行数据）
        await ds.query('CREATE TABLE dependfix_organization (id varchar(36) PRIMARY KEY, name varchar(100))')
        await ds.query('INSERT INTO dependfix_organization (id, name) VALUES (\'org-1\', \'existing\')')

        await ds.runMigrations()

        const rows = await ds.query('SELECT id, name FROM dependfix_organization') as { id: string, name: string }[]
        expect(rows).toEqual([{ id: 'org-1', name: 'existing' }])
        // 其余缺失表由基线补齐
        expect(await hasTable(ds, 'dependfix_repository')).toBe(true)
    })

    it('drops all base tables on down', async () => {
        const ds = await makeDataSource()
        await ds.runMigrations()

        const migration = ds.migrations.find(
            (item) => item.name === 'CreateInitialSchema1600000000000',
        )
        expect(migration).toBeDefined()
        const runner = ds.createQueryRunner()
        try {
            await migration!.down(runner)
        } finally {
            await runner.release()
        }

        for (const baseName of BUSINESS_TABLES) {
            expect(await hasTable(ds, `dependfix_${baseName}`)).toBe(false)
        }
    })
})
