import {
    closeSync,
    existsSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readdirSync,
    renameSync,
    statSync,
    unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { isQueueWorkerProcess } from '#server/utils/process-role'

/**
 * SQLite 数据库启动期自动备份（hard requirement，规范见 docs/standards/development.md §5.1.18
 * + docs/standards/security.md §2.1.1 + docs/standards/platform.md §3.7；任务登记见 todo.md §M22.1）。
 *
 * 设计动机：2026-09-01 dependfix.sqlite 数据清空事故复盘（见经验归档 §五十）——一旦业务数据被
 * 误删 / 误覆盖 / 外部 rm，没有任何回滚手段。启动期自动备份是 SQLite 单写者脆弱性的最后防线。
 *
 * 设计要点：
 * - **WAL 一致性**：走 SQLite 在线备份 API（`better-sqlite3` 的 `db.backup`），而不是直接复制主库文件。
 *   应用强制 `journal_mode=wal`，已提交数据可能仍只在 `-wal` 里——裸复制主文件会得到**空库或旧库**
 *   （2026-10-31 运维实测：优雅停止后主库仍是 4096 字节、数据全在 WAL，备份产物 schema_version=0）
 * - 写入原子性：在线备份先写 `.tmp`，`fsyncSync` 刷盘后再原子 rename 到最终路径；断电时不会留下半成品
 * - 保留策略：默认 5 份，可通过 BACKUP_RETENTION_COUNT env 覆盖；按 mtime 降序排序，超出部分删除
 * - 触发条件：源文件存在 + size > 0 + 后缀不是 .bak（避免备份目录内 .bak 文件被递归备份）
 * - 跳过机制：BACKUP_SKIP=true 跳过（e2e 等无需备份的场景）；队列 worker 进程跳过（迁移与备份
 *   都由 HTTP 主进程承担，避免同一时刻两份快照争用保留位）
 * - 失败处理：catch + console.error，不抛 —— 应用启动期 fail-open 而非 fail-closed（恢复依赖
 *   用户的本地副本或外部备份）
 * - 时间戳格式：ISO 8601 紧凑型 `YYYY-MM-DDTHH-mm-ss`（避免冒号在文件名中的转义问题）
 *
 * 测试覆盖：apps/platform/server/database/backup.test.ts（备份创建 / WAL 一致性 / 跳过 / 保留策略 / 失败不抛）
 */

/** 默认保留备份份数（5 份已足够覆盖最近几天的回滚需求，减少磁盘占用） */
export const DEFAULT_RETENTION_COUNT = 5

/** 备份目录名（与 SQLite 文件同级，e.g. `data/backups/`） */
export const BACKUP_DIR_NAME = 'backups'

/** 备份文件后缀 */
export const BACKUP_FILE_EXTENSION = '.bak'

/** 临时文件后缀（rename 前写入目标文件） */
const TEM_FILE_EXTENSION = '.tmp'

/** 备份结果（成功 / 跳过 / 失败 / 清理数） */
export interface BackupResult {
    /** 成功创建的备份路径（成功时） */
    created?: string
    /** 跳过原因（无源文件 / 源为空 / 源为 .bak 文件 / BACKUP_SKIP / 队列 worker 进程） */
    skipped?: 'no source file' | 'empty file' | 'backup file' | 'skip enabled' | 'queue worker process'
    /** 清理的老备份份数（成功或跳过都可能产生） */
    cleaned?: number
    /** 错误信息（失败时；调用方应 fail-open 不阻塞启动） */
    error?: Error
}

/**
 * 用 SQLite 在线备份 API（`better-sqlite3` 的 `db.backup`）把源库一致性快照写为目标文件。
 *
 * 为什么不用 `readFileSync` 复制主库文件：WAL 模式下已提交数据可能仍只在 `-wal` 里，
 * 主文件可能只是一个 4KB 头页。在线备份由 SQLite 自己按页读取，得到的是一致性快照。
 *
 * 写入原子性：先写 `<dest>.tmp` → fsync → rename，SIGKILL / 断电不会在目标路径留下半成品。
 * 以读写方式打开源库（而非 `readonly`）：WAL 库在缺少 `-shm` 时只读连接无法建立。
 *
 * 复用方：启动期备份、`db:restore` 的「覆盖前自动备份」（同一反模式，禁止裸复制）。
 *
 * @param sourcePath 源数据库路径
 * @param destPath 目标文件路径（会被覆盖）
 */
export const createSnapshot = async (sourcePath: string, destPath: string): Promise<void> => {
    const tempPath = `${destPath}${TEM_FILE_EXTENSION}`
    try {
        const db = new Database(sourcePath)
        try {
            await db.backup(tempPath)
        } finally {
            db.close()
        }
        // 刷盘，保证断电时目标文件不是半成品（rename 前完成）
        const fd = openSync(tempPath, 'r+')
        try {
            fsyncSync(fd)
        } finally {
            closeSync(fd)
        }
        renameSync(tempPath, destPath)
    } catch (error) {
        removeFileQuietly(tempPath)
        throw error
    }
}

/**
 * 同步一致性快照（`VACUUM INTO`）：供同步调用方复用（当前为 `db:restore` 的覆盖前自动备份）。
 *
 * 与 {@link createSnapshot} 等价（都包含 WAL 中未 checkpoint 的数据），差别只是 SQLite 的两种
 * 实现路径：本函数同步（VACUUM INTO），{@link createSnapshot} 异步（在线备份 API）。
 * 写入同样 `.tmp` → `fsync` → `rename`，SIGKILL 不会在目标路径留下半成品。
 *
 * @param sourcePath 源数据库路径
 * @param destPath 目标文件路径（必须不存在；VACUUM INTO 遇到已存在文件会报错）
 */
export const createSnapshotSync = (sourcePath: string, destPath: string): void => {
    const tempPath = `${destPath}${TEM_FILE_EXTENSION}`
    try {
        const db = new Database(sourcePath)
        try {
            db.exec(`VACUUM INTO '${tempPath.replaceAll('\'', '\'\'')}'`)
        } finally {
            db.close()
        }
        const fd = openSync(tempPath, 'r+')
        try {
            fsyncSync(fd)
        } finally {
            closeSync(fd)
        }
        renameSync(tempPath, destPath)
    } catch (error) {
        removeFileQuietly(tempPath)
        throw error
    }
}

/** 删除文件（不存在 / 删除失败都不抛，用于失败路径清理临时文件） */
const removeFileQuietly = (path: string): void => {
    try {
        unlinkSync(path)
    } catch {
        // 清理失败不阻断
    }
}

/**
 * 数据库启动期自动备份（异步）。在 `ensureDatabaseInitialized()` 之前调用，确保任何
 * schema 同步 / 数据写入操作前都有最新备份。
 *
 * @param dbPath SQLite 数据库文件路径（绝对或相对 process.cwd()）
 * @param options.retentionCount 保留备份份数（默认 5，可通过 BACKUP_RETENTION_COUNT env 覆盖）
 * @returns BackupResult（成功 / 跳过 / 失败 / 清理数）
 */
export const backupDatabaseIfNeeded = async (
    dbPath: string,
    options: { retentionCount?: number } = {},
): Promise<BackupResult> => {
    // BACKUP_SKIP=true 时跳过备份（用于 e2e 测试等无需备份的场景）
    if (process.env.BACKUP_SKIP === 'true') {
        return { skipped: 'skip enabled' }
    }

    const retentionCount = options.retentionCount
        ?? (Number(process.env.BACKUP_RETENTION_COUNT) || DEFAULT_RETENTION_COUNT)

    // 1. 触发条件检查 —— 不源文件存在 + size > 0 + 后缀不是 .bak
    if (!existsSync(dbPath)) {
        return { skipped: 'no source file' }
    }
    const stat = statSync(dbPath)
    if (stat.size === 0) {
        return { skipped: 'empty file' }
    }
    if (dbPath.endsWith(BACKUP_FILE_EXTENSION)) {
        // 防止递归备份（备份目录内的 .bak 文件不被再备份）
        return { skipped: 'backup file' }
    }

    // 2. 准备备份目录（不存在则创建，recursive=true 确保父目录也存在）
    const backupDir = join(dirname(dbPath), BACKUP_DIR_NAME)
    try {
        mkdirSync(backupDir, { recursive: true })
    } catch (error) {
        // mkdir 失败（权限不足 / 只读卷）→ fail-open：返回 error 但不抛
        return { error: error as Error }
    }

    // 3. 备份文件名：${basename}.${YYYY-MM-DDTHH-mm-ss}.bak
    const timestamp = formatTimestamp(new Date())
    const baseFileName = dbPath.split(/[\\/]/).pop() ?? 'database.sqlite'
    const backupName = `${baseFileName}.${timestamp}${BACKUP_FILE_EXTENSION}`
    const backupPath = join(backupDir, backupName)

    // 4. 在线备份（WAL 中已提交但未 checkpoint 的页一并写出，避免「备份是空库」）
    //    内部先写 .tmp → fsync → 原子 rename
    try {
        await createSnapshot(dbPath, backupPath)
    } catch (error) {
        return { error: error as Error }
    }

    // 5. 保留策略：按 mtime 降序排序，保留最近 retentionCount 份
    let cleaned = 0
    try {
        cleaned = cleanupOldBackups(backupDir, baseFileName, retentionCount)
    } catch (error) {
        // 清理失败不阻断（备份已成功创建）
        console.error('[database] backup cleanup failed:', error)
    }

    return { created: backupPath, cleaned }
}

/**
 * 格式化时间戳为 ISO 8601 紧凑型 `YYYY-MM-DDTHH-mm-ss`（UTC）。
 * 文件名安全（无冒号 / 无空格 / 无特殊字符），按字典序即按时间排序。
 * 使用 UTC 而非本地时间，确保容器 / 服务器时区变化时跨环境一致 + 多服务器场景下
 * 文件名时序可比。
 */
export const formatTimestamp = (date: Date): string => {
    const pad = (n: number): string => n.toString().padStart(2, '0')
    const yyyy = date.getUTCFullYear()
    const mm = pad(date.getUTCMonth() + 1)
    const dd = pad(date.getUTCDate())
    const HH = pad(date.getUTCHours())
    const MM = pad(date.getUTCMinutes())
    const ss = pad(date.getUTCSeconds())
    return `${yyyy}-${mm}-${dd}T${HH}-${MM}-${ss}`
}

/**
 * 清理超出保留份数的老备份（按 mtime 降序排序，删除超出部分）。
 * 单独 export 便于测试；不依赖 backupDatabaseIfNeeded 调用。
 *
 * @param backupDir 备份目录路径
 * @param baseFileName 源文件名（用于过滤匹配 `${baseFileName}.*.bak`）
 * @param retentionCount 保留份数
 * @returns 实际删除的份数
 */
export const cleanupOldBackups = (
    backupDir: string,
    baseFileName: string,
    retentionCount: number,
): number => {
    if (!existsSync(backupDir)) {
        return 0
    }
    const prefix = `${baseFileName}.`
    const suffix = BACKUP_FILE_EXTENSION
    const tmpSuffix = `${BACKUP_FILE_EXTENSION}${TEM_FILE_EXTENSION}`
    // 先回收中断残留的 .bak.tmp（备份写入过程中被 SIGKILL 的残片，永不可能是有效备份）
    const entries = readdirSync(backupDir).filter((name) => name.startsWith(prefix) && name.endsWith(tmpSuffix))
    for (const entry of entries) {
        removeFileQuietly(join(backupDir, entry))
    }
    const backups = readdirSync(backupDir)
        .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
        .map((name) => ({
            name,
            path: join(backupDir, name),
            mtime: statSync(join(backupDir, name)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime) // 降序：最新的在前

    const toRemove = backups.slice(retentionCount) // 超出保留份数的老备份
    let removed = 0
    for (const entry of toRemove) {
        try {
            unlinkSync(entry.path)
            removed++
        } catch {
            // 单个备份删除失败不阻断（可能其他进程正在读取 / 权限问题）
        }
    }
    return removed
}

/**
 * 启动期入口包装：解析数据库路径 + 调用 backupDatabaseIfNeeded + 启动日志。
 * 在 `ensureDatabaseInitialized()` 之前调用。
 *
 * 队列 worker 进程跳过备份：迁移与备份都由 HTTP 主进程承担（两进程同时快照会争用保留位，
 * 且 worker 侧 `DATABASE_MIGRATIONS_RUN=false`，备份时机没有意义）。判定见 platform.md §10.6。
 *
 * @returns BackupResult（用于测试断言；生产环境仅看 console 输出）
 */
export const runStartupBackup = async (): Promise<BackupResult> => {
    if (isQueueWorkerProcess()) {
        const result: BackupResult = { skipped: 'queue worker process' }
        console.log('[database] backup skipped: queue worker process')
        return result
    }

    const dbPath = process.env.DATABASE_PATH ?? 'data/dependfix.sqlite'
    const result = await backupDatabaseIfNeeded(dbPath)

    if (result.error) {
        console.error('[database] backup failed:', result.error)
    } else if (result.created) {
        console.log(`[database] backup created: ${result.created}${result.cleaned ? ` (cleaned ${result.cleaned} old backups)` : ''}`)
    } else if (result.skipped) {
        console.log(`[database] backup skipped: ${result.skipped}`)
    }

    return result
}
