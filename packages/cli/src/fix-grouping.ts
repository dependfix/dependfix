// fix-grouping.ts
// T213 依赖分组升级：分组来源解析与分组结果构建。
// 分组来源优先级：显式分组（CLI）> dependabot.yml groups > @types 归并 > scope/前缀启发式 > 单包。
// 设计详见 docs/design/dependency-grouping.md。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { findDependencyVersion, readLockfileVersion } from './fixers/dependency'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 分组来源（决定分组优先级与命名语义） */
export type GroupSource = 'explicit' | 'dependabot' | 'types' | 'scope' | 'prefix' | 'single'

export interface DependencyGroup {
    /** 组名（日志与统计用） */
    name: string
    /** 组内包名（保持输入顺序） */
    packages: string[]
    source: GroupSource
}

export interface GroupingResult {
    /** 有序分组（处理顺序即升级执行顺序） */
    groups: DependencyGroup[]
    /**
     * @types 孤儿包：主包不在 package.json 依赖 / pnpm overrides / lockfile，
     * 疑似废弃（主包已移除或已内置类型），不升级，建议移除。
     */
    cleanupCandidates: string[]
}

export interface GroupingOptions {
    /** 工作目录（读取 package.json / pnpm-lock.yaml / .github/dependabot.yml） */
    workDir: string
    /** 用户显式分组：组名 -> 包列表（最高优先级，覆盖自动分组） */
    explicitGroups?: Record<string, string[]>
    /** 前缀启发式组大小上限（默认 5；scope 组不设限） */
    heuristicMaxSize?: number
}

/** 与 fixers/dependency 内部 PackageJson 结构兼容的轻量视图 */
interface PackageJsonLike {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    pnpm?: {
        overrides?: Record<string, string>
        [key: string]: unknown
    }
    [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Pattern matching (dependabot groups)
// ---------------------------------------------------------------------------

/**
 * 判断包名是否匹配 dependabot pattern。
 *
 * 支持 dependabot 官方语法子集（glob 语义，`*` 匹配零个及以上字符）：
 * - 精确包名：`lodash` → 仅 `lodash`
 * - scope 通配：`@scope/*` → `@scope/a`、`@scope/b`
 * - 前缀通配：`markdown-it*` → `markdown-it` 本体及其插件
 *   （`markdown-it-*` 因前缀含 `-`，不匹配 `markdown-it` 本体——与 glob 语义一致）
 *
 * 裸 `*`（全匹配）视为不匹配，防止误分组（设计稿 §3）。
 * 中间通配（`foo*bar`）不支持。
 */
export function matchesPattern(packageName: string, pattern: string): boolean {
    if (!pattern || pattern === '*') {
        return false
    }
    if (!pattern.includes('*')) {
        return packageName === pattern
    }
    const parts = pattern.split('*')
    // 仅支持单个尾部通配（prefix*），如 `@scope/*`、`markdown-it*`
    if (parts.length !== 2 || parts[1] !== '') {
        return false
    }
    const prefix = parts[0]
    // `*` 匹配零个及以上字符：前缀恰好等于包名（如 `markdown-it*` → `markdown-it`）也匹配
    return packageName.startsWith(prefix) && packageName.length >= prefix.length
}

/**
 * 解析 `.github/dependabot.yml`（或 `.yaml` 变体）中 npm ecosystem 的 `groups` → patterns。
 *
 * 文件缺失 / YAML 解析失败 / 无 groups 时返回空对象（调用方降级为下一层分组，不阻断流程）。
 * 解析为 dependabot 语法子集：仅 `groups.<name>.patterns`；`exclude-patterns` /
 * `dependency-type` / `update-types` 忽略（设计稿 §3）。
 */
export function parseDependabotGroups(workDir: string): Record<string, string[]> {
    const candidates = [join(workDir, '.github', 'dependabot.yml'), join(workDir, '.github', 'dependabot.yaml')]
    const filePath = candidates.find((p) => existsSync(p))
    if (!filePath) {
        return {}
    }

    let doc: unknown
    try {
        doc = YAML.parse(readFileSync(filePath, 'utf-8'))
    } catch {
        return {}
    }

    const result: Record<string, string[]> = {}
    if (!doc || typeof doc !== 'object') {
        return result
    }

    const updates = (doc as { updates?: unknown }).updates
    if (!Array.isArray(updates)) {
        return result
    }

    for (const update of updates) {
        if (!update || typeof update !== 'object') {
            continue
        }
        const u = update as { 'package-ecosystem'?: unknown, groups?: unknown }
        if (u['package-ecosystem'] !== 'npm') {
            continue
        }
        if (!u.groups || typeof u.groups !== 'object') {
            continue
        }

        for (const [name, value] of Object.entries(u.groups as Record<string, unknown>)) {
            // 防御：过滤原型链风险键名（__proto__ 等会污染结果对象原型或静默丢失）
            if (!isSafeGroupName(name)) {
                continue
            }
            if (!value || typeof value !== 'object') {
                continue
            }
            const patterns = (value as { patterns?: unknown }).patterns
            if (!Array.isArray(patterns)) {
                continue
            }
            // 过滤非字符串与裸 `*`（防全匹配误分组）
            const list = patterns.filter((p): p is string => typeof p === 'string' && p !== '*')
            if (list.length > 0) {
                result[name] = list
            }
        }
    }

    return result
}

/** 原型链风险键名过滤（__proto__ / constructor / prototype 不参与分组） */
function isSafeGroupName(name: string): boolean {
    return name !== '__proto__' && name !== 'constructor' && name !== 'prototype'
}

// ---------------------------------------------------------------------------
// @types 特殊处理
// ---------------------------------------------------------------------------

const TYPES_PREFIX = '@types/'

/**
 * 从 `@types/x` 提取主包名。
 *
 * 处理 TypeScript 官方约定：scoped 主包 `@scope/name` 的类型包名为
 * `@types/scope__name`（`/` → `__`）。还原后：
 * - `@types/express` → `express`
 * - `@types/koa__router` → `@koa/router`（scoped）
 *
 * 非 @types 包返回 `null`。
 */
export function extractMainPackage(packageName: string): string | null {
    if (!packageName.startsWith(TYPES_PREFIX)) {
        return null
    }
    const main = packageName.slice(TYPES_PREFIX.length)
    const idx = main.indexOf('__')
    if (idx > 0 && main.indexOf('/') === -1) {
        // scoped 主包：`scope__name` → `@scope/name`
        return `@${main.slice(0, idx)}/${main.slice(idx + 2)}`
    }
    return main
}

/**
 * 判定 @types 的主包是否仍然存在（任一命中即存在）：
 * 1. package.json 直接依赖（dependencies / devDependencies / optionalDependencies）
 * 2. pnpm.overrides（间接依赖修复场景）
 * 3. lockfile 中存在（间接依赖场景）
 */
export function isMainPackagePresent(
    pkg: PackageJsonLike,
    lockfilePath: string,
    mainPackage: string,
): boolean {
    if (findDependencyVersion(pkg, mainPackage)) {
        return true
    }
    if (
        pkg.pnpm?.overrides
        && typeof pkg.pnpm.overrides === 'object'
        && mainPackage in pkg.pnpm.overrides
    ) {
        return true
    }
    return readLockfileVersion(lockfilePath, mainPackage) !== null
}

// ---------------------------------------------------------------------------
// Heuristic grouping
// ---------------------------------------------------------------------------

/** 提取 scope（`@scope/name` → `@scope`）；非 scoped 包返回 `null` */
function extractScope(packageName: string): string | null {
    if (!packageName.startsWith('@')) {
        return null
    }
    const idx = packageName.indexOf('/')
    if (idx <= 1) {
        return null
    }
    return packageName.slice(0, idx)
}

/**
 * 前缀启发式 key：非 scoped 包名取前两段（`a-b-c` → `a-b`）。
 * - `markdown-it`、`markdown-it-anchor` → `markdown-it`（插件族合并）
 * - `markdownlint`（单段）→ 不成组
 */
function prefixKey(packageName: string): string | null {
    if (packageName.startsWith('@')) {
        return null
    }
    const segments = packageName.split('-')
    if (segments.length < 2) {
        return null
    }
    return segments.slice(0, 2).join('-')
}

/**
 * 对非 @types 包做 scope / 前缀启发式分组。
 * - scope 组：同 scope 强相关，不设大小上限
 * - prefix 组：共享前两段的包成组，组大小 ≤ heuristicMaxSize（超限放弃，回退单包组）
 */
function buildHeuristicGroups(
    packages: string[],
    assigned: Set<string>,
    heuristicMaxSize: number,
): DependencyGroup[] {
    const groups: DependencyGroup[] = []

    // scope 启发式
    const scopeGroups = new Map<string, DependencyGroup>()
    for (const pkg of packages) {
        if (assigned.has(pkg)) {
            continue
        }
        const scope = extractScope(pkg)
        if (!scope) {
            continue
        }
        let group = scopeGroups.get(scope)
        if (!group) {
            group = { name: scope, packages: [], source: 'scope' }
            scopeGroups.set(scope, group)
        }
        assigned.add(pkg)
        group.packages.push(pkg)
    }
    groups.push(...scopeGroups.values())

    // prefix 启发式
    const candidates = new Map<string, string[]>()
    for (const pkg of packages) {
        if (assigned.has(pkg)) {
            continue
        }
        const key = prefixKey(pkg)
        if (!key) {
            continue
        }
        const list = candidates.get(key) ?? []
        list.push(pkg)
        candidates.set(key, list)
    }
    for (const [key, list] of candidates) {
        if (list.length < 2 || list.length > heuristicMaxSize) {
            continue
        }
        const group: DependencyGroup = { name: key, packages: [], source: 'prefix' }
        for (const pkg of list) {
            assigned.add(pkg)
            group.packages.push(pkg)
        }
        groups.push(group)
    }

    return groups
}

// ---------------------------------------------------------------------------
// Build groups
// ---------------------------------------------------------------------------

/**
 * 构建升级分组（主入口）。
 *
 * 输入：已按包去重的 fixable alerts（每包一条，取最高 recommendedVersion）。
 * 输出：有序分组 + @types 清理候选。
 *
 * 分组顺序（即升级执行顺序）：
 * 1. 显式分组（用户 CLI，最高优先级）
 * 2. dependabot.yml groups
 * 3. scope / 前缀启发式（非 @types）
 * 4. 非 @types 单包组
 * 5. @types 归并（主包有告警并入其组）/ 独立组 / 清理候选（主包已不存在）
 */
export function buildUpgradeGroups(
    alerts: NormalizedSecurityAlert[],
    options: GroupingOptions,
): GroupingResult {
    const { workDir, explicitGroups = {}, heuristicMaxSize = 5 } = options

    const packages = alerts.map((a) => a.packageName)
    const target = new Set(packages)

    const groups: DependencyGroup[] = []
    const assigned = new Set<string>()
    const cleanupCandidates: string[] = []

    const assign = (pkg: string, group: DependencyGroup): void => {
        if (assigned.has(pkg) || !target.has(pkg)) {
            return
        }
        assigned.add(pkg)
        group.packages.push(pkg)
    }

    // ---- 1. 显式分组（最高优先级） ----
    for (const [name, pkgs] of Object.entries(explicitGroups)) {
        if (!isSafeGroupName(name)) {
            continue
        }
        const group: DependencyGroup = { name, packages: [], source: 'explicit' }
        for (const pkg of pkgs) {
            assign(pkg, group)
        }
        if (group.packages.length > 0) {
            groups.push(group)
        }
    }

    // ---- 2. dependabot.yml groups ----
    for (const [name, patterns] of Object.entries(parseDependabotGroups(workDir))) {
        const group: DependencyGroup = { name, packages: [], source: 'dependabot' }
        for (const pkg of packages) {
            if (assigned.has(pkg)) {
                continue
            }
            if (patterns.some((p) => matchesPattern(pkg, p))) {
                assign(pkg, group)
            }
        }
        if (group.packages.length > 0) {
            groups.push(group)
        }
    }

    // ---- 3. scope / 前缀启发式（非 @types） ----
    const nonTypesPackages = packages.filter((p) => extractMainPackage(p) === null)
    groups.push(...buildHeuristicGroups(nonTypesPackages, assigned, heuristicMaxSize))

    // ---- 4. 非 @types 单包组（@types 单独处理，见步骤 5） ----
    for (const pkg of nonTypesPackages) {
        if (assigned.has(pkg)) {
            continue
        }
        const group: DependencyGroup = { name: pkg, packages: [], source: 'single' }
        assign(pkg, group)
        groups.push(group)
    }

    // ---- 5. @types 归并 / 独立 / 清理候选 ----
    const pkgPath = join(workDir, 'package.json')
    let pkg: PackageJsonLike | null = null
    if (existsSync(pkgPath)) {
        try {
            pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJsonLike
        } catch {
            // package.json 解析失败：孤儿判定退化为 lockfile 检查（保守：只对 lockfile 也无主包的 @types 判孤儿）
        }
    }
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')

    for (const typesPkg of packages) {
        if (assigned.has(typesPkg) || extractMainPackage(typesPkg) === null) {
            continue
        }
        const main = extractMainPackage(typesPkg)!

        // 主包在待升级列表 → 归并到主包所在组（类型与实现一起升级、一起验证）
        const mainGroup = groups.find((g) => g.packages.includes(main))
        if (mainGroup) {
            assign(typesPkg, mainGroup)
            continue
        }

        // 主包仍存在（直接依赖 / overrides / lockfile）→ 独立组
        if (isMainPackagePresent(pkg ?? {}, lockfilePath, main)) {
            const group: DependencyGroup = { name: `types:${main}`, packages: [], source: 'types' }
            assign(typesPkg, group)
            groups.push(group)
            continue
        }

        // 主包已不存在 → 清理候选（不升级，疑似废弃）
        cleanupCandidates.push(typesPkg)
    }

    return { groups, cleanupCandidates }
}
