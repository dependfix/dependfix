import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type MigrationInterface, type QueryRunner } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatInitResult, listBusinessTables, main } from './db-init'

/**
 * db-init 一键初始化的参数门禁 / 执行路径 / 摘要输出。
 *
 * 覆盖点：
 * 1. `--help` 输出帮助并返回 0
 * 2. 空库执行 pending migration 并打印摘要（业务表数量）
 * 3. 幂等：二次执行 0 条
 * 4. 迁移失败返回 1（不静默吞掉）
 */

class CreateAlpha1700000000000 implements MigrationInterface {
    name = 'CreateAlpha1700000000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('CREATE TABLE dependfix_alpha (id integer PRIMARY KEY)')
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE dependfix_alpha')
    }
}

class Broken1700000000001 implements MigrationInterface {
    name = 'Broken1700000000001'

    async up(): Promise<void> {
        throw new Error('boom')
    }

    async down(): Promise<void> {
        throw new Error('not implemented')
    }
}

describe('db-init CLI', () => {
    let dir: string

    const makeFactory = (migrations: (new () => MigrationInterface)[]): (() => DataSource) => () => new DataSource({
        type: 'better-sqlite3',
        database: join(dir, 'test.sqlite'),
        driver: betterSqlite3,
        entities: [],
        migrations,
        synchronize: false,
        entityPrefix: 'dependfix_',
    })

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-db-init-'))
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await rm(dir, { recursive: true, force: true })
    })

    it('--help 输出帮助并返回 0', async () => {
        await expect(main(['--help'])).resolves.toBe(0)
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('db-init：数据库一键初始化'))
    })

    it('空库执行 pending 迁移并打印业务表摘要', async () => {
        const factory = makeFactory([CreateAlpha1700000000000])

        await expect(main([], { createDataSource: factory })).resolves.toBe(0)
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('本次执行迁移: 1 条'))
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('业务表: 1 张'))
    })

    it('二次执行幂等（0 条）', async () => {
        const factory = makeFactory([CreateAlpha1700000000000])
        await main([], { createDataSource: factory })

        vi.mocked(console.log).mockClear()
        await expect(main([], { createDataSource: factory })).resolves.toBe(0)
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('本次执行迁移: 0 条'))
    })

    it('迁移失败返回 1', async () => {
        const factory = makeFactory([Broken1700000000001])
        await expect(main([], { createDataSource: factory })).resolves.toBe(1)
        expect(console.error).toHaveBeenCalledWith('数据库初始化未完成：', expect.stringContaining('boom'))
    })

    it('listBusinessTables 排除 migrations 与内部表', async () => {
        const ds = makeFactory([CreateAlpha1700000000000])()
        await ds.initialize()
        try {
            await ds.runMigrations()
            expect(await listBusinessTables(ds)).toEqual(['dependfix_alpha'])
        } finally {
            await ds.destroy()
        }
    })

    it('formatInitResult 输出计数与逐条迁移', () => {
        const text = formatInitResult({ applied: ['A'], businessTables: ['t1', 't2'] })
        expect(text).toContain('本次执行迁移: 1 条')
        expect(text).toContain('[X] A')
        expect(text).toContain('业务表: 2 张')
        expect(formatInitResult({ applied: [], businessTables: [] })).toContain('无待执行迁移')
    })
})
