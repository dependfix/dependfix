import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import betterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    formatRestoreResult,
    inspectSqliteFile,
    main,
    parseRestoreArgs,
    restoreDatabase,
} from './db-restore'

/**
 * db-restore 测试（任务登记见 docs/plan/todo.md §M22.2）：
 * 覆盖参数双门控 / 集成恢复链路（写入 → 备份 → 删数据 → 恢复 → 数据回来）/
 * 损坏备份拒绝 / 覆盖前自动备份 / WAL 旁文件清理 / 自检输出。
 */

/** 创建一个含 1 张表 1 行数据的真实 SQLite 库 */
const createSeedDatabase = (path: string, value: string): void => {
    const db = betterSqlite3(path)
    db.exec('CREATE TABLE IF NOT EXISTS demo (id INTEGER PRIMARY KEY, value TEXT)')
    db.prepare('INSERT INTO demo (value) VALUES (?)').run(value)
    db.close()
}

/** 读取 demo 表所有 value */
const readValues = (path: string): string[] => {
    const db = betterSqlite3(path, { readonly: true, fileMustExist: true })
    try {
        return (db.prepare('SELECT value FROM demo ORDER BY id').all() as { value: string }[])
            .map((row) => row.value)
    } finally {
        db.close()
    }
}

describe('db-restore', () => {
    let workDir: string
    let dbPath: string
    let backupPath: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-restore-'))
        mkdirSync(join(workDir, 'data'), { recursive: true })
        dbPath = join(workDir, 'data', 'dependfix.sqlite')
        backupPath = join(workDir, 'snapshot.bak')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        rmSync(workDir, { recursive: true, force: true })
    })

    describe('parseRestoreArgs', () => {
        it('parses --from / --to / --yes / --help', () => {
            expect(parseRestoreArgs(['--from=a.bak', '--to=b.sqlite', '--yes'])).toEqual({
                from: 'a.bak',
                to: 'b.sqlite',
                yes: true,
                help: false,
            })
            expect(parseRestoreArgs(['--help'])).toEqual({ yes: false, help: true })
            expect(parseRestoreArgs(['-h'])).toEqual({ yes: false, help: true })
        })

        it('defaults from/to to undefined and yes to false', () => {
            expect(parseRestoreArgs([])).toEqual({ yes: false, help: false })
        })

        it('ignores space-separated values (only --key=value supported)', () => {
            // `--from x.bak` 形式不被支持（避免值 / flag 歧义），from 保持 undefined
            expect(parseRestoreArgs(['--from', 'x.bak']).from).toBeUndefined()
        })
    })

    describe('inspectSqliteFile', () => {
        it('returns integrity ok and schema_version > 0 for a seeded database', () => {
            createSeedDatabase(dbPath, 'v1')
            const inspection = inspectSqliteFile(dbPath)
            expect(inspection.integrity).toBe('ok')
            expect(inspection.schemaVersion).toBeGreaterThan(0)
        })

        it('throws for a non-SQLite file', () => {
            writeFileSync(backupPath, 'not a sqlite database')
            expect(() => inspectSqliteFile(backupPath)).toThrow()
        })
    })

    describe('restoreDatabase 集成链路', () => {
        it('restores data after it was deleted', () => {
            createSeedDatabase(dbPath, 'v1')
            copyFileSync(dbPath, backupPath)

            // 模拟数据被清空
            const db = betterSqlite3(dbPath)
            db.exec('DELETE FROM demo')
            db.close()
            expect(readValues(dbPath)).toEqual([])

            const result = restoreDatabase({ from: backupPath, to: dbPath })

            expect(readValues(dbPath)).toEqual(['v1'])
            expect(result.inspection.integrity).toBe('ok')
            expect(result.inspection.schemaVersion).toBeGreaterThan(0)
        })

        it('auto-backups the current database before overwriting', () => {
            createSeedDatabase(dbPath, 'current')
            createSeedDatabase(backupPath, 'from-backup')

            const result = restoreDatabase({
                from: backupPath,
                to: dbPath,
                now: new Date(Date.UTC(2026, 8, 1, 12, 0, 0, 0)),
            })

            expect(result.autoBackup).toBe(join(workDir, 'data', 'backups', 'auto.2026-09-01T12-00-00-000.bak'))
            expect(existsSync(result.autoBackup!)).toBe(true)
            // 覆盖前备份保留的是恢复前的数据，可用于撤销恢复
            expect(readValues(result.autoBackup!)).toEqual(['current'])
            expect(readValues(dbPath)).toEqual(['from-backup'])
        })

        it('skips auto-backup when the target database does not exist', () => {
            createSeedDatabase(backupPath, 'from-backup')
            const target = join(workDir, 'data', 'nested', 'new.sqlite')

            const result = restoreDatabase({ from: backupPath, to: target })

            expect(result.autoBackup).toBeUndefined()
            expect(readValues(target)).toEqual(['from-backup'])
        })

        it('removes stale -wal / -shm / -journal sidecar files belonging to the old database', () => {
            createSeedDatabase(dbPath, 'current')
            createSeedDatabase(backupPath, 'from-backup')
            writeFileSync(`${dbPath}-wal`, 'stale wal')
            writeFileSync(`${dbPath}-shm`, 'stale shm')
            // -journal 是默认 journal_mode=delete 的回滚日志，同样属于被覆盖的旧库
            writeFileSync(`${dbPath}-journal`, 'stale journal')

            const result = restoreDatabase({ from: backupPath, to: dbPath })

            expect(result.removedSidecars).toEqual([
                `${dbPath}-wal`,
                `${dbPath}-shm`,
                `${dbPath}-journal`,
            ])
            expect(existsSync(`${dbPath}-wal`)).toBe(false)
            expect(existsSync(`${dbPath}-shm`)).toBe(false)
            expect(existsSync(`${dbPath}-journal`)).toBe(false)
        })

        it('keeps distinct auto backups when two restores land in the same second', () => {
            createSeedDatabase(dbPath, 'first')
            createSeedDatabase(backupPath, 'from-backup')
            const sameSecond = new Date(Date.UTC(2026, 8, 1, 12, 0, 0, 0))

            const first = restoreDatabase({ from: backupPath, to: dbPath, now: sameSecond })
            const second = restoreDatabase({
                from: backupPath,
                to: dbPath,
                now: new Date(Date.UTC(2026, 8, 1, 12, 0, 0, 500)),
            })

            expect(second.autoBackup).not.toBe(first.autoBackup)
            // 第一份 auto 备份仍在：它是撤销第一次恢复的唯一凭据
            expect(readValues(first.autoBackup!)).toEqual(['first'])
        })

        it('applies the retention policy to auto backups', () => {
            createSeedDatabase(backupPath, 'from-backup')
            for (let i = 0; i < 4; i++) {
                createSeedDatabase(dbPath, `gen-${i}`)
                restoreDatabase({
                    from: backupPath,
                    to: dbPath,
                    now: new Date(Date.UTC(2026, 8, 1, 12, 0, i)),
                    retentionCount: 2,
                })
                rmSync(dbPath)
            }

            const autoBackups = readdirSync(join(workDir, 'data', 'backups'))
                .filter((name) => name.startsWith('auto.'))
            expect(autoBackups).toHaveLength(2)
        })

        it('rejects a missing backup file without touching the target', () => {
            createSeedDatabase(dbPath, 'current')
            expect(() => restoreDatabase({ from: join(workDir, 'missing.bak'), to: dbPath }))
                .toThrow(/备份文件不存在/)
            expect(readValues(dbPath)).toEqual(['current'])
        })

        it('rejects an empty backup file without touching the target', () => {
            createSeedDatabase(dbPath, 'current')
            writeFileSync(backupPath, '')
            expect(() => restoreDatabase({ from: backupPath, to: dbPath }))
                .toThrow(/备份文件为空/)
            expect(readValues(dbPath)).toEqual(['current'])
        })

        it('rejects a corrupt backup file without touching the target', () => {
            createSeedDatabase(dbPath, 'current')
            writeFileSync(backupPath, 'definitely not sqlite')
            expect(() => restoreDatabase({ from: backupPath, to: dbPath }))
                .toThrow(/无法作为 SQLite 数据库打开/)
            expect(readValues(dbPath)).toEqual(['current'])
            expect(existsSync(join(workDir, 'data', 'backups'))).toBe(false)
        })
    })

    describe('main 双门控', () => {
        it('exits 1 when --from is missing', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            expect(main(['--yes'])).toBe(1)
            expect(spy.mock.calls[0]![0]).toContain('--from')
        })

        it('exits 1 when --yes is missing', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            expect(main([`--from=${backupPath}`])).toBe(1)
            expect(spy.mock.calls[0]![0]).toContain('--yes')
        })

        it('prints help and exits 0 for --help', () => {
            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main(['--help'])).toBe(0)
            expect(spy.mock.calls[0]![0]).toContain('db-restore')
        })

        it('exits 1 when restore fails', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            expect(main([`--from=${join(workDir, 'missing.bak')}`, '--yes', `--to=${dbPath}`])).toBe(1)
            expect(spy.mock.calls[0]![0]).toContain('恢复未完成')
        })

        it('prefers --to over the DATABASE_PATH env when both are provided', () => {
            createSeedDatabase(backupPath, 'from-backup')
            const explicitTarget = join(workDir, 'data', 'explicit.sqlite')

            vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main([`--from=${backupPath}`, '--yes', `--to=${explicitTarget}`], {
                DATABASE_PATH: dbPath,
            })).toBe(0)

            expect(readValues(explicitTarget)).toEqual(['from-backup'])
            expect(existsSync(dbPath)).toBe(false)
        })

        it('restores successfully and exits 0, resolving target from DATABASE_PATH env', () => {
            createSeedDatabase(dbPath, 'v1')
            copyFileSync(dbPath, backupPath)
            const db = betterSqlite3(dbPath)
            db.exec('DELETE FROM demo')
            db.close()

            const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
            expect(main([`--from=${backupPath}`, '--yes'], { DATABASE_PATH: dbPath })).toBe(0)
            expect(readValues(dbPath)).toEqual(['v1'])
            expect(spy.mock.calls[0]![0]).toContain('数据库恢复完成')
        })
    })

    describe('formatRestoreResult', () => {
        it('renders all fields including the no-auto-backup case', () => {
            const output = formatRestoreResult({
                from: 'a.bak',
                to: 'b.sqlite',
                removedSidecars: [],
                inspection: { integrity: 'ok', schemaVersion: 3 },
            })
            expect(output).toContain('来源备份:       a.bak')
            expect(output).toContain('目标库原本不存在，未备份')
            expect(output).toContain('(无)')
            expect(output).toContain('schema_version:  3')
        })
    })

    describe('原子写入复用（backup.ts）', () => {
        it('leaves no .tmp residue after auto-backup', () => {
            createSeedDatabase(dbPath, 'current')
            createSeedDatabase(backupPath, 'from-backup')
            const result = restoreDatabase({ from: backupPath, to: dbPath })
            expect(existsSync(`${result.autoBackup}.tmp`)).toBe(false)
            expect(statSync(result.autoBackup!).size).toBe(readFileSync(result.autoBackup!).length)
        })
    })
})
