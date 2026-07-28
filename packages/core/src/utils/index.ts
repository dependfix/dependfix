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
