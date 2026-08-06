// repo-policy.ts（M4 T403）
// 仓库白名单 / 黑名单策略：include / exclude glob 过滤 + topic 黑名单。
// 与 repository-discovery 配合：发现结果受 include + exclude + topicsExclude 约束；
// 显式 repositories 列表受 exclude 约束、不受 include 影响。

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

/** 单条 glob 模式长度上限（R6 加固：防止超长模式引入匹配开销；受信配置 + 短输入） */
export const MAX_GLOB_PATTERN_LENGTH = 200

/**
 * 将仓库 glob 模式转正则（`owner/*`、`owner/pkg-*`）。
 *
 * 支持通配：
 * - `*` → 任意非 `/` 字符序列（不跨仓库分隔符）
 * - `?` → 单个非 `/` 字符
 * - 其余字符按字面量（正则元字符转义）
 *
 * 匹配对象为完整 `owner/repo` 字符串（大小写敏感，与 GitHub full_name 一致）。
 * 模式仅限受信配置输入（CLI/env），长度超过 {@link MAX_GLOB_PATTERN_LENGTH} 时拒绝。
 * 多通配符模式存在理论 O(n^k) 回溯面（`[^/]*` 单层字符类、输入 ≤ ~140 字符，风险低）；
 * C18 正则引擎演进时需专项 ReDoS 审计。
 */
export function repoGlobToRegExp(pattern: string): RegExp {
    if (pattern.length > MAX_GLOB_PATTERN_LENGTH) {
        throw new Error(`Repository glob pattern exceeds ${MAX_GLOB_PATTERN_LENGTH} chars: "${pattern.slice(0, 32)}..."`)
    }
    let source = ''
    for (const char of pattern) {
        if (char === '*') {
            source += '[^/]*'
        } else if (char === '?') {
            source += '[^/]'
        } else {
            source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
    }
    return new RegExp(`^${source}$`)
}

/** glob 模式匹配 `owner/repo`（完整匹配）。 */
export function matchesRepoGlob(pattern: string, fullName: string): boolean {
    return repoGlobToRegExp(pattern).test(fullName)
}

// ---------------------------------------------------------------------------
// Policy types & predicates
// ---------------------------------------------------------------------------

export interface RepoPolicy {
    /** 白名单 glob（仅作用于发现结果；显式列表不受影响） */
    include?: string[]
    /** 黑名单 glob（显式列表 + 发现结果均受约束；与 include 冲突时胜出） */
    exclude?: string[]
    /** topic 黑名单（仅作用于发现结果：排除含任一指定 topic 的仓库） */
    topicsExclude?: string[]
}

/** 是否命中任一 exclude 模式（黑名单）。 */
export function matchesRepoExclude(policy: RepoPolicy, fullName: string): boolean {
    return (policy.exclude ?? []).some((pattern) => matchesRepoGlob(pattern, fullName))
}

/** 是否通过 include 白名单（include 为空 = 不限制；非空 = 必须命中任一模式）。 */
export function matchesRepoInclude(policy: RepoPolicy, fullName: string): boolean {
    const include = policy.include ?? []
    return include.length === 0 || include.some((pattern) => matchesRepoGlob(pattern, fullName))
}

/** topic 黑名单：仓库 topics 含任一指定 topic 即排除（R5：大小写归一化后比较）。 */
export function matchesTopicsExclude(policy: RepoPolicy, topics: string[]): boolean {
    const blocked = (policy.topicsExclude ?? []).map((t) => t.toLowerCase())
    return topics.map((t) => t.toLowerCase()).some((topic) => blocked.includes(topic))
}

// ---------------------------------------------------------------------------
// List-level filters
// ---------------------------------------------------------------------------

/**
 * 过滤显式仓库列表：仅受 exclude 约束（白名单 include 不适用于显式列表，
 * 设计要点：显式优先，用户显式指定的仓库不应被 include 静默剔除）。
 */
export function filterExplicitRepositories(policy: RepoPolicy, repositories: string[]): string[] {
    return repositories.filter((repo) => !matchesRepoExclude(policy, repo))
}
