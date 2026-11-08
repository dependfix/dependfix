import 'reflect-metadata'
import { readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type DataSourceOptions, type MigrationInterface, type QueryRunner } from 'typeorm'
import { afterEach, describe, expect, it } from 'vitest'
import { createDataSourceOptions } from '..'
import { SnakeCaseNamingStrategy } from '../naming-strategy'
import { CreatePrCheckTable1800000000000 } from './1800000000000-CreatePrCheckTable'

/**
 * 迁移登记一致性 + 存量库真实迁移链集成验证。
 *
 * 背景（A 阶段审计 RG-B1，2026-10-13）：新增迁移类若**未登记**进 `createDataSourceOptions().migrations`
 * 数组，则在生产路径（`DATABASE_MIGRATIONS_RUN=true` + `synchronize=false`）**永不执行**——
 * 存量库永久缺列，而全新库（基线迁移由实体元数据建表，已含新列）/ 单测（`synchronize=true`）
 * / 空库冒烟全部为绿，构成典型假绿（口径见 [platform.md §3.3](../../../../docs/standards/platform.md#33-数据库初始化与迁移)）。
 *
 * 本文件提供两层防护：
 * 1. **登记一致性**：`migrations/` 目录内每个迁移类都必须出现在注册数组中（双向核对，防漏登记 / 幽灵登记）。
 * 2. **存量库集成**：先构造「旧库」（只跑 `CreatePrCheckTable`，`pr_check` 无新列），再用**注册数组**
 *    跑真实迁移链，断言新列被补上——这是唯一能覆盖「存量库 + 真实迁移链」的验证形态。
 */
const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

/** 迁移类构造器（`migrations` 数组元素形态；避免 `Function` 裸类型） */
type MigrationClass = new () => MigrationInterface

/** 从文件名推导迁移类名（约定：`<timestamp>-<ClassName>.ts` → `<ClassName><timestamp>`） */
const classNameFromFile = (file: string): string => {
    const match = /^(\d+)-(.+)\.ts$/u.exec(file)
    if (!match) {
        throw new Error(`unexpected migration file name: ${file}`)
    }
    const [, timestamp, suffix] = match
    return `${suffix}${timestamp}`
}

const registeredMigrationNames = (): string[] => {
    const migrations = createDataSourceOptions().migrations ?? []
    const list = (Array.isArray(migrations) ? migrations : [migrations]) as MigrationClass[]
    return list.map((entry) => entry.name)
}

describe('迁移登记一致性', () => {
    it('migrations/ 目录内每个迁移类都登记进 DataSource migrations 数组（防漏登记）', () => {
        const files = readdirSync(MIGRATIONS_DIR)
            .filter((file) => /^\d+-.+\.ts$/u.test(file) && !file.endsWith('.test.ts'))
        expect(files.length).toBeGreaterThan(0)

        const registered = new Set(registeredMigrationNames())
        const missing = files.map(classNameFromFile).filter((name) => !registered.has(name))
        // 约定（硬约束）：文件名 `<timestamp>-<ClassName>.ts` ⇔ 类名 `<ClassName><timestamp>`。
        // 若报错项其实已登记，请先核对命名约定（测试按文件名推导期望类名）。
        expect(
            missing,
            `未登记的迁移类：${missing.join(', ')}（命名约定：<timestamp>-<ClassName>.ts ⇔ <ClassName><timestamp>）`,
        ).toEqual([])
    })

    it('注册数组内不含 migrations/ 目录之外的幽灵项', () => {
        const files = new Set(
            readdirSync(MIGRATIONS_DIR)
                .filter((file) => /^\d+-.+\.ts$/u.test(file) && !file.endsWith('.test.ts'))
                .map(classNameFromFile),
        )
        const ghosts = registeredMigrationNames().filter((name) => !files.has(name))
        expect(ghosts, `目录中不存在的已登记迁移：${ghosts.join(', ')}`).toEqual([])
    })
})

describe('存量库真实迁移链（新列补齐）', () => {
    let dir: string | undefined
    const dataSources: DataSource[] = []

    const makeDataSource = async (
        file: string,
        migrations: MigrationClass[],
        entities: NonNullable<DataSourceOptions['entities']> = [],
    ): Promise<DataSource> => {
        const ds = new DataSource({
            type: 'better-sqlite3',
            database: file,
            driver: betterSqlite3,
            entities,
            migrations,
            synchronize: false,
            entityPrefix: 'dependfix_',
            namingStrategy: new SnakeCaseNamingStrategy(),
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

    it('旧库（pr_check 无新列）经注册数组跑真实迁移链后补上三列', async () => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-migration-chain-'))
        const file = join(dir, 'legacy.sqlite')

        // 1. 构造「旧库」：只跑建表迁移（显式 DDL，不含本批三列）
        const legacy = await makeDataSource(file, [CreatePrCheckTable1800000000000])
        await legacy.runMigrations()
        expect(await columnNames(legacy, 'dependfix_pr_check')).not.toContain('signals_json')
        await legacy.destroy()

        // 2. 用**注册数组**（生产同一事实源）跑真实迁移链
        const upgraded = await makeDataSource(file, createDataSourceOptions().migrations as MigrationClass[])
        await upgraded.runMigrations()

        const names = await columnNames(upgraded, 'dependfix_pr_check')
        expect(names).toEqual(expect.arrayContaining(['signals_json', 'overall_status', 'failure_sources_json', 'pr_state']))
        const indexes = await upgraded.query(`PRAGMA index_list('dependfix_pr_check')`) as { name: string }[]
        expect(indexes.map((index) => index.name)).toContain('idx_pr_check_repo_pr_state')
    })

    it('旧库（已记录前序迁移、scan_run 缺构建版本列）经注册数组跑增量迁移后补上两列', async () => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-migration-chain-'))
        const file = join(dir, 'legacy-scan-run.sqlite')

        // 1. 先用注册数组建到「本批之前」的状态（含前序迁移记录）
        const options = createDataSourceOptions()
        const before = await makeDataSource(
            file,
            options.migrations as MigrationClass[],
            options.entities as NonNullable<DataSourceOptions['entities']>,
        )
        await before.runMigrations()
        // 2. 回退成本批上线前的存量库：删掉两列与 2900 的迁移记录
        await before.query('ALTER TABLE dependfix_scan_run DROP COLUMN build_commit')
        await before.query('ALTER TABLE dependfix_scan_run DROP COLUMN build_version')
        await before.query('DELETE FROM migrations WHERE name = \'AddScanRunBuildColumns2900000000000\'')
        expect(await columnNames(before, 'dependfix_scan_run')).not.toContain('build_version')
        await before.destroy()

        // 3. 用**注册数组**（生产同一事实源）跑真实迁移链：只执行未记录的增量迁移
        const upgraded = await makeDataSource(file, createDataSourceOptions().migrations as MigrationClass[])
        const executed = await upgraded.runMigrations()
        // 存量库由「最新 schema 删列」近似（等价于重放到 28 号），据此锁定「只跑增量」这一关键路径
        expect(executed.map((migration) => migration.name)).toEqual(['AddScanRunBuildColumns2900000000000'])

        const names = await columnNames(upgraded, 'dependfix_scan_run')
        expect(names).toEqual(expect.arrayContaining(['build_version', 'build_commit']))
    })

    it('已应用迁移的库重复跑链为 no-op（幂等，不抛错）', async () => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-migration-chain-'))
        const file = join(dir, 'twice.sqlite')

        const first = await makeDataSource(file, createDataSourceOptions().migrations as MigrationClass[])
        await first.runMigrations()
        await first.destroy()

        const second = await makeDataSource(file, createDataSourceOptions().migrations as MigrationClass[])
        await expect(second.runMigrations()).resolves.toBeDefined()
        const names = await columnNames(second, 'dependfix_pr_check')
        expect(names.filter((n) => n === 'signals_json')).toHaveLength(1)
        expect(await withRunner(second, async (runner) => {
            const table = await runner.getTable('dependfix_pr_check')
            return table?.columns.filter((c) => c.name === 'overall_status').length ?? 0
        })).toBe(1)
    })
})
