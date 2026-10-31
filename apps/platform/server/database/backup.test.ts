import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    backupDatabaseIfNeeded,
    cleanupOldBackups,
    formatTimestamp,
    runStartupBackup,
} from './backup'

/**
 * backup.ts 单测：覆盖备份创建 / **WAL 一致性** / 跳过条件 / 保留策略 / 失败降级 / 启动入口。
 *
 * 关键回归（2026-10-31 运维实测）：应用强制 `journal_mode=wal`，此前备份直接复制主库文件，
 * 主文件可能只有 4KB 头页（数据都在 `-wal`），备份产物 `schema_version=0`（空库）。
 * 现在走 SQLite 在线备份 API，用例必须证明「未 checkpoint 的数据也在备份里」。
 */

const makeTempDir = (label: string): string => {
    const dir = join(
        process.env.TMPDIR ?? '/tmp',
        `backup-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    mkdirSync(dir, { recursive: true })
    return dir
}

const realEnv = { ...process.env }

/** 建一个真实 SQLite 库并写入若干行（`journalMode` 可选 wal，保持连接开放以模拟未 checkpoint）。 */
const createSqliteDb = (dbPath: string, options: { journalMode?: 'wal' | 'delete', rows?: number, keepOpen?: boolean } = {}): Database.Database | null => {
    const db = new Database(dbPath)
    if (options.journalMode) {
        db.pragma(`journal_mode = ${options.journalMode}`)
    }
    db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL)')
    const insert = db.prepare('INSERT INTO sample (value) VALUES (?)')
    for (let i = 0; i < (options.rows ?? 3); i++) {
        insert.run(`row-${i}`)
    }
    if (options.keepOpen) {
        return db
    }
    db.close()
    return null
}

/** 读目标库的表行数（只读打开；不存在时返回 -1）。 */
const countRows = (dbPath: string): number => {
    if (!existsSync(dbPath)) {
        return -1
    }
    const db = new Database(dbPath, { readonly: true })
    try {
        return (db.prepare('SELECT COUNT(*) AS c FROM sample').get() as { c: number }).c
    } finally {
        db.close()
    }
}

const removeDir = (dir: string): void => {
    try {
        rmSync(dir, { recursive: true, force: true })
    } catch {
        // best-effort：临时目录残留不影响断言
    }
}

describe('backupDatabaseIfNeeded', () => {
    let workDir: string
    let dbPath: string
    let backupDir: string

    beforeEach(() => {
        vi.unstubAllEnvs()
        workDir = makeTempDir('backup')
        dbPath = join(workDir, 'test.sqlite')
        backupDir = join(workDir, 'backups')
    })

    afterEach(() => {
        process.env = { ...realEnv }
        removeDir(workDir)
    })

    describe('正常路径', () => {
        it('创建备份文件（ISO 紧凑时间戳）且可独立打开、行数一致', async () => {
            createSqliteDb(dbPath, { rows: 3 })
            const result = await backupDatabaseIfNeeded(dbPath)

            expect(result.error).toBeUndefined()
            expect(result.skipped).toBeUndefined()
            expect(result.created).toBeDefined()
            // 时间戳格式：test.sqlite.YYYY-MM-DDTHH-mm-ss.bak
            const filename = result.created!.split(/[\\/]/).pop()!
            expect(filename).toMatch(/^test\.sqlite\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.bak$/)

            expect(existsSync(backupDir)).toBe(true)
            expect(readdirSync(backupDir).length).toBe(1)
            expect(countRows(result.created!)).toBe(3)
        })

        it('WAL 模式下未 checkpoint 的数据也进入备份（回归：裸复制主文件得到空库）', async () => {
            // 连接保持开放 → 数据仍在 -wal，主文件通常只有 4KB 头页
            const writer = createSqliteDb(dbPath, { journalMode: 'wal', rows: 5, keepOpen: true })
            try {
                const mainFileSize = statSync(dbPath).size
                const result = await backupDatabaseIfNeeded(dbPath)

                expect(result.error).toBeUndefined()
                expect(countRows(result.created!)).toBe(5)
                // 证明「裸复制主文件」确实不够：主文件明显小于数据量所对应的体积
                expect(mainFileSize).toBeLessThanOrEqual(statSync(result.created!).size)
            } finally {
                writer?.close()
            }
        })

        it('不留下 .tmp 残留（成功路径先写临时文件再 rename）', async () => {
            createSqliteDb(dbPath)
            await backupDatabaseIfNeeded(dbPath)
            expect(readdirSync(backupDir).filter((name) => name.endsWith('.tmp'))).toEqual([])
        })
    })

    describe('跳过条件', () => {
        it('源文件不存在 → no source file', async () => {
            const result = await backupDatabaseIfNeeded(dbPath)
            expect(result.error).toBeUndefined()
            expect(result.created).toBeUndefined()
            expect(result.skipped).toBe('no source file')
            expect(result.cleaned).toBeUndefined()
        })

        it('源文件为空 → empty file（不创建备份目录）', async () => {
            new Database(dbPath).close() // 空文件
            const result = await backupDatabaseIfNeeded(dbPath)
            expect(result.skipped).toBe('empty file')
            expect(existsSync(backupDir)).toBe(false)
        })

        it('源文件本身是 .bak → backup file（防递归）', async () => {
            const bakPath = join(workDir, 'old.bak')
            createSqliteDb(bakPath)
            const result = await backupDatabaseIfNeeded(bakPath)
            expect(result.skipped).toBe('backup file')
            expect(result.created).toBeUndefined()
        })

        it('BACKUP_SKIP=true → skip enabled', async () => {
            createSqliteDb(dbPath)
            vi.stubEnv('BACKUP_SKIP', 'true')
            const result = await backupDatabaseIfNeeded(dbPath)
            expect(result.skipped).toBe('skip enabled')
            expect(existsSync(backupDir)).toBe(false)
        })
    })

    describe('保留策略', () => {
        it('只保留 retentionCount 份最新备份', async () => {
            createSqliteDb(dbPath)
            // 预置 3 份老备份（不同 mtime）
            mkdirSync(backupDir, { recursive: true })
            for (const [index, stamp] of ['2026-01-01T00-00-00', '2026-01-02T00-00-00', '2026-01-03T00-00-00'].entries()) {
                const file = join(backupDir, `test.sqlite.${stamp}.bak`)
                createSqliteDb(file, { rows: 1 })
                const time = new Date(Date.UTC(2026, 0, index + 1))
                utimesSync(file, time, time)
            }

            const result = await backupDatabaseIfNeeded(dbPath, { retentionCount: 2 })
            expect(result.error).toBeUndefined()
            expect(result.cleaned).toBe(2)
            expect(readdirSync(backupDir).filter((name) => name.endsWith('.bak')).length).toBe(2)
        })

        it('回收中断残留的 .bak.tmp 残片', async () => {
            createSqliteDb(dbPath)
            mkdirSync(backupDir, { recursive: true })
            const staleTmp = join(backupDir, 'test.sqlite.2026-01-01T00-00-00.bak.tmp')
            writeFileSync(staleTmp, 'partial snapshot')

            await backupDatabaseIfNeeded(dbPath, { retentionCount: 5 })

            expect(existsSync(staleTmp)).toBe(false)
        })

        it('备份成功时同步回收超期备份（cleanup 与创建同一次调用内完成）', async () => {
            createSqliteDb(dbPath)
            mkdirSync(backupDir, { recursive: true })
            for (const stamp of ['2026-01-01T00-00-00', '2026-01-02T00-00-00']) {
                createSqliteDb(join(backupDir, `test.sqlite.${stamp}.bak`), { rows: 1 })
            }

            const result = await backupDatabaseIfNeeded(dbPath, { retentionCount: 1 })
            expect(result.error).toBeUndefined()
            expect(result.created).toBeDefined()
            expect(result.cleaned).toBe(2)
        })
    })

    describe('fail-open 兜底（不抛异常）', () => {
        it('源路径不是数据库 → 返回 error 且不抛', async () => {
            mkdirSync(dbPath, { recursive: true }) // 目录当源文件：size > 0，但不是数据库
            const result = await backupDatabaseIfNeeded(dbPath)
            expect(result.error).toBeDefined()
            expect(result.created).toBeUndefined()
        })

        it('备份目录不可写（非 root）→ 返回 error 且不抛', async () => {
            createSqliteDb(dbPath)
            mkdirSync(backupDir, { recursive: true })
            try {
                chmodSync(backupDir, 0o555)
            } catch {
                return // 平台不支持 chmod
            }
            if (process.getuid?.() === 0) {
                chmodSync(backupDir, 0o755)
                return // root 绕过权限检查
            }

            const result = await backupDatabaseIfNeeded(dbPath)
            expect(result.error).toBeDefined()
            expect(result.created).toBeUndefined()

            try {
                chmodSync(backupDir, 0o755)
            } catch {
                // best-effort
            }
        })
    })
})

describe('cleanupOldBackups', () => {
    let workDir: string
    let backupDir: string

    beforeEach(() => {
        workDir = makeTempDir('cleanup')
        backupDir = join(workDir, 'backups')
        mkdirSync(backupDir, { recursive: true })
    })

    afterEach(() => {
        removeDir(workDir)
    })

    it('目录不存在 → 0', () => {
        expect(cleanupOldBackups(join(workDir, 'missing'), 'test.sqlite', 5)).toBe(0)
    })

    it('份数未超保留数 → 0', () => {
        for (const stamp of ['2026-01-01T00-00-00', '2026-01-02T00-00-00']) {
            createSqliteDb(join(backupDir, `test.sqlite.${stamp}.bak`), { rows: 1 })
        }
        expect(cleanupOldBackups(backupDir, 'test.sqlite', 5)).toBe(0)
    })

    it('忽略不匹配前缀的文件', () => {
        createSqliteDb(join(backupDir, 'other.sqlite.2026-01-01T00-00-00.bak'), { rows: 1 })
        expect(cleanupOldBackups(backupDir, 'test.sqlite', 0)).toBe(0)
    })
})

describe('runStartupBackup', () => {
    let workDir: string
    let dbPath: string
    let backupDir: string

    beforeEach(() => {
        vi.unstubAllEnvs()
        workDir = makeTempDir('startup')
        dbPath = join(workDir, 'test.sqlite')
        backupDir = join(workDir, 'backups')
        createSqliteDb(dbPath, { rows: 2 })
        vi.stubEnv('DATABASE_PATH', dbPath)
    })

    afterEach(() => {
        process.env = { ...realEnv }
        removeDir(workDir)
    })

    it('使用 DATABASE_PATH 并创建备份', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        try {
            const result = await runStartupBackup()
            expect(result.error).toBeUndefined()
            expect(result.created).toContain(backupDir)
            expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[database\] backup created:/))
        } finally {
            logSpy.mockRestore()
        }
    })

    it('源文件不存在时记录跳过原因', async () => {
        vi.stubEnv('DATABASE_PATH', join(workDir, 'missing.sqlite'))
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        try {
            const result = await runStartupBackup()
            expect(result.skipped).toBe('no source file')
            expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[database\] backup skipped: no source file/))
        } finally {
            logSpy.mockRestore()
        }
    })

    it('队列 worker 进程跳过备份（迁移与备份由 HTTP 主进程承担）', async () => {
        vi.stubEnv('DEPENDFIX_ROLE', 'worker')
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        try {
            const result = await runStartupBackup()
            expect(result.skipped).toBe('queue worker process')
            expect(existsSync(backupDir)).toBe(false)
            expect(logSpy).toHaveBeenCalledWith('[database] backup skipped: queue worker process')
        } finally {
            logSpy.mockRestore()
        }
    })
})

describe('formatTimestamp', () => {
    it('输出可按字典序排序的 ISO 8601 紧凑格式', () => {
        expect(formatTimestamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03-04-05')
    })

    it('单数字月 / 日 / 时 / 分 / 秒补零', () => {
        expect(formatTimestamp(new Date(Date.UTC(2026, 8, 9, 1, 2, 3)))).toBe('2026-09-09T01-02-03')
    })

    it('按 UTC 输出（与宿主时区无关）', () => {
        const date = new Date(Date.UTC(2026, 5, 1, 0, 0, 0))
        expect(formatTimestamp(date)).toBe('2026-06-01T00-00-00')
    })
})

describe('备份目录本身', () => {
    it('与数据库同级的 backups 目录名', async () => {
        const workDir = makeTempDir('dir')
        const dbPath = join(workDir, 'nested', 'app.sqlite')
        mkdirSync(dirname(dbPath), { recursive: true })
        createSqliteDb(dbPath, { rows: 1 })
        const result = await backupDatabaseIfNeeded(dbPath)
        expect(dirname(result.created!)).toBe(join(dirname(dbPath), 'backups'))
        removeDir(workDir)
    })
})
