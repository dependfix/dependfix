/**
 * Installation token 缓存层（**M18.1 commit 4 完整实施**；当前为占位 stub）。
 *
 * 当前状态：仅声明接口骨架，未实现具体缓存逻辑。
 *
 * 完整实施范围：
 * - worker 内存 1h 滑窗缓存
 * - 提前 5min 刷新（installation token TTL = 1h）
 * - 失败重试 + 报警
 * - 扩展 [`packages/engine/src/github/token-scope.ts`](../github/token-scope.ts) 增加 App installation token 探测
 *
 * @example
 * ```typescript
 * // M18.1 commit 4 实施后使用
 * const cache = new InstallationTokenCache({ ttlMs: 3_600_000, refreshThresholdMs: 300_000 })
 * const token = await cache.getOrRefresh({ appId, privateKey, installationId })
 * ```
 */
export class InstallationTokenCache {
    constructor(_options?: { ttlMs?: number, refreshThresholdMs?: number }) {
        throw new Error(
            'InstallationTokenCache: not implemented yet (M18.1 commit 4 实施；当前为占位 stub)',
        )
    }

    async getOrRefresh(_params: {
        appId: string
        privateKey: string
        installationId: string
    }): Promise<string> {
        throw new Error('InstallationTokenCache.getOrRefresh: not implemented yet')
    }

    /** 清理过期缓存项（用于测试 + 进程关闭时的 graceful shutdown） */
    clear(): void {
        throw new Error('InstallationTokenCache.clear: not implemented yet')
    }
}
