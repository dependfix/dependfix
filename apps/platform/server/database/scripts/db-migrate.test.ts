import { existsSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { DataSource, type MigrationInterface, type QueryRunner } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    collectMigrationStatus,
    createMigrateDataSource,
    formatApplyResult,
    formatMigrationStatus,
    main,
    migrationsTableName,
    missingSqliteDatabasePath,
    parseMigrateArgs,
    readExecutedMigrationNames,
} from './db-migrate'

/**
 * db-migrate CLI 的参数解析、状态采集与三条动作路径（口径见 docs/plan/todo.md §M33.7）。
 *
 * 覆盖点：
 * 1. 参数解析：动作互斥 / `--yes` / `--help`
 * 2. 参数门禁：无动作、动作冲突、`--revert` 缺 `--yes` 均拒绝执行（exit 1）
 * 3. `--show` 只读列出 executed / pending
 * 4. `--apply` 执行 pending 且幂等（二次执行 0 条）
 * 5. `--revert --yes` 逐条回退 + 无可回退时提示
 * 6. 迁移抛错时 exit 1（不静默吞掉失败）
 *
 * 用桩迁移（名字末 13 位为时间戳，TypeORM 依赖该约定排序）而非真实迁移链：真实迁移中
 * `1750000000000` / `1800000000001` 硬编码 `ALTER TABLE` 且无存在性守卫，在空库上不可重放，
 * 与本脚本职责无关。
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

class AddBeta1700000000001 implements MigrationInterface {
    name = 'AddBeta1700000000001'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE dependfix_alpha ADD COLUMN beta text')
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE dependfix_alpha DROP COLUMN beta')
    }
}

class Broken1700000000002 implements MigrationInterface {
    name = 'Broken1700000000002'

    async up(): Promise<void> {
        throw new Error('boom')
    }

    async down(): Promise<void> {
        throw new Error('not implemented')
    }
}

describe('db-migrate CLI', () => {
    let dir: string

    const dbPath = (): string => join(dir, 'test.sqlite')

    const makeFactory = (migrations: (new () => MigrationInterface)[]): (() => DataSource) => () => new DataSource({
        type: 'better-sqlite3',
        database: dbPath(),
        driver: betterSqlite3,
        entities: [],
        migrations,
        synchronize: false,
        entityPrefix: 'dependfix_',
    })

    const columnNames = async (table: string): Promise<string[]> => {
        const ds = new DataSource({
            type: 'better-sqlite3',
            database: dbPath(),
            driver: betterSqlite3,
            entities: [],
            migrations: [],
            synchronize: false,
            entityPrefix: 'dependfix_',
        })
        await ds.initialize()
        try {
            const rows = await ds.query(`PRAGMA table_info('${table}')`) as { name: string }[]
            return rows.map((row) => row.name)
        } finally {
            await ds.destroy()
        }
    }

    /** 查询 sqlite_master 中是否存在指定表（验证"不创建迁移表"用） */
    const tableExists = async (table: string): Promise<boolean> => {
        const ds = new DataSource({
            type: 'better-sqlite3',
            database: dbPath(),
            driver: betterSqlite3,
            entities: [],
            migrations: [],
            synchronize: false,
            entityPrefix: 'dependfix_',
        })
        await ds.initialize()
        try {
            const rows = await ds.query(
                'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
                [table],
            ) as { name: string }[]
            return rows.length > 0
        } finally {
            await ds.destroy()
        }
    }

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'dependfix-db-migrate-'))
        vi.spyOn(console, 'log').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
        await rm(dir, { recursive: true, force: true })
    })

    describe('parseMigrateArgs', () => {
        it('默认无动作、未确认、无冲突', () => {
            expect(parseMigrateArgs([])).toEqual({ action: undefined, yes: false, help: false, conflict: false })
        })

        it('识别单个动作', () => {
            expect(parseMigrateArgs(['--show']).action).toBe('show')
            expect(parseMigrateArgs(['--apply']).action).toBe('apply')
            expect(parseMigrateArgs(['--revert']).action).toBe('revert')
        })

        it('识别 --yes 与帮助 flag', () => {
            const args = parseMigrateArgs(['--revert', '--yes'])
            expect(args.action).toBe('revert')
            expect(args.yes).toBe(true)
            expect(parseMigrateArgs(['-h']).help).toBe(true)
            expect(parseMigrateArgs(['--help']).help).toBe(true)
        })

        it('多动作标记为冲突', () => {
            const args = parseMigrateArgs(['--show', '--apply'])
            expect(args.conflict).toBe(true)
            expect(args.action).toBe('apply')
        })

        it('同一动作重复出现不算冲突', () => {
            expect(parseMigrateArgs(['--apply', '--apply']).conflict).toBe(false)
        })
    })

    describe('参数门禁', () => {
        it('--help 输出帮助并返回 0', async () => {
            await expect(main(['--help'])).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('db-migrate：数据库迁移命令式入口'))
        })

        it('缺动作返回 1 且不开库', async () => {
            const createDataSource = vi.fn(makeFactory([CreateAlpha1700000000000]))
            await expect(main([], { createDataSource })).resolves.toBe(1)
            expect(createDataSource).not.toHaveBeenCalled()
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('缺少动作'))
        })

        it('动作冲突返回 1', async () => {
            const createDataSource = vi.fn(makeFactory([CreateAlpha1700000000000]))
            await expect(main(['--show', '--apply'], { createDataSource })).resolves.toBe(1)
            expect(createDataSource).not.toHaveBeenCalled()
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('互斥'))
        })

        it('--revert 缺 --yes 返回 1 且不写库', async () => {
            const createDataSource = vi.fn(makeFactory([CreateAlpha1700000000000]))
            await expect(main(['--revert'], { createDataSource })).resolves.toBe(1)
            expect(createDataSource).not.toHaveBeenCalled()
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('--yes'))
        })
    })

    describe('--show', () => {
        it('SQLite 库文件不存在时只报告状态且不创建文件', async () => {
            const factory = makeFactory([CreateAlpha1700000000000, AddBeta1700000000001])
            await expect(main(['--show'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('数据库文件不存在'))
            expect(existsSync(dbPath())).toBe(false)
        })

        it('列全部迁移为待执行且不创建迁移表', async () => {
            // 0 字节文件 = 合法空 SQLite 库：使 --show 走正常路径而非"文件不存在"分支
            writeFileSync(dbPath(), '')
            const factory = makeFactory([CreateAlpha1700000000000, AddBeta1700000000001])
            await expect(main(['--show'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('待执行 2 条'))
            expect(await tableExists('migrations')).toBe(false)

            const ds = factory()
            await ds.initialize()
            try {
                expect(await readExecutedMigrationNames(ds)).toEqual(new Set())
                expect(await collectMigrationStatus(ds)).toEqual([
                    { name: 'CreateAlpha1700000000000', executed: false },
                    { name: 'AddBeta1700000000001', executed: false },
                ])
            } finally {
                await ds.destroy()
            }
        })
    })

    describe('默认 DataSource 工厂（env 解耦）', () => {
        it('强制 synchronize=false + migrationsRun=false，不受 DATABASE_* 开关影响', () => {
            vi.stubEnv('DATABASE_SYNCHRONIZE', 'true')
            vi.stubEnv('DATABASE_MIGRATIONS_RUN', 'true')
            const ds = createMigrateDataSource()
            expect(ds.options.synchronize).toBe(false)
            expect(ds.options.migrationsRun).toBe(false)
            expect(ds.options.entityPrefix).toBe('dependfix_')
        })

        it('missingSqliteDatabasePath 仅对"文件缺失的 SQLite 库"返回路径', () => {
            const missing = makeFactory([])()
            expect(missingSqliteDatabasePath(missing)).toBe(dbPath())

            writeFileSync(dbPath(), '')
            expect(missingSqliteDatabasePath(makeFactory([])())).toBeUndefined()
        })
    })

    describe('--apply', () => {
        it('执行 pending 且二次执行幂等', async () => {
            const factory = makeFactory([CreateAlpha1700000000000, AddBeta1700000000001])
            await expect(main(['--apply'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('本次执行 2 条'))
            expect(await columnNames('dependfix_alpha')).toContain('beta')

            vi.mocked(console.log).mockClear()
            await expect(main(['--apply'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('本次执行 0 条'))

            vi.mocked(console.log).mockClear()
            await expect(main(['--show'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('待执行 0 条'))
        })

        it('迁移抛错时返回 1 并打印失败原因', async () => {
            const factory = makeFactory([Broken1700000000002])
            await expect(main(['--apply'], { createDataSource: factory })).resolves.toBe(1)
            expect(console.error).toHaveBeenCalledWith('迁移未完成：', expect.stringContaining('boom'))
        })
    })

    describe('--revert', () => {
        it('逐条回退并在无记录时提示', async () => {
            const factory = makeFactory([CreateAlpha1700000000000, AddBeta1700000000001])
            await main(['--apply'], { createDataSource: factory })

            vi.mocked(console.log).mockClear()
            await expect(main(['--revert', '--yes'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('AddBeta1700000000001'))
            expect(await columnNames('dependfix_alpha')).not.toContain('beta')

            vi.mocked(console.log).mockClear()
            await expect(main(['--revert', '--yes'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('CreateAlpha1700000000000'))

            vi.mocked(console.log).mockClear()
            await expect(main(['--revert', '--yes'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('无可回退'))
        })

        it('迁移记录为空时返回 0 且不动 schema', async () => {
            const factory = makeFactory([])
            await expect(main(['--revert', '--yes'], { createDataSource: factory })).resolves.toBe(0)
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('无可回退'))
        })
    })

    describe('格式化输出', () => {
        it('formatMigrationStatus 输出状态与合计', () => {
            const text = formatMigrationStatus([
                { name: 'A', executed: true },
                { name: 'B', executed: false },
            ])
            expect(text).toContain('[X] 已执行  A')
            expect(text).toContain('[ ] 待执行  B')
            expect(text).toContain('合计 2 条，待执行 1 条')
        })

        it('formatApplyResult 无待执行时给出提示', () => {
            expect(formatApplyResult([])).toContain('无待执行迁移')
            expect(formatApplyResult(['A'])).toContain('[X] A')
        })

        it('migrationsTableName 拒绝非标识符取值（防拼进 SQL）', () => {
            const bad = new DataSource({
                type: 'better-sqlite3',
                database: join(dir, 'guard.sqlite'),
                driver: betterSqlite3,
                entities: [],
                migrations: [],
                synchronize: false,
                migrationsTableName: 'migrations; DROP TABLE x',
            })
            expect(() => migrationsTableName(bad)).toThrow('不是合法 SQL 标识符')
        })
    })
})
