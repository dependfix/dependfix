export function compactRecord<T>(value: Record<string, T | undefined>): Record<string, T> {
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, T] => entry[1] !== undefined),
    )
}

export function ensureArray<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value]
}

const REPO_IDENTIFIER_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

/** 检查仓库标识是否为合法的 owner/repo 格式，仅做格式初步校验，实际合法性由 GitHub API 返回 */
export function isValidRepoIdentifier(repo: string): boolean {
    return REPO_IDENTIFIER_RE.test(repo)
}

/**
 * 将任意值转换为可读的错误消息，避免 `String(obj)` 产生 `[object Object]`：
 * - `Error` → `message`
 * - `string` → 原样
 * - 其他可序列化值 → JSON 字符串
 * - 不可序列化（循环引用 / undefined / 函数 / Symbol）→ 类型描述兜底
 *
 * 注意：本函数用于错误路径，内部必须保证不抛异常。
 */
export function toErrorMessage(value: unknown): string {
    if (value instanceof Error) {
        return value.message
    }
    if (typeof value === 'string') {
        return value
    }
    try {
        const serialized = JSON.stringify(value)
        if (typeof serialized === 'string') {
            return serialized
        }
    } catch {
        // 循环引用等不可序列化场景，走兜底
    }
    return typeof value === 'undefined' ? 'undefined' : Object.prototype.toString.call(value)
}
