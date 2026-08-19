import { LRUCache } from 'lru-cache'

/**
 * 带 TTL + 并发去重的进程内缓存工具（docs/plan/todo.md §PR3 D3'' 修订）。
 *
 * 背景：批量导入对话框每次打开都重新调 GitHub API 拉仓库列表，对 org 凭据覆盖
 * 100+ 仓库场景既慢又耗 GitHub API 配额。GitHub 仓库列表短期变化小（用户新建
 * 仓库罕见），加 5 min TTL 缓存可显著降低调用次数。
 *
 * 设计：
 * - 进程内 LRU（max=64）；不同 credentialId × affiliation 组合上限自动淘汰
 * - TTL 由调用方传入（不固定在 cache 构造，便于不同业务用不同 TTL）
 * - 并发去重：同 key in-flight 时复用同一 Promise（防 thundering herd）
 * - 失败时不写缓存（下次重新拉）；loader throw 时错误正常向上抛
 * - 提供 `?fresh=true` 强制刷新（跳过读取但仍写回新值）
 *
 * 演进参考：[momei/server/database/storage.ts](../../../momei/server/database/storage.ts)
 * 已用 `lru-cache` + 可选 `ioredis` 双形态（BaseStorage 接口 + REDIS_URL 探测降级）。
 * 当前依赖 `lru-cache@^11.5.2`（已在 platform dependencies）；平台部署多实例 / 高
 * QPS 需求时可迁移至 momei 模式（增加 BaseStorage 接口 + Redis URL env 探测）。
 *
 * 单测覆盖：server/utils/repos-cache.test.ts（与源码同目录；hit / miss / in-flight 并发去重
 * / expiry / fresh 五路径）。
 */

/**
 * 缓存条目（含过期时间戳）。
 * 注意：value 与 loader 返回类型一致（泛型 T 由调用方推导）。
 */
interface CacheEntry<T> {
    data: T
    /** 过期时间（ms epoch）；load 时设为 `Date.now() + ttlMs` */
    expiresAt: number
}

/**
 * 并发去重：同 key 第一次请求期间，后续请求复用同一 Promise，避免重复调 loader。
 * key 与下方 cache 共用同一 namespace。
 */
const inflight = new Map<string, Promise<CacheEntry<unknown>>>()

/**
 * LRU 缓存（max=64 条目）。
 * TTL 在 set 时动态传入（见 cachedFetch 的 set 行为），不在此处固定。
 */
const cache = new LRUCache<string, CacheEntry<unknown>>({
    max: 64,
})

export interface CachedFetchOptions {
    /** 强制刷新：跳过 cache 读取但仍写回新值；用于「手动刷新」按钮 */
    fresh?: boolean
}

export interface CachedFetchResult<T> {
    value: T
    /** 实际写入缓存的时间（成功完成 loader 的时刻） */
    cachedAt: Date
    /** true=命中缓存（fresh=true 强制刷新也视为 fromCache=false） */
    fromCache: boolean
}

/**
 * 带 TTL + 并发去重的缓存加载。
 *
 * @param key 缓存 key（调用方决定 namespace，例如 `${credentialId}:${affiliation}`）
 * @param ttlMs 过期时间（毫秒）
 * @param loader 未命中 / 过期 / fresh 时调用的加载函数
 * @param options.fresh 强制刷新（跳过 cache 读取但仍写回）
 * @returns `{ value, cachedAt, fromCache }`
 *
 * 错误语义：loader throw 时错误向上抛，缓存不被写入，inflight 释放。
 * 后续请求会重新发起 loader（不会无限复用失败的 Promise）。
 */
export async function cachedFetch<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    options?: CachedFetchOptions,
): Promise<CachedFetchResult<T>> {
    const now = Date.now()

    // 命中路径：cache 有效且非 fresh 模式
    if (!options?.fresh) {
        const entry = cache.get(key) as CacheEntry<T> | undefined
        if (entry && entry.expiresAt > now) {
            return {
                value: entry.data,
                cachedAt: new Date(entry.expiresAt - ttlMs),
                fromCache: true,
            }
        }
    }

    // 并发去重：已有 in-flight 复用（不论对方成功还是失败，await 后再判断）
    const existing = inflight.get(key) as Promise<CacheEntry<T>> | undefined
    if (existing) {
        const entry = await existing
        return {
            value: entry.data,
            cachedAt: new Date(entry.expiresAt - ttlMs),
            fromCache: true,
        }
    }

    // 未命中且无 in-flight：发起 loader，写回缓存
    const promise = (async (): Promise<CacheEntry<T>> => {
        try {
            const data = await loader()
            const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs }
            cache.set(key, entry as CacheEntry<unknown>)
            return entry
        } finally {
            // 不论成功失败都释放 in-flight（失败时 cache 未写入，下次重新拉）
            inflight.delete(key)
        }
    })()

    inflight.set(key, promise as Promise<CacheEntry<unknown>>)
    const entry = await promise
    return {
        value: entry.data,
        cachedAt: new Date(entry.expiresAt - ttlMs),
        fromCache: false,
    }
}

/** 测试用：清空全部缓存 + inflight（仅在 vitest 单测中调用） */
export const __resetReposCacheForTesting = (): void => {
    cache.clear()
    inflight.clear()
}
