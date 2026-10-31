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
                skipAutoBackup: false,
            })
            expect(parseRestoreArgs(['--help'])).toEqual({ yes: false, help: true, skipAutoBackup: false })
            expect(parseRestoreArgs(['-h'])).toEqual({ yes: false, help: true, skipAutoBackup: false })
            expect(parseRestoreArgs(['--skip-auto-backup']).skipAutoBackup).toBe(true)
        })

        it('defaults from/to to undefined and yes to false', () => {
            expect(parseRestoreArgs([])).toEqual({ yes: false, help: false, skipAutoBackup: false })
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

        it('leaves no stale -wal / -shm / -journal sidecars behind after restore', () => {
            createSeedDatabase(dbPath, 'current')
            createSeedDatabase(backupPath, 'from-backup')
            // 陈旧旁文件（内容无所谓）：覆盖前快照会打开目标库，SQLite 可能自行丢弃无效 WAL；
            // 无论由谁删除，恢复后都不得留下属于旧库的旁文件（陈旧 WAL 回放会污染新库）
            writeFileSync(`${dbPath}-wal`, 'stale wal')
            writeFileSync(`${dbPath}-shm`, 'stale shm')
            writeFileSync(`${dbPath}-journal`, 'stale journal')

            const result = restoreDatabase({ from: backupPath, to: dbPath })

            expect(existsSync(`${dbPath}-wal`)).toBe(false)
            expect(existsSync(`${dbPath}-shm`)).toBe(false)
            expect(existsSync(`${dbPath}-journal`)).toBe(false)
            // 审计面：脚本自身删除的旁文件（若 SQLite 打开时已丢弃，则清单为空）
            expect(result.removedSidecars.every((path) => path.startsWith(dbPath))).toBe(true)
            expect(readValues(dbPath)).toEqual(['from-backup'])
        })

        it('auto-backup includes data still sitting in -wal (regression: raw copy gave an empty backup)', () => {
            // 构造「活库数据全在 WAL」的现场：写连接保持打开，把主库 + 旁文件整体复制成恢复目标，
            // 再关闭写连接（此时主文件只有头页，数据仍在目标库的 -wal 里）
            const live = join(workDir, 'data', 'live.sqlite')
            mkdirSync(join(workDir, 'data'), { recursive: true })
            const writer = betterSqlite3(live)
            writer.pragma('journal_mode = wal')
            writer.exec('CREATE TABLE demo (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)')
            writer.prepare('INSERT INTO demo (value) VALUES (?)').run('from-wal')

            copyFileSync(live, dbPath)
            for (const suffix of ['-wal', '-shm']) {
                if (existsSync(`${live}${suffix}`)) {
                    copyFileSync(`${live}${suffix}`, `${dbPath}${suffix}`)
                }
            }
            writer.close()
            createSeedDatabase(backupPath, 'from-backup')

            // 现场成立：主文件小于 WAL（数据尚未 checkpoint）
            expect(existsSync(`${dbPath}-wal`)).toBe(true)
            expect(statSync(dbPath).size).toBeLessThan(statSync(`${dbPath}-wal`).size)

            const result = restoreDatabase({ from: backupPath, to: dbPath })

            // 覆盖前自动备份必须包含 WAL 中的已提交数据（裸复制主库会得到空库，读不到 demo 表）
            expect(result.autoBackup).toBeDefined()
            expect(readValues(result.autoBackup!)).toEqual(['from-wal'])
            expect(readValues(dbPath)).toEqual(['from-backup'])
        })

        it('refuses to overwrite a corrupt target unless --skip-auto-backup is given', () => {
            // 目标库损坏（VACUUM INTO 无法打开）→ 中止并提示逃生门，不得静默跳过快照
            writeFileSync(dbPath, 'not a sqlite database')
            createSeedDatabase(backupPath, 'from-backup')

            expect(() => restoreDatabase({ from: backupPath, to: dbPath }))
                .toThrow(/覆盖前自动备份失败.*--skip-auto-backup/s)

            // 逃生门：显式跳过快照后仍可恢复（事故现场目标库已不可用）
            const result = restoreDatabase({ from: backupPath, to: dbPath, skipAutoBackup: true })
            expect(result.autoBackup).toBeUndefined()
            expect(result.autoBackupSkipped).toBe(true)
            expect(formatRestoreResult(result)).toContain('已跳过：--skip-auto-backup')
            expect(readValues(dbPath)).toEqual(['from-backup'])
        })

        it('does not report "skipped" when the target never existed', () => {
            // 目标库原本不存在时没有旧数据可丢：文案仍按「原本不存在」表达
            createSeedDatabase(backupPath, 'from-backup')
            const target = join(workDir, 'data', 'brand-new.sqlite')

            const result = restoreDatabase({ from: backupPath, to: target, skipAutoBackup: true })

            expect(result.autoBackupSkipped).toBeUndefined()
            expect(formatRestoreResult(result)).toContain('目标库原本不存在')
        })

        it('refuses --skip-auto-backup when the target database is healthy', () => {
            // 安全闸门：健康库上跳过快照会丢掉唯一撤销凭据，必须拒绝
            createSeedDatabase(dbPath, 'current')
            createSeedDatabase(backupPath, 'from-backup')

            expect(() => restoreDatabase({ from: backupPath, to: dbPath, skipAutoBackup: true }))
                .toThrow(/可正常打开.*拒绝 --skip-auto-backup/s)
            expect(readValues(dbPath)).toEqual(['current'])
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

    // 审计未采纳项补测
    describe('审计未采纳分支补测', () => {
        describe('inspectSqliteFile 能打开但 integrity_check != ok', () => {
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

        describe('恢复后 integrity_check 失败分支', () => {
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

        describe('旁文件损坏时覆盖前快照失败（fail-closed，不动目标库）', () => {
            it('aborts before replacing the target when a sidecar cannot be opened', () => {
                createSeedDatabase(dbPath, 'current')
                createSeedDatabase(backupPath, 'from-backup')
                // `-journal` 建成目录：覆盖前快照要打开目标库，SQLite 无法把它当作回滚日志 → 抛错。
                // 语义是 fail-closed：快照失败即中止，源库与旁文件原样保留（不得先删除旁文件再丢快照）。
                writeFileSync(`${dbPath}-wal`, 'stale wal')
                writeFileSync(`${dbPath}-shm`, 'stale shm')
                mkdirSync(`${dbPath}-journal`)
                const targetBytes = readFileSync(dbPath)

                expect(() => restoreDatabase({
                    from: backupPath,
                    to: dbPath,
                    // 注入恒 ok 的自检：排除「恢复后自检失败」这条无关抛错来源
                    inspect: () => ({ integrity: 'ok', schemaVersion: 1 }),
                })).toThrow()

                // 目标库未被替换（按字节比对：残留的伪 WAL 让 SQLite 无法打开该文件做查询）；
                // 旁文件未被清理（全部原样保留）
                expect(readFileSync(dbPath)).toEqual(targetBytes)
                expect(existsSync(`${dbPath}-wal`)).toBe(true)
                expect(existsSync(`${dbPath}-shm`)).toBe(true)
                expect(existsSync(`${dbPath}-journal`)).toBe(true)
            })
        })

        describe('--from / --to 未做路径规范化（校验 .. / 符号链接）', () => {
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
