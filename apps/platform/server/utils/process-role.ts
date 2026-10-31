/**
 * 进程角色判定（容器入口的队列执行进程隔离形态）。
 *
 * 契约与 HTTP-only 插件清单见 docs/standards/platform.md §10.6；入口注入点见 `docker/entrypoint.sh`。
 *
 * 为什么需要独立信号：双进程形态下 worker 子进程与单进程形态的 `IN_PROCESS_WORKER` 都是 true
 * （唯一为 false 的是 HTTP 主进程，语义恰好相反），因此「本进程是否消费队列」**不能**用作角色判据。
 *
 * 判定口径：
 * - `DEPENDFIX_ROLE=worker` → 独立队列 worker 进程（跳过 HTTP-only 插件）
 * - `DEPENDFIX_ROLE=server` / 未设置 / 空串 → 非 worker（保持既有行为；单进程与本地直连形态属此列）
 * - 其它值 → 按非 worker 处理并告警（fail-safe：配置错误时宁可多跑一次幂等清理，也不静默停用孤儿清理）
 */

/** 角色环境变量名（容器内部变量，由入口注入，一般无需手工设置）。 */
export const PROCESS_ROLE_ENV = 'DEPENDFIX_ROLE'

/** 进程角色。 */
export type ProcessRole = 'server' | 'worker'

/**
 * HTTP-only 插件清单（worker 进程跳过）：判定与理由见 docs/standards/platform.md §10.6。
 * 清单为单一事实源——跳过日志、守卫调用与单测一致性用例共用。
 */
export const HTTP_ONLY_PLUGINS = ['stale-cleanup', 'build-info', 'weekly-digest'] as const

export type HttpOnlyPluginName = (typeof HTTP_ONLY_PLUGINS)[number]

/**
 * 非 HTTP-only 插件（两进程共用，worker **不**跳过）：`database-bootstrap` 提供两进程都需要的
 * 数据源引导（迁移唯一执行者已由 `DATABASE_MIGRATIONS_RUN` 隔离）；`queue-consumer` 在
 * `inProcessWorker=true` 时初始化队列消费者（worker 侧的消费端唯一启动点，HTTP 主进程为 no-op）；
 * `resource-probe` 在 worker 侧同样需要输出执行面内存 / 并发信号；`logger` 在 worker 侧同样需要
 * 安装致命错误钩子与启动行（worker 崩溃信息必须能落到错误文件）。判定理由见 platform.md §10.6。
 * 与 `HTTP_ONLY_PLUGINS` 一起构成「插件目录内每个 nitro 插件都已分类」的机检面。
 */
export const NON_HTTP_ONLY_PLUGINS = ['database-bootstrap', 'queue-consumer', 'resource-probe', 'logger'] as const

/** 可注入的日志接口（默认 console；单测注入捕获器）。 */
export interface ProcessRoleLog {
    info: (message: string) => void
    warn: (message: string) => void
}

/** 角色值归一化（去首尾空白 + 小写）。 */
const normalizeRoleValue = (raw: string | undefined): string => (raw ?? '').trim().toLowerCase()

/** 解析角色值：仅 `worker` 判为 worker，其余（含未设置 / 未识别）一律 server。 */
export const parseProcessRole = (raw: string | undefined): ProcessRole =>
    normalizeRoleValue(raw) === 'worker' ? 'worker' : 'server'

/** 未识别的角色值（未设置 / 空串 / server / worker → null），供调用方告警。 */
export const unknownProcessRoleValue = (raw: string | undefined): string | null => {
    const value = (raw ?? '').trim()
    if (!value) {
        return null
    }
    const normalized = value.toLowerCase()
    return normalized === 'server' || normalized === 'worker' ? null : value
}

/** 本进程是否为独立队列 worker 进程。 */
export const isQueueWorkerProcess = (env: NodeJS.ProcessEnv = process.env): boolean =>
    parseProcessRole(env[PROCESS_ROLE_ENV]) === 'worker'

/**
 * 本进程是否应跳过指定 HTTP-only 插件；返回 true 时调用方须立即 return。
 * 输出两处可观测信号：命中跳过 → 一行 info 跳过日志；角色值未识别 → 一行 warn（按 server 处理）。
 */
export const shouldSkipHttpOnlyPlugin = (
    name: HttpOnlyPluginName,
    env: NodeJS.ProcessEnv = process.env,
    log: ProcessRoleLog = console,
): boolean => {
    const unknown = unknownProcessRoleValue(env[PROCESS_ROLE_ENV])
    if (unknown) {
        // JSON.stringify 防止含换行的取值伪造日志行
        log.warn(
            `[${name}] 未识别的 ${PROCESS_ROLE_ENV}=${JSON.stringify(unknown)}（仅支持 server / worker）——按 server 处理，不跳过本插件`,
        )
    }
    if (!isQueueWorkerProcess(env)) {
        return false
    }
    log.info(`[${name}] 进程角色 worker：跳过 HTTP-only 插件（由 HTTP 主进程承担）`)
    return true
}
