#!/usr/bin/env tsx
/**
 * db-doctor：SQLite 数据库自检工具（只读）。
 *
 * 背景（任务登记见 docs/plan/todo.md §M22.3）：2026-09-01 数据清空事故（见经验归档 §五十）
 * 排查时最耗时的一步是"判断数据是被清空、还是从未注入、还是 schema 升级中"——当时靠手敲
 * 一串 PRAGMA + COUNT(*) 拼线索。本工具把那次排查动作固化成一条命令，未来同类事故直接跑。
 *
 * 用法：
 *   pnpm db:doctor                    # TTY 下输出人读报告
 *   pnpm db:doctor --json             # 强制 JSON（机读，便于管道 / CI 断言）
 *   pnpm db:doctor --path=<file>      # 自检指定数据库文件
 *
 * 设计要点：
 * - **只读**：`readonly: true` 打开，绝不写入 / 不创建 WAL —— 事故现场自检不能改变现场
 * - **人读 / 机读双模**（规范见 docs/standards/development.md §5.1.2）：`process.stdout.isTTY`
 *   为真输出格式化文本，非 TTY（管道 / CI）自动输出 JSON；`--json` 可强制
 * - **判定结论**：报告末尾给出可执行结论（全新库 / 数据被清空 / 有删除未 VACUUM / 数据库损坏），
 *   而不是把一堆数字丢给读者自己解释
 *
 * 测试覆盖：apps/platform/server/database/scripts/db-doctor.test.ts
 */
import { existsSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import betterSqlite3, { type Database } from 'better-sqlite3'

/** 默认 SQLite 数据库路径（与 createDataSourceOptions 保持一致） */
const DEFAULT_DATABASE_PATH = 'data/dependfix.sqlite'

/** 自检覆盖的 PRAGMA 列表（顺序即报告输出顺序） */
const PRAGMA_KEYS = [
    'page_count',
    'page_size',
    'freelist_count',
    'journal_mode',
    'auto_vacuum',
    'user_version',
    'schema_version',
    'application_id',
    'wal_autocheckpoint',
    'integrity_check',
] as const

type PragmaKey = typeof PRAGMA_KEYS[number]

/** PRAGMA 采集快照（键集合固定为 PRAGMA_KEYS，新增/删除键时测试 fixture 会同步报错） */
export type PragmaSnapshot = Record<PragmaKey, string | number>

/** CLI 参数解析结果 */
export interface DoctorArgs {
    /** `--path=<file>` 目标数据库（缺省时由 DATABASE_PATH env / 默认值兜底） */
    path?: string
    /** `--json` 强制 JSON 输出（不看 isTTY） */
    json: boolean
    /** `--help` / `-h` */
    help: boolean
}

/** 文件元信息（判断"最后一次写入发生在什么时候"） */
export interface FileMeta {
    path: string
    /** 字节数 */
    size: number
    /** 最后修改时间（ISO 8601） */
    mtime: string
    /** 最后访问时间（ISO 8601） */
    atime: string
    /** 创建时间（ISO 8601；部分文件系统不支持，会等于 mtime 或纪元 0） */
    birthtime: string
}

/** 索引分类计数（TypeORM 自动索引 vs 手工声明索引） */
export interface IndexStats {
    /** SQLite 为 UNIQUE 约束隐式创建的索引（sqlite_autoindex_*） */
    autoIndex: number
    /** TypeORM 生成的索引（IDX_*） */
    typeormIndex: number
    /** 手工 / migration 声明的索引（idx_*） */
    manualIndex: number
    /** 其他命名索引 */
    other: number
    /** 索引总数 */
    total: number
}

/** 单表行数 */
export interface TableCount {
    table: string
    rows: number
    /** 非业务表（SQLite 内部表 / TypeORM migrations 记录表），不参与"全表空"判定 */
    internal: boolean
}

/** 自检报告（JSON 输出即本结构） */
export interface DoctorReport {
    file: FileMeta
    pragmas: PragmaSnapshot
    tables: TableCount[]
    indexes: IndexStats
    /** 判定结论（可能多条；无异常时含 1 条正常结论） */
    verdicts: string[]
}

/**
 * 解析 CLI 参数（纯函数，便于单测）。
 * 与 db-restore 保持一致：只接受 `--key=value` 与布尔 flag，不支持空格分隔。
 */
export const parseDoctorArgs = (argv: string[]): DoctorArgs => {
    const args: DoctorArgs = { json: false, help: false }
    for (const arg of argv) {
        if (arg === '--json') {
            args.json = true
        } else if (arg === '--help' || arg === '-h') {
            args.help = true
        } else if (arg.startsWith('--path=')) {
            args.path = arg.slice('--path='.length)
        }
    }
    return args
}

/** 采集文件元信息 */
export const collectFileMeta = (dbPath: string): FileMeta => {
    const stat = statSync(dbPath)
    return {
        path: dbPath,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        atime: stat.atime.toISOString(),
        birthtime: stat.birthtime.toISOString(),
    }
}

/** 采集 PRAGMA 全套（`integrity_check` 可能返回多行，统一折叠为单个字符串） */
export const collectPragmas = (db: Database): PragmaSnapshot => {
    const pragmas = {} as PragmaSnapshot
    for (const key of PRAGMA_KEYS) {
        const value: unknown = db.pragma(key, { simple: true })
        pragmas[key] = typeof value === 'number' ? value : String(value)
    }
    return pragmas
}

/** 判定是否为非业务表（不参与"全表空"结论） */
export const isInternalTable = (name: string): boolean =>
    // sqlite_* 是 SQLite 内部表；migrations 是 TypeORM 迁移记录表 —— 两者在数据被清空后
    // 依然有行，若计入业务行数会把"业务表全空"误判成"数据正常"（事故现场实测踩到）
    name.startsWith('sqlite_') || name === 'migrations'

/**
 * 采集各表行数。
 *
 * 表名来自 `sqlite_master`，只能拼接进 SQL（SQLite 不支持表名参数化）；
 * 用双引号包裹并转义内部双引号，杜绝来自表名的注入。
 */
export const collectTableCounts = (db: Database): TableCount[] => {
    const rows = db
        .prepare('SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name')
        .all() as { name: string }[]

    return rows.map(({ name }) => {
        const quoted = `"${name.replace(/"/g, '""')}"`
        const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get() as { count: number }
        return {
            table: name,
            rows: countRow.count,
            internal: isInternalTable(name),
        }
    })
}

/** 采集索引分类计数 */
export const collectIndexStats = (db: Database): IndexStats => {
    const rows = db
        .prepare('SELECT name FROM sqlite_master WHERE type = \'index\'')
        .all() as { name: string }[]

    const stats: IndexStats = {
        autoIndex: 0,
        typeormIndex: 0,
        manualIndex: 0,
        other: 0,
        total: rows.length,
    }
    for (const { name } of rows) {
        if (name.startsWith('sqlite_autoindex')) {
            stats.autoIndex++
        } else if (name.startsWith('IDX_')) {
            stats.typeormIndex++
        } else if (name.startsWith('idx_')) {
            stats.manualIndex++
        } else {
            stats.other++
        }
    }
    return stats
}

/**
 * 根据 PRAGMA + 表行数给出判定结论（纯函数，便于单测各种组合）。
 *
 * 判定顺序即严重程度顺序：损坏 > 数据状态 > 空间回收提示。
 * "全表空"只看业务表（排除 `sqlite_*` 与 TypeORM `migrations`），否则这些表有行会掩盖清空事实。
 */
export const diagnose = (
    pragmas: PragmaSnapshot,
    tables: TableCount[],
): string[] => {
    const verdicts: string[] = []
    const businessTables = tables.filter((t) => !t.internal)
    const totalRows = businessTables.reduce((sum, t) => sum + t.rows, 0)
    const schemaVersion = Number(pragmas.schema_version)
    const freelistCount = Number(pragmas.freelist_count)

    if (pragmas.integrity_check !== 'ok') {
        verdicts.push(`数据库损坏：integrity_check = ${pragmas.integrity_check}（立即用 pnpm db:restore 从备份恢复）`)
    }

    if (businessTables.length === 0) {
        verdicts.push('无业务表：schema 从未建立（全新数据库文件，或建表前被清空）')
    } else if (totalRows === 0) {
        if (schemaVersion === 0) {
            verdicts.push('全新数据库：schema_version = 0 且业务表全空（首次启动的正常状态）')
        } else {
            verdicts.push(`数据被清空或从未注入：schema_version = ${schemaVersion}（schema 已建立）但 ${businessTables.length} 张业务表全空`)
        }
    } else {
        verdicts.push(`数据正常：${businessTables.length} 张业务表共 ${totalRows} 行`)
    }

    if (freelistCount > 0) {
        verdicts.push(`有数据被删除但未回收：freelist_count = ${freelistCount}（${freelistCount} 个空闲页，VACUUM 可回收）`)
    }

    return verdicts
}

/**
 * 生成完整自检报告（只读打开数据库）。
 *
 * @param dbPath 数据库文件路径（必须存在）
 */
export const buildReport = (dbPath: string): DoctorReport => {
    if (!existsSync(dbPath)) {
        throw new Error(`数据库文件不存在：${dbPath}`)
    }
    const file = collectFileMeta(dbPath)
    // readonly + fileMustExist：自检绝不创建文件、不建 WAL、不改变事故现场
    const db = betterSqlite3(dbPath, { readonly: true, fileMustExist: true })
    try {
        const pragmas = collectPragmas(db)
        const tables = collectTableCounts(db)
        const indexes = collectIndexStats(db)
        return { file, pragmas, tables, indexes, verdicts: diagnose(pragmas, tables) }
    } finally {
        db.close()
    }
}

/** 人读格式化（TTY 模式） */
export const formatHumanReport = (report: DoctorReport): string => {
    const lines: string[] = [
        '[DOCTOR] SQLite 数据库自检',
        '',
        '文件',
        `  路径:           ${report.file.path}`,
        `  大小:           ${report.file.size} bytes`,
        `  最后修改:       ${report.file.mtime}`,
        `  最后访问:       ${report.file.atime}`,
        `  创建时间:       ${report.file.birthtime}`,
        '',
        'PRAGMA',
    ]
    for (const key of PRAGMA_KEYS) {
        lines.push(`  ${key.padEnd(20)}${report.pragmas[key]}`)
    }

    lines.push('', `各表行数（${report.tables.length} 张表）`)
    if (report.tables.length === 0) {
        lines.push('  (无表)')
    }
    for (const t of report.tables) {
        lines.push(`  ${t.table.padEnd(36)}${String(t.rows).padStart(8)}${t.internal ? '  (内部表)' : ''}`)
    }

    lines.push(
        '',
        `索引（共 ${report.indexes.total}）`,
        `  sqlite_autoindex_*:  ${report.indexes.autoIndex}`,
        `  IDX_*（TypeORM）:    ${report.indexes.typeormIndex}`,
        `  idx_*（手工声明）:   ${report.indexes.manualIndex}`,
        `  其他:                ${report.indexes.other}`,
        '',
        '结论',
    )
    for (const verdict of report.verdicts) {
        lines.push(`  - ${verdict}`)
    }
    lines.push('')
    return lines.join('\n')
}

/** CLI 帮助文本 */
export const DOCTOR_HELP_TEXT = `
db-doctor：SQLite 数据库自检（只读，不修改数据库）

用法：
  pnpm db:doctor                 自检默认数据库（DATABASE_PATH env 或 data/dependfix.sqlite）
  pnpm db:doctor --json          强制 JSON 输出（机读；非 TTY 环境自动启用）
  pnpm db:doctor --path=<file>   自检指定数据库文件

输出：
  文件元信息（size / mtime / atime / birth time）+ PRAGMA 全套 + 各表行数 + 索引分类计数，
  末尾给出结论：全新数据库 / 数据被清空 / 有删除未 VACUUM / 数据库损坏
`.trim()

/**
 * CLI main（导出便于单测，不在导入时执行）。
 *
 * @param argv `process.argv.slice(2)`
 * @param env 环境变量（注入便于单测）
 * @param isTTY stdout 是否为 TTY（注入便于单测双模输出）
 * @returns 进程退出码（0 正常 / 1 参数或自检失败）
 */
export const main = (
    argv: string[],
    env: NodeJS.ProcessEnv = process.env,
    isTTY: boolean = Boolean(process.stdout.isTTY),
): number => {
    const args = parseDoctorArgs(argv)

    if (args.help) {
        console.log(DOCTOR_HELP_TEXT)
        return 0
    }

    const dbPath = args.path ?? env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH
    let report: DoctorReport
    try {
        report = buildReport(dbPath)
    } catch (error) {
        console.error('自检失败：', (error as Error).message)
        return 1
    }

    // 人读 / 机读双模：TTY 输出格式化文本，管道 / CI 输出 JSON；--json 强制机读
    console.log(args.json || !isTTY
        ? JSON.stringify(report, null, 2)
        : formatHumanReport(report))
    return 0
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
