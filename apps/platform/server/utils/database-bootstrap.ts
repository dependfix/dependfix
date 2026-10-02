import { currentDatabaseType, ensureDatabaseInitialized } from '#server/database'

/**
 * 启动期数据库引导核心逻辑（由 `server/plugins/database-bootstrap.ts` 在 Nitro 启动时调用）。
 *
 * 显式初始化 DataSource（含 `DATABASE_MIGRATIONS_RUN=true` 时的 pending migration），尽早完成 schema
 * 就绪并给出明确日志。Nitro 插件不阻塞监听，因此不保证「对外服务前」完成；但因
 * `ensureDatabaseInitialized` 是 single-flight（60+ 处调用共享同一 promise），并发首个请求会复用同一
 * 次初始化，不会重复迁移。
 *
 * 两种运行形态：
 * - 常规：初始化并继续启动；初始化失败仅告警（保持既有功能降级语义，首次请求仍会重试）。
 * - 迁移专用（`DEPENDFIX_MIGRATIONS_ONLY=true`）：初始化完成后退出进程（成功 0 / 失败 1），
 *   供 Docker 一键初始化脚本以一次性容器执行迁移，不常驻服务。
 *
 * 注：`ensureDatabaseInitialized` 自带并发锁（60+ 处调用共享同一 promise），此处提前调用不会
 * 与后续请求初始化重复执行。
 */

interface InitResult {
    isInitialized: boolean
}

export interface BootstrapDeps {
    initialize?: () => Promise<InitResult>
    exit?: (code: number) => void
    log?: (message: string) => void
    error?: (message: string) => void
    /** 覆盖迁移专用模式判定（默认读 `DEPENDFIX_MIGRATIONS_ONLY`）。 */
    migrationsOnly?: boolean
}

/** 返回「schema 是否就绪」；迁移专用模式会先退出进程。 */
export const bootstrapDatabase = async (deps: BootstrapDeps = {}): Promise<boolean> => {
    const initialize = deps.initialize ?? ensureDatabaseInitialized
    const exit = deps.exit ?? ((code: number) => process.exit(code))
    const log = deps.log ?? ((message: string) => console.info(message))
    const error = deps.error ?? ((message: string) => console.error(message))
    const migrationsOnly = deps.migrationsOnly ?? process.env.DEPENDFIX_MIGRATIONS_ONLY === 'true'

    const dataSource = await initialize()
    if (!dataSource.isInitialized) {
        error('[database] 启动期数据库初始化失败：schema 未就绪，请检查 DATABASE_* 配置与迁移日志')
        if (migrationsOnly) {
            exit(1)
        }
        return false
    }

    log(`[database] 启动期初始化完成 (type=${currentDatabaseType()})`)
    if (migrationsOnly) {
        log('[database] DEPENDFIX_MIGRATIONS_ONLY=true：数据库初始化完成，退出进程')
        exit(0)
    }
    return true
}
