#!/usr/bin/env tsx
/**
 * db-init：数据库一键初始化（幂等）。
 *
 * 用途：全新部署 / 空库的「一条命令建库」入口，等价于 `pnpm db:migrate`（执行全部 pending
 * migration，基线迁移会从实体元数据建全部基础表），并额外打印初始化摘要（业务表数量 +
 * 迁移计数），便于部署脚本判定成功。
 *
 * 与 `db:migrate` 的关系：二者共用同一 DataSource 配置（`createMigrateDataSource`，强制
 * `synchronize=false` + `migrationsRun=false`，不受 `DATABASE_*` 开关影响）与迁移执行逻辑；
 * `db:init` 面向「首次初始化」语义，可安全重复执行。
 *
 * 用法：
 *   pnpm db:init            # 执行全部 pending migration 并打印摘要（幂等）
 *   pnpm db:init --help     # 显示帮助
 *
 * Docker 场景：compose 默认 `DATABASE_MIGRATIONS_RUN=true` 会在启动时自动迁移，通常无需手动
 * 初始化；需要显式初始化时用 `apps/platform/docker/init-db.sh`（一次性容器执行本逻辑）。
 */

import 'reflect-metadata'
import { pathToFileURL } from 'node:url'
import type { DataSource } from 'typeorm'
import { applyPendingMigrations, createMigrateDataSource } from './db-migrate'

/** 依赖注入点（测试用；生产走默认实现） */
export interface InitDeps {
    createDataSource?: () => DataSource
}

/** 初始化摘要 */
export interface InitSummary {
    /** 本次实际执行的迁移名 */
    applied: string[]
    /** SQLite 下的业务表名（非 SQLite 返回空数组） */
    businessTables: string[]
}

/** SQLite 下采集业务表（排除 `sqlite_*` 内部表与 TypeORM `migrations` 记录表） */
export const listBusinessTables = async (ds: DataSource): Promise<string[]> => {
    if (ds.options.type !== 'better-sqlite3') {
        return []
    }
    const rows = await ds.query(`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name != 'migrations'
        ORDER BY name
    `) as { name: string }[]
    return rows.map((row) => row.name)
}

/** 格式化初始化摘要（纯函数，便于单测） */
export const formatInitResult = (summary: InitSummary): string => {
    const lines = [
        '[INIT] 数据库初始化完成',
        `  本次执行迁移: ${summary.applied.length} 条`,
    ]
    for (const name of summary.applied) {
        lines.push(`    [X] ${name}`)
    }
    if (summary.applied.length === 0) {
        lines.push('    (无待执行迁移，schema 已是最新)')
    }
    if (summary.businessTables.length > 0) {
        lines.push(`  业务表: ${summary.businessTables.length} 张`)
    }
    lines.push('')
    return lines.join('\n')
}

/** CLI 帮助文本 */
export const INIT_HELP_TEXT = `
db-init：数据库一键初始化（幂等）

用法：
  pnpm db:init            执行全部 pending migration 并打印初始化摘要
  pnpm db:init --help     显示帮助

说明：
  - 复用 createMigrateDataSource 连接配置（DATABASE_* 环境变量），强制 synchronize=false +
    migrationsRun=false，不受 DATABASE_MIGRATIONS_RUN / DATABASE_SYNCHRONIZE 影响
  - 全新空库会由基线迁移创建全部基础表；存量库仅补 pending（已记录迁移不重跑）
  - 可安全重复执行；回退见 pnpm db:migrate:revert -- --yes，自检见 pnpm db:doctor
`.trim()

/**
 * CLI main（导出便于单测，不在导入时执行）。
 *
 * @param argv `process.argv.slice(2)`
 * @param deps 依赖注入点（测试用）
 * @returns 进程退出码（0 成功 / 1 迁移失败）
 */
export const main = async (
    argv: string[],
    deps: InitDeps = {},
): Promise<number> => {
    if (argv.includes('--help') || argv.includes('-h')) {
        console.log(INIT_HELP_TEXT)
        return 0
    }

    const createDataSource = deps.createDataSource ?? createMigrateDataSource
    const ds = createDataSource()
    try {
        await ds.initialize()
        const applied = await applyPendingMigrations(ds)
        const businessTables = await listBusinessTables(ds)
        console.log(formatInitResult({ applied, businessTables }))
        return 0
    } catch (error) {
        console.error('数据库初始化未完成：', (error as Error).message)
        return 1
    } finally {
        if (ds.isInitialized) {
            await ds.destroy()
        }
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
    void main(process.argv.slice(2)).then((code) => process.exit(code))
}
