/**
 * 批量导入对话框四维过滤谓词（纯函数，供单测覆盖）。
 *
 * 过滤维度：
 * 1. fork：`source` 排除 fork / `all` 全部
 * 2. visibility：`all` / `public` / `private`
 * 3. archived/disabled：`exclude` 排除只读仓库 / `include` 全部
 * 4. keyword：fullName + description 模糊搜索
 */

export interface FilterableRepo {
    fork: boolean
    private: boolean
    archived: boolean
    disabled: boolean
    fullName: string
    description: string | null
}

export interface RepoFilters {
    fork: 'source' | 'all'
    visibility: 'all' | 'public' | 'private'
    archived: 'exclude' | 'include'
    keyword: string
}

/** 返回 true = 保留该仓库 */
export function passesRepoFilter(repo: FilterableRepo, filters: RepoFilters): boolean {
    if (filters.fork === 'source' && repo.fork) {
        return false
    }
    if (filters.visibility === 'public' && repo.private) {
        return false
    }
    if (filters.visibility === 'private' && !repo.private) {
        return false
    }
    // 第 4 维：archived/disabled 只读仓库（默认排除，可切换包含）
    if (filters.archived === 'exclude' && (repo.archived || repo.disabled)) {
        return false
    }
    if (filters.keyword) {
        const haystack = `${repo.fullName}\n${repo.description ?? ''}`.toLowerCase()
        if (!haystack.includes(filters.keyword.toLowerCase())) {
            return false
        }
    }
    return true
}
