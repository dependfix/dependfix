#!/usr/bin/env tsx
/**
 * db-restore：SQLite 数据库命令式恢复脚本。
 *
 * 背景（任务登记见 docs/plan/todo.md §M22.2）：启动期自动备份（`backup.ts`，产物落在
 * `data/backups/*.bak`）已实现，但备份只有在
 * 能被恢复时才有意义。2026-09-01 数据清空事故（经验归档 §五十）暴露的核心缺口是"没有任何
 * 回滚手段"，本脚本补齐这一环。
 *
 * 用法：
 *   pnpm db:restore --from=data/backups/dependfix.sqlite.2026-09-01T12-00-00.bak --yes
 *
 * 安全门（双门控，规范见 docs/standards/security.md §2.1.2）：
 * - `--from=<backup-file>` 必填：不猜测"最新备份"，恢复目标必须由人显式指定
 * - `--yes` 必填：非交互式确认标志，防止误操作覆盖现网数据
 * - 覆盖前自动备份：当前数据库先原子备份到 `data/backups/auto-${timestamp}.bak`
 *   （恢复本身也可能是误操作，这份备份是"撤销恢复"的唯一凭据）
 * - 源文件预校验：恢复前先对备份文件跑 `PRAGMA integrity_check`，损坏的备份不允许覆盖好库
 * - WAL / SHM 清理：恢复后删除属于旧数据库的 `-wal` / `-shm` 旁文件，避免陈旧 WAL 回放
 *   污染刚恢复的主库
 *
 * 与启动期自动备份的关系：复用 `backup.ts` 的 `formatTimestamp` /
 * `BACKUP_DIR_NAME`，保证备份文件命名与写入语义单点声明。
 *
 * **覆盖前自动备份必须走在线备份**：应用强制 `journal_mode=wal`，进程退出可能不触发 checkpoint
 * （实测停止后主文件仍 4KB、数据全在 `-wal`）；裸复制主库会得到空备份，而本脚本随后会删除
 * `-wal` / `-shm`——那份空备份就成了「撤销恢复」的唯一凭据（数据不可恢复）。
 *
 * 测试覆盖：apps/platform/server/database/scripts/db-restore.test.ts
 */
import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import betterSqlite3 from 'better-sqlite3'
import {
    BACKUP_DIR_NAME,
    BACKUP_FILE_EXTENSION,
    cleanupOldBackups,
    createSnapshotSync,
    DEFAULT_RETENTION_COUNT,
    formatTimestamp,
} from '../backup'

/** 默认 SQLite 数据库路径（与 createDataSourceOptions 保持一致） */
const DEFAULT_DATABASE_PATH = 'data/dependfix.sqlite'

/** 覆盖前自动备份的文件名前缀（产物形如 `auto.<ts>-<ms>.bak`） */
const AUTO_BACKUP_PREFIX = 'auto'

/**
 * SQLite 旁文件后缀（恢复后必须清理）。
 * `-wal` / `-shm` 是 WAL 模式产物；`-journal` 是默认 `journal_mode=delete` 的回滚日志——
 * 三者都属于被覆盖的旧数据库，残留会让 SQLite 对新主库执行错误的崩溃恢复。
 */
const SIDECAR_SUFFIXES = ['-wal', '-shm', '-journal'] as const

/** CLI 参数解析结果 */
export interface RestoreArgs {
    /** `--from=<path>` 备份文件路径（缺省为 undefined，由调用方报错） */
    from?: string
    /** `--yes` 是否显式确认 */
    yes: boolean
    /** `--help` / `-h` */
    help: boolean
    /** `--to=<path>` 恢复目标（默认取 DATABASE_PATH env 或 data/dependfix.sqlite） */
    to?: string
    /** `--skip-auto-backup` 跳过覆盖前自动备份（仅目标库已损坏 / 无法打开时的逃生门） */
    skipAutoBackup: boolean
}

/** 数据库自检信息（恢复后校验用） */
export interface DatabaseInspection {
    /** `PRAGMA integrity_check` 结果（健康库返回 'ok'） */
    integrity: string
    /** `PRAGMA schema_version`（0 = 全新库，> 0 = 已建表） */
    schemaVersion: number
}

/** 恢复结果 */
export interface RestoreResult {
    /** 恢复来源备份路径 */
    from: string
    /** 恢复目标数据库路径 */
    to: string
    /** 覆盖前自动备份路径（目标库原本不存在 / 显式跳过时为 undefined） */
    autoBackup?: string
    /** 是否因 `--skip-auto-backup` 跳过了覆盖前快照（区别于「目标库原本不存在」） */
    autoBackupSkipped?: boolean
    /** 清理的 WAL / SHM 旁文件路径 */
    removedSidecars: string[]
    /** 恢复后自检结果 */
    inspection: DatabaseInspection
}

/**
 * 解析 CLI 参数（纯函数，便于单测）。
 *
 * 只接受 `--key=value` 与布尔 flag 形式，不支持空格分隔（`--from x`），
 * 避免"下一个 token 到底是值还是 flag"的歧义。
 */
export const parseRestoreArgs = (argv: string[]): RestoreArgs => {
    const args: RestoreArgs = { yes: false, help: false, skipAutoBackup: false }
    for (const arg of argv) {
        if (arg === '--yes') {
            args.yes = true
        } else if (arg === '--help' || arg === '-h') {
            args.help = true
        } else if (arg === '--skip-auto-backup') {
            args.skipAutoBackup = true
        } else if (arg.startsWith('--from=')) {
            args.from = arg.slice('--from='.length)
        } else if (arg.startsWith('--to=')) {
            args.to = arg.slice('--to='.length)
        }
    }
    return args
}

/**
 * 对 SQLite 文件跑 `PRAGMA integrity_check` + `PRAGMA schema_version`（只读打开）。
 *
 * 只读模式（`readonly: true`）确保自检本身不会创建 WAL / 修改文件；
 * 打开失败（非 SQLite 文件 / 文件损坏）时向上抛出，由调用方转成拒绝恢复。
 */
export const inspectSqliteFile = (dbPath: string): DatabaseInspection => {
    const db = betterSqlite3(dbPath, { readonly: true, fileMustExist: true })
    try {
        const integrityRow = db.pragma('integrity_check', { simple: true })
        const schemaVersionRow = db.pragma('schema_version', { simple: true })
        return {
            integrity: String(integrityRow),
            schemaVersion: Number(schemaVersionRow),
        }
    } finally {
        db.close()
    }
}

/**
 * 执行恢复：预校验备份 → 覆盖前自动备份 → copyFileSync → 清理旁文件 → 恢复后自检。
 *
 * 与启动期自动备份的 fail-open 策略相反，本函数 fail-closed：任何一步失败都抛异常，
 * 绝不留下"半恢复"的数据库（人为触发的破坏性操作必须显式失败）。
 *
 * @param options.from 备份文件路径（必须存在 + size > 0 + integrity_check = ok）
 * @param options.to 恢复目标数据库路径
 * @param options.now 时间戳注入点（测试用，默认 new Date()）
 * @param options.retentionCount `auto.*.bak` 保留份数（默认 5，BACKUP_RETENTION_COUNT env 可覆盖）
 * @param options.inspect 自检函数注入点（测试用，默认 `inspectSqliteFile`）。
 *   恢复后自检失败分支在真实环境不可达（`copyFileSync` 保证目标库与备份字节一致，除非磁盘故障），
 *   故以注入点在单测中模拟"源备份正常、恢复后损坏"，避免用 ESM mock 替换同模块内部绑定。
 */
export const restoreDatabase = (options: {
    from: string
    to: string
    now?: Date
    retentionCount?: number
    inspect?: (dbPath: string) => DatabaseInspection
    /** 跳过覆盖前自动备份（目标库已损坏无法打开时的逃生门，CLI `--skip-auto-backup`） */
    skipAutoBackup?: boolean
}): RestoreResult => {
    const {
        from,
        to,
        now = new Date(),
        retentionCount = Number(process.env.BACKUP_RETENTION_COUNT) || DEFAULT_RETENTION_COUNT,
        inspect = inspectSqliteFile,
        skipAutoBackup = false,
    } = options

    // 1. 源备份预校验：存在 + 非空 + 是可读的 SQLite 库
    if (!existsSync(from)) {
        throw new Error(`备份文件不存在：${from}`)
    }
    if (statSync(from).size === 0) {
        throw new Error(`备份文件为空，拒绝恢复：${from}`)
    }
    let sourceInspection: DatabaseInspection
    try {
        sourceInspection = inspect(from)
    } catch (error) {
        throw new Error(`备份文件无法作为 SQLite 数据库打开，拒绝恢复：${from}（${(error as Error).message}）`)
    }
    if (sourceInspection.integrity !== 'ok') {
        throw new Error(`备份文件 integrity_check 未通过（${sourceInspection.integrity}），拒绝恢复：${from}`)
    }

    // 2. 覆盖前自动备份当前数据库（走 backup.ts 的原子写入路径）
    const backupDir = join(dirname(to), BACKUP_DIR_NAME)
    let autoBackup: string | undefined
    let autoBackupSkipped: boolean | undefined
    const targetExists = existsSync(to) && statSync(to).size > 0
    if (skipAutoBackup) {
        // 安全闸门：目标库可正常打开（integrity ok）时拒绝跳过——否则会静默丢弃唯一撤销快照
        if (targetExists) {
            let healthy = false
            try {
                healthy = inspect(to).integrity === 'ok'
            } catch {
                healthy = false // 打不开 = 损坏，正是该参数的用途
            }
            if (healthy) {
                throw new Error(
                    `目标库可正常打开（integrity_check=ok）：拒绝 --skip-auto-backup（该参数仅用于目标库已损坏、无法生成快照的场景）`,
                )
            }
        }
        // 显式跳过（目标库已损坏时无法生成快照）；仍保证父目录存在
        mkdirSync(dirname(to), { recursive: true })
        // 目标库原本不存在时没有「旧数据」可丢弃，文案仍按「原本不存在」表达
        if (targetExists) {
            autoBackupSkipped = true
        }
    } else if (targetExists) {
        mkdirSync(backupDir, { recursive: true })
        // 文件名 `auto.<ts>-<ms>.bak`：
        // - `auto.` 前缀让 cleanupOldBackups(backupDir, 'auto', n) 能匹配到这批文件，
        //   避免 auto 备份绕开保留策略无限累积磁盘
        // - 追加毫秒：formatTimestamp 只到秒，同一秒内二次恢复会让 renameSync 静默覆盖
        //   前一份 auto 备份（那是"撤销恢复"的唯一凭据）
        const ms = now.getUTCMilliseconds().toString().padStart(3, '0')
        autoBackup = join(backupDir, `${AUTO_BACKUP_PREFIX}.${formatTimestamp(now)}-${ms}${BACKUP_FILE_EXTENSION}`)
        // 一致性快照必须包含 WAL 中未 checkpoint 的数据：复用 backup.ts 的同步快照助手
        // （`VACUUM INTO` + `.tmp` → fsync → rename；裸复制主库会得到空库）
        try {
            createSnapshotSync(to, autoBackup)
        } catch (error) {
            throw new Error(
                `覆盖前自动备份失败（目标库无法生成一致性快照）：${(error as Error).message}；`
                + '若目标库已损坏，请先人工移走损坏文件（含 -wal / -shm），再用 --skip-auto-backup 重试',
            )
        }
        cleanupOldBackups(backupDir, AUTO_BACKUP_PREFIX, retentionCount)
    } else {
        // 目标库不存在或为空：仍需保证父目录存在，否则 copyFileSync 会失败
        mkdirSync(dirname(to), { recursive: true })
    }

    // 3. 恢复（copyFileSync 单次系统调用，无需额外 fsync）
    copyFileSync(from, to)

    // 4. 清理属于旧数据库的旁文件（陈旧 WAL / journal 回放会污染刚恢复的主库）
    const removedSidecars: string[] = []
    for (const suffix of SIDECAR_SUFFIXES) {
        const sidecar = `${to}${suffix}`
        if (existsSync(sidecar)) {
            unlinkSync(sidecar)
            removedSidecars.push(sidecar)
        }
    }

    // 5. 恢复后自检
    const inspection = inspect(to)
    if (inspection.integrity !== 'ok') {
        throw new Error(`恢复后 integrity_check 未通过：${inspection.integrity}`)
    }

    return { from, to, autoBackup, autoBackupSkipped, removedSidecars, inspection }
}

/** 格式化恢复结果为 CLI 可读输出 */
export const formatRestoreResult = (result: RestoreResult): string => [
    '[RESTORE] 数据库恢复完成',
    `  来源备份:       ${result.from}`,
    `  恢复目标:       ${result.to}`,
    `  覆盖前备份:     ${result.autoBackup ?? (result.autoBackupSkipped ? '(已跳过：--skip-auto-backup，损坏主库已被覆盖且本轮无撤销凭据)' : '(目标库原本不存在，未备份)')}`,
    `  清理旁文件:     ${result.removedSidecars.length > 0 ? result.removedSidecars.join(', ') : '(无)'}`,
    `  integrity_check: ${result.inspection.integrity}`,
    `  schema_version:  ${result.inspection.schemaVersion}`,
    '',
].join('\n')

/** CLI 帮助文本 */
export const RESTORE_HELP_TEXT = `
db-restore：SQLite 数据库命令式恢复

用法：
  pnpm db:restore --from=<backup-file> --yes

参数：
  --from=<path>   必填。备份文件路径（如 data/backups/dependfix.sqlite.2026-09-01T12-00-00.bak）
  --yes           必填。显式确认覆盖当前数据库（双门控之一）
  --to=<path>     可选。恢复目标（默认 DATABASE_PATH env 或 data/dependfix.sqlite）
  --skip-auto-backup  可选。跳过覆盖前自动备份（**仅当目标库已损坏、无法生成快照时**使用）；
                      使用前**必须**人工移走损坏的主库与 -wal / -shm（覆盖后其中的残余数据不可恢复），
                      且该轮没有「撤销恢复」凭据
  --help, -h      显示帮助

安全说明：
  - 覆盖前会把当前数据库自动备份到 data/backups/auto.<timestamp>.bak（保留最近
    BACKUP_RETENTION_COUNT 份，默认 5）；快照为一致性快照（含 WAL 未 checkpoint 数据），
    目标库无法打开时恢复会中止并要求人工处置（或用 --skip-auto-backup）
  - 备份文件先跑 integrity_check，未通过则拒绝恢复
  - 恢复后清理 -wal / -shm / -journal 旁文件并再次自检
`.trim()

/**
 * CLI main（导出便于单测，不在导入时执行）。
 *
 * @returns 进程退出码（0 成功 / 1 参数或恢复失败）
 */
export const main = (
    argv: string[],
    env: NodeJS.ProcessEnv = process.env,
): number => {
    const args = parseRestoreArgs(argv)

    if (args.help) {
        console.log(RESTORE_HELP_TEXT)
        return 0
    }
    if (!args.from) {
        console.error('缺少必填参数 --from=<backup-file>。运行 pnpm db:restore --help 查看用法。')
        return 1
    }
    if (!args.yes) {
        console.error('缺少必填确认参数 --yes（恢复会覆盖当前数据库）。运行 pnpm db:restore --help 查看用法。')
        return 1
    }

    const to = args.to ?? env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH
    try {
        const result = restoreDatabase({ from: args.from, to, skipAutoBackup: args.skipAutoBackup })
        console.log(formatRestoreResult(result))
        return 0
    } catch (error) {
        // 措辞保守：预校验阶段失败时目标库确实未被触碰，但 copyFileSync / 旁文件清理阶段
        // 失败可能留下半恢复状态，必须提示人工核对而不是宣告"未被破坏"
        console.error('恢复未完成：', (error as Error).message)
        console.error('请核对目标库状态；若已被覆盖，可用 data/backups/auto.*.bak 中最新一份撤销本次恢复（--skip-auto-backup 跳过的轮次没有 auto 备份）。')
        return 1
    }
}

/** 仅在直接运行本脚本时执行 CLI（模块导入时不触发） */
const isExecutedAsEntryPoint = (): boolean => {
    const entry = process.argv[1]
    if (!entry) {
        return false
    }
    return import.meta.url === pathToFileURL(entry).href
}

if (isExecutedAsEntryPoint()) {
    process.exit(main(process.argv.slice(2)))
}
