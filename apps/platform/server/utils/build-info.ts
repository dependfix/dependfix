/**
 * 部署产物版本戳（构建期注入 + 运行时读取）。
 *
 * 链路：CI 构建镜像时 `--build-arg BUILD_COMMIT/BUILD_VERSION` → Dockerfile `ENV NUXT_BUILD_COMMIT/NUXT_BUILD_VERSION`
 * → Nuxt 以 `NUXT_` 前缀在运行时覆盖 `runtimeConfig.buildVersion/buildCommit`（构建期未注入时缺省 unknown）。
 * 用途：运行时确认部署产物对应的 commit / 版本，消除「代码已修复但线上仍复现」的陈旧产物误判。
 * 口径见 docs/standards/platform.md §10.7 / §11。
 */

/** 构建期未注入 / 非法值时的缺省标记（不阻断启动） */
export const UNKNOWN_BUILD_VALUE = 'unknown'

export interface BuildInfo {
    version: string
    commit: string
}

/** runtimeConfig 中承载构建期注入值的字段（缺失 / 非法 / 空串回退 unknown） */
export interface BuildInfoConfig {
    buildVersion?: unknown
    buildCommit?: unknown
}

const normalize = (value: unknown): string => {
    if (typeof value !== 'string') {
        return UNKNOWN_BUILD_VALUE
    }
    const trimmed = value.trim()
    return trimmed === '' ? UNKNOWN_BUILD_VALUE : trimmed
}

/** 归一化部署产物版本戳：非字符串 / 空串 / 仅空白 一律回退 unknown */
export const resolveBuildInfo = (config: BuildInfoConfig): BuildInfo => ({
    version: normalize(config.buildVersion),
    commit: normalize(config.buildCommit),
})

/**
 * 服务器启动时间（由进程 uptime 反推，ISO 8601）。
 *
 * 不用模块级常量：Nitro 拆包可能让 endpoint 与 plugin 各自持有一份模块单例，
 * 以 `process.uptime()` 反推可保证任意请求读到同一进程启动时刻。
 */
export const resolveStartedAt = (
    nowMs: number = Date.now(),
    uptimeSeconds: number = process.uptime(),
): string => new Date(nowMs - uptimeSeconds * 1000).toISOString()

/** 启动日志行（stdout）：便于 `docker logs` 直接核对运行态产物 */
export const formatBuildInfoLine = (info: BuildInfo, startedAt: string): string =>
    `[build] version=${info.version} commit=${info.commit} startedAt=${startedAt}`
