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
import * as fs from 'node:fs'
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

const createSeedDatabase = (path: string, value: string): void => {
    const db = betterSqlite3(path)
    db.exec('CREATE TABLE IF NOT EXISTS demo (id INTEGER PRIMARY KEY, value TEXT)')
    db.prepare('INSERT INTO demo (value) VALUES (?)').run(value)
    db.close()
}

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

    // M30.5: M22.2 A 阶段审计未采纳项补测
    describe('M22.2 审计未采纳分支补测', () => {
        describe('S-1 第 2 项：inspectSqliteFile 能打开但 integrity_check != ok', () => {
            it('rejects a SQLite file that opens but has corrupted integrity_check', () => {
                createSeedDatabase(dbPath, 'v1')
                copyFileSync(dbPath, backupPath)

                // Create a database with a valid schema but corrupted data page
                // by truncating the file slightly (removes last page, may fail integrity_check)
                const buffer = readFileSync(backupPath)
                const truncated = buffer.subarray(0, buffer.length - 500)
                writeFileSync(backupPath, truncated)

                const inspection = inspectSqliteFile(backupPath)
                expect(inspection.integrity).not.toBe('ok')

                expect(() => restoreDatabase({ from: backupPath, to: dbPath }))
                    .toThrow(/integrity_check 未通过/)
                expect(readValues(dbPath)).toEqual(['v1'])
            })
        })

        describe('S-1 第 3 项：恢复后 integrity_check 失败分支', () => {
            it('throws when post-restore integrity_check fails', () => {
                createSeedDatabase(dbPath, 'current')
                createSeedDatabase(backupPath, 'from-backup')

                // 注入自检：源备份预校验通过、恢复后的目标库自检返回损坏。
                // 真实环境不可达（copyFileSync 保证目标库与备份字节一致），故以注入点模拟磁盘故障。
                const inspect = vi.fn<(target: string) => { integrity: string, schemaVersion: number }>()
                    .mockReturnValueOnce({ integrity: 'ok', schemaVersion: 1 })
                    .mockReturnValueOnce({ integrity: 'database disk image is malformed', schemaVersion: 1 })

                expect(() => restoreDatabase({ from: backupPath, to: dbPath, inspect }))
                    .toThrow(/恢复后 integrity_check 未通过/)
                expect(inspect).toHaveBeenCalledTimes(2)
                expect(inspect).toHaveBeenNthCalledWith(1, backupPath)
                expect(inspect).toHaveBeenNthCalledWith(2, dbPath)
                // fail-closed：抛错发生在 copyFileSync 之后，目标库已被替换，需人工核对
                expect(readValues(dbPath)).toEqual(['from-backup'])
            })
        })

        describe('S-1 第 4 项：sidecar unlinkSync 部分失败的 removedSidecars 状态一致性', () => {
            it('keeps on-disk sidecar state consistent when a deletion fails midway', () => {
                createSeedDatabase(dbPath, 'current')
                createSeedDatabase(backupPath, 'from-backup')
                // 真实文件系统故障注入：`-shm` 建成目录 → unlinkSync 对其抛错（EISDIR / EPERM）。
                // 遍历顺序为 ['-wal', '-shm', '-journal']，故 -wal 在失败前已删除、-journal 未被处理。
                writeFileSync(`${dbPath}-wal`, 'stale wal')
                mkdirSync(`${dbPath}-shm`)
                writeFileSync(`${dbPath}-journal`, 'stale journal')

                expect(() => restoreDatabase({
                    from: backupPath,
                    to: dbPath,
                    // 注入恒 ok 的自检：使本用例唯一可能的抛错来源只能是 unlinkSync 失败。
                    // 否则残留的陈旧 -journal 会让下游 inspect(to) 以「只读打开尝试回滚」报错，
                    // 恰好满足无参 toThrow()，从而掩盖「清理循环被 try/catch 吞错」这类回归。
                    inspect: () => ({ integrity: 'ok', schemaVersion: 1 }),
                })).toThrow()

                // 磁盘状态一致：已删除的确实删除，失败点及其后的保留（fail-closed，不静默跳过）
                expect(existsSync(`${dbPath}-wal`)).toBe(false)
                expect(existsSync(`${dbPath}-shm`)).toBe(true)
                expect(existsSync(`${dbPath}-journal`)).toBe(true)
                // 主库已恢复：copyFileSync 在 sidecar 清理之前完成，故目标库字节等于备份
                // （不用 SQLite 打开校验：残留的陈旧 -journal 会让只读打开尝试回滚恢复而报错）
                expect(readFileSync(dbPath)).toEqual(readFileSync(backupPath))
            })
        })

        describe('S-2 第 1 项：--from / --to 未做路径规范化（校验 .. / 符号链接）', () => {
            it('does NOT reject --from with path traversal (..) - current behavior', () => {
                createSeedDatabase(dbPath, 'v1')
                copyFileSync(dbPath, backupPath)
                const target = join(workDir, 'data', 'target.sqlite')

                const realFromDir = join(workDir, 'data', '..', 'data')
                mkdirSync(realFromDir, { recursive: true })
                const fromPath = join(workDir, 'data', '..', 'data', 'snapshot.bak')
                copyFileSync(dbPath, fromPath)

                expect(() => restoreDatabase({ from: fromPath, to: target })).not.toThrow()
                expect(readValues(target)).toEqual(['v1'])
            })

            it('does NOT reject --to with path traversal (..) - current behavior', () => {
                createSeedDatabase(backupPath, 'from-backup')

                const realToDir = join(workDir, 'data', '..', 'data')
                mkdirSync(realToDir, { recursive: true })
                const toPath = join(workDir, 'data', '..', 'data', 'target.sqlite')

                expect(() => restoreDatabase({ from: backupPath, to: toPath })).not.toThrow()
                expect(existsSync(join(workDir, 'data', 'target.sqlite'))).toBe(true)
            })

            it('does NOT normalize symlinks in --from -- current behavior', () => {
                const realDir = join(workDir, 'real-backups')
                mkdirSync(realDir, { recursive: true })
                const realBackup = join(realDir, 'real.bak')
                createSeedDatabase(realBackup, 'from-backup')

                const linkDir = join(workDir, 'linked-backups')
                mkdirSync(linkDir, { recursive: true })
                const linkBackup = join(linkDir, 'link.bak')

                try {
                    fs.symlinkSync(realBackup, linkBackup)
                } catch {
                    return
                }

                const target = join(workDir, 'data', 'target.sqlite')
                const result = restoreDatabase({ from: linkBackup, to: target })

                expect(result.from).toBe(linkBackup)
                expect(readValues(target)).toEqual(['from-backup'])

                fs.unlinkSync(linkBackup)
            })
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
