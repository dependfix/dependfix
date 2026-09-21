// repo-policy.ts
// 仓库白名单 / 黑名单策略：include / exclude glob 过滤 + topic 黑名单。
// 与 repository-discovery 配合：发现结果受 include + exclude + topicsExclude 约束；
// 显式 repositories 列表受 exclude 约束、不受 include 影响。

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

/** 单条 glob 模式长度上限（加固：防止超长模式引入匹配开销；受信配置 + 短输入） */
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
 * 正则引擎演进时需专项 ReDoS 审计。
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
    /**
     * overrides 保护名单（显式维护）：仓库 glob → 不得自动写入 override 的包名列表。
     *
     * 命中时 dependfix 跳过该包的 override 写入并记审计（`OVERRIDE_PROTECTED`），
     * 防止历史上被人工移除的破坏性 override 复发（实证见
     * [override-protect-policy.md](../../../../docs/design/governance/override-protect-policy.md)）。
     *
     * **必须按仓库粒度**：同一 override 对不同仓库的破坏性不同（如纯 ESM 依赖只破坏 CJS 消费方），
     * 全局包名黑名单会误伤真正需要该升级的仓库。键支持与 include / exclude 相同的 glob 语义
     * （`owner/*`、`owner/pkg-*`）；全局兜底需写两段通配（owner 段与 repo 段各一个星号），因单星号不跨 `/`。
     */
    overrideProtect?: Record<string, string[]>
}

/** 是否命中任一 exclude 模式（黑名单）。 */
export function matchesRepoExclude(policy: RepoPolicy, fullName: string): boolean {
    return (policy.exclude ?? []).some((pattern) => matchesRepoGlob(pattern, fullName))
}

/**
 * 该仓库是否保护指定包的 override 写入。
 *
 * 命中条件：存在键 glob 匹配 `fullName` **且** 该键的包名列表包含 `packageName`。
 * 返回命中的模式（用于报告展示判定依据）；未命中时 `protected=false`。
 */
export function matchesOverrideProtect(
    policy: RepoPolicy,
    fullName: string,
    packageName: string,
): { protected: boolean, matchedPattern?: string } {
    for (const [pattern, packages] of Object.entries(policy.overrideProtect ?? {})) {
        if (packages.includes(packageName) && matchesRepoGlob(pattern, fullName)) {
            return { protected: true, matchedPattern: pattern }
        }
    }
    return { protected: false }
}

/**
 * 解析 overrides 保护名单入口值（与 `--upgrade-groups` 同格式、同口径）：
 * `name1:pkg1,pkg2;name2:pkg3`（`;` 分隔条目，`:` 分隔仓库 glob 与包列表，`,` 分隔包名）。
 *
 * 与 `normalizeUpgradeGroups` / `parseUpgradeGroupsFlag` 保持一致的 fail-fast 语义：
 * 空 entry 忽略；非空但缺冒号 / 仓库 glob 为空 / 包列表为空 → 抛错（不静默降级）；
 * 原型链风险键名（`__proto__` / `constructor` / `prototype`）忽略。
 *
 * @param value - 原始入口值（CLI 单值 / env 单值）
 * @param errorFactory - 抛错工厂（config 侧抛 CONFIG_VALIDATION_ERROR、CLI 侧抛 ARGUMENT_PARSE_ERROR）
 * @param label - 报错中展示的入口名（如 `--override-protect` / `DEPENDFIX_OVERRIDE_PROTECT`）
 */
export function parseOverrideProtectEntries(
    value: string,
    errorFactory: (message: string) => Error,
    label: string,
): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const entry of value.split(';')) {
        if (!entry.trim()) {
            continue
        }
        const idx = entry.indexOf(':')
        if (idx <= 0) {
            throw errorFactory(`Invalid ${label} entry: "${entry}". Expected format: "repo-glob:pkg1,pkg2"`)
        }
        const repoPattern = entry.slice(0, idx).trim()
        const packages = entry
            .slice(idx + 1)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        if (repoPattern === '__proto__' || repoPattern === 'constructor' || repoPattern === 'prototype') {
            continue
        }
        if (!repoPattern || packages.length === 0) {
            throw errorFactory(`Invalid ${label} entry: "${entry}". Expected format: "repo-glob:pkg1,pkg2"`)
        }
        result[repoPattern] = packages
    }
    return result
}

/** 是否通过 include 白名单（include 为空 = 不限制；非空 = 必须命中任一模式）。 */
export function matchesRepoInclude(policy: RepoPolicy, fullName: string): boolean {
    const include = policy.include ?? []
    return include.length === 0 || include.some((pattern) => matchesRepoGlob(pattern, fullName))
}

/** topic 黑名单：仓库 topics 含任一指定 topic 即排除（大小写归一化后比较）。 */
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
