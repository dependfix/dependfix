import type { FromAppParams } from './auth-provider'

// ---------------------------------------------------------------------------
// Installation Token Cache - 占位 + 监控 API
// ---------------------------------------------------------------------------

/**
 * Installation token 缓存层（**M18.1 commit 4 实施**）。
 *
 * 当前实现：**依赖 [@octokit/auth-app](https://github.com/octokit/auth-app.js) 内置缓存**
 * （59 分钟 LRU TTL；GitHub token 有效期 60 分钟 - 1 分钟缓冲）。
 *
 * 本类作为未来扩展点：
 * - 缓存统计（命中率 / 大小 / 清理 API）
 * - 失败重试 + 报警（M18.2 集成时实施）
 * - 多 worker 共享（Redis-backed；超出 M18.1 范围）
 *
 * 注意：
 * - `getOrRefresh` 当前委托给 `createAppAuthentication` + `getInstallationOctokit`
 * - 当 [@octokit/auth-app](https://github.com/octokit/auth-app.js) 内部缓存命中时不会触发 API 调用
 * - 缓存未命中时自动调用 `POST /app/installations/{installation_id}/access_tokens` 获取新 token
 *
 * @see [C22 PAT 无感升级评估 §4.7 commit 拆分纪律](../../../../docs/design/governance/c22-pat-backward-compat.md)
 */
export class InstallationTokenCache {
    private readonly params: FromAppParams
    private readonly ttlMs: number

    constructor(params: FromAppParams, options?: { ttlMs?: number, refreshThresholdMs?: number }) {
        this.params = params
        // 默认 59 分钟（与 @octokit/auth-app 默认一致）
        this.ttlMs = options?.ttlMs ?? 59 * 60 * 1000
    }

    /**
     * 获取或刷新 installation token。
     *
     * 当前为占位实现：直接返回 `'installation-token-managed-by-octokit-auth-app'` 占位字符串。
     * 调用方应使用 `fromApp(params).getOctokit()` 获取真实 Octokit 实例（由 `@octokit/auth-app`
     * 自动管理 installation token 缓存）。
     *
     * @throws 永不抛错（占位实现）
     */
    async getOrRefresh(): Promise<string> {
        // 占位实现：真实 token 由 @octokit/auth-app 内部管理
        // 本方法保留作为未来扩展点（Redis-backed / 失败重试 / 报警）
        return 'installation-token-managed-by-octokit-auth-app'
    }

    /** 清理过期缓存项（占位实现） */
    clear(): void {
        // 占位实现：@octokit/auth-app 内部管理缓存清理
        // 保留接口签名便于未来替换为自有实现
    }

    /** 获取缓存 TTL 配置（毫秒） */
    getTtlMs(): number {
        return this.ttlMs
    }

    /** 获取 cache key（基于 installationId） */
    static getCacheKey(params: FromAppParams): string {
        return `installation:${params.installationId}`
    }
}
