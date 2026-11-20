/**
 * 统一敏感信息脱敏工具（App 与 server 共享，故位于 `shared/`）。
 *
 * 合并 container-executor.ts 的 sanitizeErrorMessage 与 logger.ts 的 sanitizeLogData，
 * 消除重复实现，确保脱敏规则单一事实源。`server/utils/sanitize.ts` 仅做再导出，
 * 既有 `#server/utils/sanitize` 导入面保持不变。
 *
 * 脱敏规则：
 * - URL 内嵌凭据（任意 scheme：http/https/postgres/redis/mysql/amqp…）：
 *   `postgres://user:pass@host/db` → `postgres://***@host/db`
 * - Authorization 头：`Authorization: <scheme> <token>` → `Authorization: <scheme> ***`
 * - 敏感键赋值：`password=…` / `_authToken=…` / `?access_token=…` / `"token": "…"` → 值 `***`
 * - GitHub token 前缀：`ghp_` / `gho_` / `ghu_` / `ghs_` / `ghr_` / `github_pat_` → `***`
 * - dependfix API key 前缀：`dfk_` → `dfk_***`
 * - 敏感字段名：password / passwd / secret / token / credential / api-key / private-key /
 *   connection-string / access-key → `***`
 * - `Error` 实例：展开为 `{ name, message, stack, code?, cause? }`（字段各自脱敏）
 *
 * Error 分支的必要性：`Error` 的 `message` / `stack` 是**非可枚举**属性，`Object.entries()`
 * 只能拿到空对象——不展开会让「记了错误对象」的日志只剩下 `{}`，栈与根因全部丢失。
 */

/** 字符串脱敏（核心规则） */
export function sanitizeString(message: string): string {
    return message
        // 任意 scheme 的 URL 内嵌凭据（保留 scheme，便于定位来源）
        .replace(/([a-z][a-z\d+.-]*:\/\/)[^/@\s]+@/gi, '$1***@')
        .replace(/(Authorization:\s+(?:basic|token|bearer)\s+)\S+/gi, '$1***')
        // 敏感键名赋值（JSON / query / env 文本）：保留键名，值整体替换
        .replace(/(["']?(?:password|passwd|secret|token|api[-_]?key|credential|access[-_]?token|_authtoken)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1***')
        .replace(/(github_pat_|gh[pousr]_|dfk_)[\w-]+/g, '$1***')
        // PEM 私钥块（多行）整体替换，避免只遮住首行后正文仍落盘
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-private-key]')
}

/**
 * 绝对路径归一（设计稿 §6.2 / §6.4）：工作目录 / 内部路径不进入 v1 响应与日志聚合正文。
 * 前缀必须有右边界，避免把 `/application`、`/homepage` 误判为 `/app`、`/home`。
 */
const ABSOLUTE_PATH_PATTERN = /(?:\/(?:root|home|app|tmp|var|usr))(?![A-Za-z0-9_.-])(?:\/[^\s"'`()<>,;]*)?/g

export function redactAbsolutePaths(value: string): string {
    return value.replace(ABSOLUTE_PATH_PATTERN, '<path>')
}

/** 敏感字段名（维度内 OR：命中任一即整体替换为 `***`）。 */
const SENSITIVE_KEY_PATTERN = /token|secret|passw|authorization|credential|api[-_]?key|private[-_]?key|connection[-_]?string|access[-_]?key/i

/** 循环引用占位符（日志上下文可能引用自身 / 形成环，脱敏不能因此爆栈）。 */
export const CIRCULAR_PLACEHOLDER = '[Circular]'

/**
 * 深度脱敏（支持字符串、数组、对象、Error 递归处理）。
 * 对象的 key 匹配敏感字段名时，value 替换为 `***`；循环引用替换为 `[Circular]`。
 */
export function sanitizeDeep(data: unknown): unknown {
    return sanitizeValue(data, new WeakSet<object>())
}

function sanitizeValue(data: unknown, seen: WeakSet<object>): unknown {
    if (typeof data === 'string') {
        return sanitizeString(data)
    }
    if (data instanceof Error) {
        // 环保护：`error.cause = error` / 互为 cause 的环不得递归爆栈
        if (seen.has(data)) {
            return CIRCULAR_PLACEHOLDER
        }
        seen.add(data)
        try {
            // 保留排障必需的附加字段（code / cause），字段值同样递归脱敏；
            // 属性访问可能是抛错 getter，整块兜底为不可序列化占位
            const details = data as Error & { code?: unknown, cause?: unknown }
            return {
                name: data.name,
                message: sanitizeString(data.message),
                ...(data.stack ? { stack: sanitizeString(data.stack) } : {}),
                ...(details.code === undefined ? {} : { code: sanitizeValue(details.code, seen) }),
                ...(details.cause === undefined ? {} : { cause: sanitizeValue(details.cause, seen) }),
            }
        } catch {
            return { name: 'Error', message: '[unserializable]' }
        } finally {
            seen.delete(data)
        }
    }
    if (Array.isArray(data)) {
        if (seen.has(data)) {
            return CIRCULAR_PLACEHOLDER
        }
        seen.add(data)
        try {
            return data.map((item) => sanitizeValue(item, seen))
        } finally {
            seen.delete(data)
        }
    }
    if (data && typeof data === 'object') {
        if (seen.has(data)) {
            return CIRCULAR_PLACEHOLDER
        }
        seen.add(data)
        try {
            let keys: string[]
            try {
                // Object.keys 不触发 getter；逐字段取值放进 try，让单个抛错 getter 只降级该字段
                keys = Object.keys(data as Record<string, unknown>)
            } catch {
                return '[unserializable]'
            }
            const result: Record<string, unknown> = {}
            for (const key of keys) {
                if (SENSITIVE_KEY_PATTERN.test(key)) {
                    result[key] = '***'
                    continue
                }
                try {
                    result[key] = sanitizeValue((data as Record<string, unknown>)[key], seen)
                } catch {
                    // 抛错 getter / Proxy：单字段降级，不拖垮整条日志
                    result[key] = '[unserializable]'
                }
            }
            return result
        } finally {
            seen.delete(data)
        }
    }
    return data
}
