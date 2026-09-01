import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    buildReport,
    isInternalTable,
    collectIndexStats,
    collectTableCounts,
    diagnose,
    formatHumanReport,
    main,
    parseDoctorArgs,
    type DoctorReport,
    type PragmaSnapshot,
    type TableCount,
} from './db-doctor'

/**
 * db-doctor 测试（任务登记见 docs/plan/todo.md §M22.3）：
 * 覆盖参数解析 / 采集函数 / 四类判定分支 / 人读与机读双模输出 / 集成自检链路。
 */

/** 构造 PRAGMA 组合（键集合与 PragmaSnapshot 对齐，判定无关的键给中性默认值） */
const makePragmas = (overrides: Partial<PragmaSnapshot> = {}): PragmaSnapshot => ({
    page_count: 10,
    page_size: 4096,
    freelist_count: 0,
    journal_mode: 'delete',
    auto_vacuum: 0,
    user_version: 0,
    schema_version: 5,
    application_id: 0,
    wal_autocheckpoint: 1000,
    integrity_check: 'ok',
    ...overrides,
})

const makeTables = (...entries: [string, number][]): TableCount[] =>
    entries.map(([table, rows]) => ({ table, rows, internal: isInternalTable(table) }))

describe('db-doctor', () => {
    let workDir: string
    let dbPath: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-doctor-'))
        mkdirSync(join(workDir, 'data'), { recursive: true })
        dbPath = join(workDir, 'data', 'dependfix.sqlite')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        rmSync(workDir, { recursive: true, force: true })
    })

    describe('parseDoctorArgs', () => {
        it('parses --path / --json / --help', () => {
            expect(parseDoctorArgs(['--path=a.sqlite', '--json'])).toEqual({
                path: 'a.sqlite',
                json: true,
                help: false,
            })
            expect(parseDoctorArgs(['--help'])).toEqual({ json: false, help: true })
            expect(parseDoctorArgs(['-h'])).toEqual({ json: false, help: true })
            expect(parseDoctorArgs([])).toEqual({ json: false, help: false })
        })

        it('ignores space-separated values (only --key=value supported)', () => {
            expect(parseDoctorArgs(['--path', 'a.sqlite']).path).toBeUndefined()
        })
    })

    describe('diagnose', () => {
        it('reports a brand new database when schema_version is 0 and business tables are empty', () => {
            const verdicts = diagnose(
                makePragmas({ schema_version: 0 }),
                makeTables(['user', 0], ['repository', 0]),
            )
            expect(verdicts).toHaveLength(1)
            expect(verdicts[0]).toContain('全新数据库')
        })

        it('reports wiped data when schema exists but business tables are empty', () => {
            const verdicts = diagnose(
                makePragmas({ schema_version: 42 }),
                makeTables(['user', 0], ['repository', 0]),
            )
            expect(verdicts[0]).toContain('数据被清空或从未注入')
            expect(verdicts[0]).toContain('42')
        })

        it('ignores sqlite internal tables when judging emptiness', () => {
            // sqlite_sequence 有行不能掩盖业务表全空的事实
            const verdicts = diagnose(
                makePragmas({ schema_version: 42 }),
                makeTables(['sqlite_sequence', 3], ['user', 0]),
            )
            expect(verdicts[0]).toContain('数据被清空或从未注入')
        })

        it('ignores the TypeORM migrations table when judging emptiness', () => {
            // 事故现场实测：业务表被清空后 migrations 仍有 1 行，计入会误判为"数据正常"
            const verdicts = diagnose(
                makePragmas({ schema_version: 42 }),
                makeTables(['migrations', 1], ['user', 0], ['repository', 0]),
            )
            expect(verdicts[0]).toContain('数据被清空或从未注入')
        })

        it('flags sqlite_* and migrations as non-business tables', () => {
            expect(isInternalTable('sqlite_sequence')).toBe(true)
            expect(isInternalTable('migrations')).toBe(true)
            expect(isInternalTable('dependfix_user')).toBe(false)
        })

        it('reports healthy data when business tables have rows', () => {
            const verdicts = diagnose(makePragmas(), makeTables(['user', 2], ['repository', 5]))
            expect(verdicts[0]).toContain('数据正常')
            expect(verdicts[0]).toContain('7 行')
        })

        it('reports no business tables at all', () => {
            const verdicts = diagnose(makePragmas(), makeTables(['sqlite_sequence', 1]))
            expect(verdicts[0]).toContain('无业务表')
        })

        it('appends a freelist warning when pages were freed without VACUUM', () => {
            const verdicts = diagnose(
                makePragmas({ freelist_count: 7 }),
                makeTables(['user', 1]),
            )
            expect(verdicts).toHaveLength(2)
            expect(verdicts[1]).toContain('freelist_count = 7')
        })

        it('stacks the corruption verdict before the freelist hint', () => {
            const verdicts = diagnose(
                makePragmas({ integrity_check: '*** in database main ***', freelist_count: 5 }),
                makeTables(['user', 1]),
            )
            expect(verdicts).toHaveLength(3)
            expect(verdicts[0]).toContain('数据库损坏')
            expect(verdicts[1]).toContain('数据正常')
            expect(verdicts[2]).toContain('freelist_count = 5')
        })

        it('reports corruption first when integrity_check fails', () => {
            const verdicts = diagnose(
                makePragmas({ integrity_check: '*** in database main ***' }),
                makeTables(['user', 1]),
            )
            expect(verdicts[0]).toContain('数据库损坏')
            expect(verdicts[0]).toContain('db:restore')
        })
    })

    describe('采集函数（真实数据库）', () => {
        beforeEach(() => {
            const db = betterSqlite3(dbPath)
            db.exec(`
                CREATE TABLE "user" (id INTEGER PRIMARY KEY, email TEXT UNIQUE);
                CREATE TABLE repository (id INTEGER PRIMARY KEY, name TEXT);
                CREATE INDEX "IDX_repo_name" ON repository (name);
                CREATE INDEX idx_repo_id ON repository (id);
                CREATE INDEX weird_name ON repository (name, id);
            `)
            db.prepare('INSERT INTO "user" (email) VALUES (?)').run('a@test.dev')
            db.close()
        })

        it('collects per-table row counts and flags internal tables', () => {
            const db = betterSqlite3(dbPath, { readonly: true, fileMustExist: true })
            const counts = collectTableCounts(db)
            db.close()

            expect(counts.find((c) => c.table === 'user')).toEqual({
                table: 'user',
                rows: 1,
                internal: false,
            })
            expect(counts.find((c) => c.table === 'repository')?.rows).toBe(0)
            expect(counts.every((c) => c.internal === isInternalTable(c.table))).toBe(true)
        })

        it('categorises indexes by naming convention', () => {
            const db = betterSqlite3(dbPath, { readonly: true, fileMustExist: true })
            const stats = collectIndexStats(db)
            db.close()

            // UNIQUE(email) → sqlite_autoindex_user_1
            expect(stats.autoIndex).toBe(1)
            expect(stats.typeormIndex).toBe(1)
            expect(stats.manualIndex).toBe(1)
            expect(stats.other).toBe(1)
            expect(stats.total).toBe(4)
        })

        it('builds a full report with pragmas, tables, indexes and verdicts', () => {
            const report = buildReport(dbPath)

            expect(report.file.path).toBe(dbPath)
            expect(report.file.size).toBeGreaterThan(0)
            expect(report.pragmas.integrity_check).toBe('ok')
            expect(report.pragmas.page_size).toBeGreaterThan(0)
            expect(Number(report.pragmas.schema_version)).toBeGreaterThan(0)
            expect(report.tables.length).toBeGreaterThanOrEqual(2)
            expect(report.indexes.total).toBe(4)
            expect(report.verdicts[0]).toContain('数据正常')
        })

        it('does not create WAL sidecars（只读打开不改变事故现场）', () => {
            buildReport(dbPath)
            expect(existsSync(`${dbPath}-wal`)).toBe(false)
            expect(existsSync(`${dbPath}-shm`)).toBe(false)
        })

        it('throws for a missing database file', () => {
            expect(() => buildReport(join(workDir, 'missing.sqlite'))).toThrow(/数据库文件不存在/)
        })
    })

    describe('formatHumanReport', () => {
        const report: DoctorReport = {
            file: {
                path: 'data/dependfix.sqlite',
                size: 4096,
                mtime: '2026-09-01T12:00:00.000Z',
                atime: '2026-09-01T12:00:01.000Z',
                birthtime: '2026-08-01T00:00:00.000Z',
            },
            pragmas: makePragmas(),
            tables: makeTables(['user', 2], ['sqlite_sequence', 1]),
            indexes: { autoIndex: 1, typeormIndex: 2, manualIndex: 3, other: 0, total: 6 },
            verdicts: ['数据正常：1 张业务表共 2 行'],
        }

        it('renders every section', () => {
            const output = formatHumanReport(report)
            expect(output).toContain('[DOCTOR] SQLite 数据库自检')
            expect(output).toContain('data/dependfix.sqlite')
            expect(output).toContain('freelist_count')
            expect(output).toContain('sqlite_sequence')
            expect(output).toContain('(内部表)')
            expect(output).toContain('索引（共 6）')
            expect(output).toContain('- 数据正常：1 张业务表共 2 行')
        })

        it('renders a placeholder when there are no tables', () => {
            expect(formatHumanReport({ ...report, tables: [] })).toContain('(无表)')
        })
    })

    describe('main 双模输出', () => {
        beforeEach(() => {
            const db = betterSqlite3(dbPath)
            db.exec('CREATE TABLE demo (id INTEGER PRIMARY KEY)')
            db.close()
        })

        it('prints human-readable text on a TTY', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main([`--path=${dbPath}`], {}, true)).toBe(0)
            expect(spy.mock.calls[0]![0]).toContain('[DOCTOR] SQLite 数据库自检')
        })

        it('prints JSON when stdout is not a TTY', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main([`--path=${dbPath}`], {}, false)).toBe(0)
            const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as DoctorReport
            expect(parsed.file.path).toBe(dbPath)
            expect(parsed.verdicts.length).toBeGreaterThan(0)
        })

        it('honours --json even on a TTY', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main([`--path=${dbPath}`, '--json'], {}, true)).toBe(0)
            expect(() => JSON.parse(spy.mock.calls[0]![0] as string)).not.toThrow()
        })

        it('prefers --path over the DATABASE_PATH env', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main([`--path=${dbPath}`, '--json'], {
                DATABASE_PATH: join(workDir, 'missing.sqlite'),
            }, false)).toBe(0)
            const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as DoctorReport
            expect(parsed.file.path).toBe(dbPath)
        })

        it('resolves the target from DATABASE_PATH when --path is absent', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main(['--json'], { DATABASE_PATH: dbPath }, false)).toBe(0)
            const parsed = JSON.parse(spy.mock.calls[0]![0] as string) as DoctorReport
            expect(parsed.file.path).toBe(dbPath)
        })

        it('prints help and exits 0 for --help', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main(['--help'])).toBe(0)
            expect(spy.mock.calls[0]![0]).toContain('db-doctor')
        })

        it('exits 1 when the database file is missing', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            expect(main([`--path=${join(workDir, 'missing.sqlite')}`], {}, false)).toBe(1)
            expect(spy.mock.calls[0]![0]).toContain('自检失败')
        })
    })
})
