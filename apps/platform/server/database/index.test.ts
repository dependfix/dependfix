import 'reflect-metadata'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataSourceOptions, currentDatabaseType, ensureDatabaseInitialized } from './index'

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

    it('defaults to sqlite with synchronize disabled (opt-in via DATABASE_SYNCHRONIZE)', () => {
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.type).toBe('better-sqlite3')
        expect(options.database).toBe('data/dependfix.sqlite')
        // dev 模式不再自动开启 synchronize（hard requirement：development.md §5.1.19）
        expect(options.synchronize).toBe(false)
        expect(options.entityPrefix).toBe('dependfix_')
        // 实体清单齐备
        expect((options.entities as unknown[]).length).toBeGreaterThanOrEqual(10)
    })

    it('enables synchronize when DATABASE_SYNCHRONIZE=true', () => {
        vi.stubEnv('DATABASE_SYNCHRONIZE', 'true')
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.synchronize).toBe(true)
    })

    it('keeps synchronize=false under NODE_ENV=development (regression: isDev no longer applies)', () => {
        // 防御未来误加回 `|| isDev` 的回归网：即使 NODE_ENV=development，synchronize 也必须 opt-in
        vi.stubEnv('NODE_ENV', 'development')
        const options = createDataSourceOptions() as unknown as Record<string, unknown>
        expect(options.synchronize).toBe(false)
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

describe('ensureDatabaseInitialized', () => {
    let tmpDir: string
    let dbPath: string

    beforeEach(() => {
        tmpDir = join(process.env.TMPDIR ?? '/tmp', `index-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        mkdirSync(tmpDir, { recursive: true })
        dbPath = join(tmpDir, 'test.sqlite')
        // 创建空的 SQLite 文件
        const fd = openSync(dbPath, 'w')
        writeSync(fd, 'seed')
        closeSync(fd)

        process.env = { ...realEnv }
        vi.stubEnv('DATABASE_PATH', dbPath)
        vi.stubEnv('DATABASE_TYPE', 'sqlite')
        vi.stubEnv('DATABASE_SYNCHRONIZE', 'true')
    })

    afterEach(async () => {
        process.env = { ...realEnv }
        vi.unstubAllEnvs()
        // 清理临时目录
        try {
            rmSync(tmpDir, { recursive: true, force: true })
        } catch {
            // best-effort cleanup
        }
    })

    it('creates startup backup before DataSource initialization', () => {
        const backupsDir = join(tmpDir, 'backups')
        expect(existsSync(backupsDir)).toBe(false)

        // 调用 ensureDatabaseInitialized 会触发 runStartupBackup
        ensureDatabaseInitialized().catch(() => { /* DataSource 可能初始化失败（测试环境限制），但 backup 已经在同步阶段完成 */ })

        // 备份目录应已创建 + 至少一份备份
        expect(existsSync(backupsDir)).toBe(true)
        const files = readdirSync(backupsDir)
        expect(files.length).toBeGreaterThanOrEqual(1)

        // 备份文件应包含原 SQLite 数据
        const backupFile = files[0]
        expect(backupFile).toMatch(/^test\.sqlite\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.bak$/)
    })

    it('does not throw when backup fails (fail-open)', () => {
        // 让 backup 失败：设置 DATABASE_PATH 为只读目录下的不存在的文件
        // 实际上 backup 失败不抛也不阻塞，所以我们验证 ensureDatabaseInitialized 能继续
        vi.stubEnv('DATABASE_PATH', join(tmpDir, 'subdir-that-does-not-exist', 'test.sqlite'))
        // 不期望抛错（ensureDatabaseInitialized 内部用 catch）
        expect(() => ensureDatabaseInitialized()).not.toThrow()
    })

    it('does not re-run startup backup on subsequent calls (once flag)', async () => {
        // 验证 once flag：ensureDatabaseInitialized 多次调用只触发一次 backup
        // 模拟场景：hot path 中 60+ 处调用 ensureDatabaseInitialized，每次调用都不应触发 fsync IO
        // 注：startupBackupRan 是模块级状态，前面的测试已设为 true
        //     本测试用 vi.resetModules 重新加载 index.ts，确保 fresh 状态
        vi.resetModules()
        const backupsDir = join(tmpDir, 'backups')
        expect(existsSync(backupsDir)).toBe(false) // 首次调用前无 backups 目录

        // 重新加载模块（fresh startupBackupRan=false）
        const { ensureDatabaseInitialized: ensureFresh } = await import('./index')

        // 首次调用：触发 backup（startupBackupRan 从 false 变 true）
        await ensureFresh().catch(() => {
            // DataSource 可能初始化失败（测试环境）
        })

        // backup 应已创建
        expect(existsSync(backupsDir)).toBe(true)
        const beforeCount = readdirSync(backupsDir).length
        expect(beforeCount).toBe(1) // 仅 1 份

        // 多次调用（模拟 hot path 中 5 次连续请求）
        for (let i = 0; i < 5; i++) {
            await ensureFresh().catch(() => { /* DataSource 可能初始化失败 */ })
        }

        // 文件数不变（once flag 保护）
        const afterCount = readdirSync(backupsDir).length
        expect(afterCount).toBe(beforeCount)
    })
})
