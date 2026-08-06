// helpers/index.ts（原 fix-helpers.ts）
// 修复规划与逐包验证辅助：同包告警收敛、文件快照回滚、逐包快速验证。
// 多个 alerts 指向同一包时逐个升级会互相覆盖甚至降级；逐包验证失败
// 只回滚该包改动，避免"一个包失败导致全部回滚"。
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { compareSemver, readLockfileVersions } from '../fixers/dependency'
import { runVerification } from '../runners/verification-runner'
import { validateVerifyCommands, type AppContext } from '../app/helpers'

/**
 * 对可修复告警按包名去重（同包收敛）。
 *
 * 同一包可能对应多个 Dependabot alerts（不同 GHSA 各自的 `first_patched_version`
 * 不同），逐个升级会互相覆盖甚至降级。本函数每组只保留一个代表 alert：
 * 取 `recommendedVersion` 最高者（升到最高修复版本可同时满足所有告警）。
 *
 * @param alerts 已过滤出 fixable && recommendedVersion 非空的告警
 * @returns 每包仅一条的代表告警
 */
export function dedupeFixableAlerts(alerts: NormalizedSecurityAlert[]): NormalizedSecurityAlert[] {
    const best = new Map<string, NormalizedSecurityAlert>()

    for (const alert of alerts) {
        const current = best.get(alert.packageName)
        if (!current) {
            best.set(alert.packageName, alert)
            continue
        }
        if (compareSemver(alert.recommendedVersion, current.recommendedVersion) > 0) {
            best.set(alert.packageName, alert)
        }
    }

    return [...best.values()]
}

/**
 * 读取修复涉及的关键文件快照（逐包回滚基线）。
 *
 * 快照文件：`package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`（存在才记录）。
 * 用于逐包升级验证失败时精确回滚该包产生的改动，而不影响此前已成功的包。
 */
export function snapshotTrackedFiles(workDir: string): Record<string, string | null> {
    const targets = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']
    const snapshot: Record<string, string | null> = {}

    for (const name of targets) {
        const filePath = join(workDir, name)
        snapshot[name] = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null
    }

    return snapshot
}

/**
 * 恢复文件快照（逐包回滚）。原不存在的文件将被删除。
 */
export function restoreTrackedFiles(workDir: string, snapshot: Record<string, string | null>): void {
    for (const [name, content] of Object.entries(snapshot)) {
        const filePath = join(workDir, name)
        if (content === null) {
            if (existsSync(filePath)) {
                try {
                    unlinkSync(filePath)
                } catch {
                    // 删除失败静默（后续升级 install 会重新对齐）
                }
            }
            continue
        }
        writeFileSync(filePath, content, 'utf-8')
    }
}

/**
 * 快速验证（逐包）：仅运行 `pnpm lint`（脚本存在时）。
 *
 * 完整验证（install + lint + build）成本高，逐包执行不现实；
 * lint 是依赖兼容性的快速信号（本次坏 PR 即因 lint 失败）。
 * 无 lint 脚本时视为通过（与 verifyProject 的跳过语义一致）。
 */
export async function quickVerifyProject(
    ctx: Pick<AppContext, 'logger' | 'workDir'>,
    repo: string,
): Promise<boolean> {
    const { logger, workDir } = ctx
    const { valid, skipped } = validateVerifyCommands(['pnpm lint'], workDir)

    if (valid.length === 0) {
        if (skipped.length > 0) {
            logger.info(`[quick-verify] ${repo}: no lint script, skipping per-package verification`)
        }
        return true
    }

    const result = await runVerification({ workDir, commands: valid })
    if (!result.success) {
        logger.warn(`[quick-verify] ${repo}: lint failed after upgrade`)
        return false
    }
    return true
}

/**
 * 区分可安全自动修复的告警与需人工处理的告警（防护 + run 30933266831 复盘修正）。
 *
 * Dependabot 告警携带 `dependency.manifest_path`，其值与包类型相关：
 * - 直接依赖 → `package.json`（根）
 * - **间接依赖 → `pnpm-lock.yaml`**（lockfile 即间接依赖的 manifest，overrides 修复的标准场景）
 * - 子目录 manifest → `docs/package.json`、`packages/x/package.json`、fixtures 等
 *
 * 修复模型是单根 workDir（package.json + pnpm overrides 全局生效），规则：
 * - `''` / `package.json` → root（正常修复；pnpm-audit 源 manifestPath='' 不受影响）
 * - `pnpm-lock.yaml`：
 *   - 包**不是**直接依赖（根或 workspace 成员）→ root（标准间接依赖，走 overrides 修复，fast-uri 等）
 *   - 包**是**直接依赖：
 *     - lockfile 中该包**多版本共存** → root（版本化 overrides `pkg@version` 只影响
 *       对应实例，不会波及根声明——vite@5.4.14 与 vite@8.2.0 场景，2026-08-06 复盘）
 *     - lockfile 中仅单版本且**推荐版本 >= 锁定版本** → root（全局 overrides
 *       `^recommended` 只会把实例升到 >= 锁定版本，不降级声明，可安全修复）
 *     - lockfile 中仅单版本且**推荐版本 < 锁定版本** → sub（全局 overrides 会降级声明，
 *       如 vite@5 告警会降级根 vite@8——run 30929090403 教训；需人工处理）
 *     - lockfile 无版本信息 → sub（无法判断降级风险，保守跳过）
 * - 其他子目录 manifest → sub（单根模型无法安全修，需人工处理）
 */
export function partitionSubmanifestAlerts(
    alerts: NormalizedSecurityAlert[],
    workDir: string,
): { root: NormalizedSecurityAlert[], sub: NormalizedSecurityAlert[] } {
    const root: NormalizedSecurityAlert[] = []
    const sub: NormalizedSecurityAlert[] = []
    for (const alert of alerts) {
        const normalized = alert.manifestPath.trim().replace(/\\/g, '/')
        if (normalized === '' || normalized === 'package.json') {
            root.push(alert)
            continue
        }
        if (normalized === 'pnpm-lock.yaml') {
            if (isWorkspaceDirectDependency(workDir, alert.packageName)) {
                // 直接依赖（根或 workspace 成员）+ lockfile 告警：
                // 多版本共存 → 版本化 overrides 安全；单版本且推荐 >= 锁定 → 不降级可修；
                // 其余（推荐 < 锁定 / 无版本信息）→ 全局 overrides 会波及声明（防降级保护），sub
                const versions = readLockfileVersions(join(workDir, 'pnpm-lock.yaml'), alert.packageName)
                if (versions.length > 1) {
                    root.push(alert)
                } else if (versions.length === 1 && alert.recommendedVersion
                    && compareSemver(alert.recommendedVersion, versions[0]) >= 0) {
                    root.push(alert)
                } else {
                    sub.push(alert)
                }
            } else {
                root.push(alert)
            }
            continue
        }
        sub.push(alert)
    }
    return { root, sub }
}

/**
 * 判断包是否为工作区的直接依赖（根 + 所有 workspace 成员包的
 * dependencies / devDependencies / optionalDependencies，覆盖根与 workspace 成员）。
 * 单次调用扫描一次 workspace 成员依赖集合（成员数少，成本可接受）。
 */
function isWorkspaceDirectDependency(workDir: string, packageName: string): boolean {
    return scanWorkspaceDirectDependencies(workDir).has(packageName)
}

/**
 * 判断包是否为**根** `package.json` 的直接依赖（仅查根声明的
 * dependencies / devDependencies / optionalDependencies）。
 *
 * 与 `isWorkspaceDirectDependency` 的区别：修复器 `upgradeDependency` 只修改
 * 根 manifest，跨线升级准入必须与修复器能力对齐——仅成员声明的包（root 未声明）
 * 进入跨线链路必然失败，维持人工处理（T405 Review Gate P2-2 修复）。
 */
export function isRootDirectDependency(workDir: string, packageName: string): boolean {
    const names = new Set<string>()
    collectDirectDependencyNames(names, join(workDir, 'package.json'))
    return names.has(packageName)
}

/** 收集根 + 所有 workspace 成员包的直接依赖名集合。 */
function scanWorkspaceDirectDependencies(workDir: string): Set<string> {
    const names = new Set<string>()
    collectDirectDependencyNames(names, join(workDir, 'package.json'))
    for (const memberDir of findWorkspaceMembers(workDir)) {
        collectDirectDependencyNames(names, join(memberDir, 'package.json'))
    }
    return names
}

function collectDirectDependencyNames(target: Set<string>, pkgPath: string): void {
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
        for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
            const deps = pkg[group]
            if (deps && typeof deps === 'object') {
                for (const name of Object.keys(deps)) {
                    target.add(name)
                }
            }
        }
    } catch {
        // package.json 缺失/损坏：忽略（后续升级流程会明确报错，不静默）
    }
}

/**
 * 解析 pnpm-workspace.yaml 的 packages glob，返回存在的成员目录列表。
 * 支持形态：字面路径（packages/foo）、`dir/*`（直接子目录）、`dir/**`（递归）、`**`（全部）；
 * 仅匹配目录；`.`（根）跳过（根已在扫描范围内）；解析失败返回 []。
 */
function findWorkspaceMembers(workDir: string): string[] {
    const wsPath = join(workDir, 'pnpm-workspace.yaml')
    if (!existsSync(wsPath)) {
        return []
    }
    let patterns: unknown
    try {
        const doc = parseYaml(readFileSync(wsPath, 'utf-8')) as { packages?: unknown }
        patterns = doc.packages
    } catch {
        return []
    }
    if (!Array.isArray(patterns)) {
        return []
    }
    const members: string[] = []
    for (const pattern of patterns) {
        if (typeof pattern !== 'string' || pattern === '.') {
            continue
        }
        expandWorkspaceGlob(workDir, pattern, members)
    }
    return [...new Set(members)]
}

/** 展开单个 workspace glob 模式（含一个通配段；多通配段按字面处理）。 */
function expandWorkspaceGlob(workDir: string, pattern: string, out: string[]): void {
    const normalized = pattern.replace(/\\/g, '/')
    const starIdx = normalized.indexOf('*')
    if (starIdx === -1) {
        const dir = join(workDir, normalized)
        if (existsSync(dir) && statSync(dir).isDirectory()) {
            out.push(dir)
        }
        return
    }
    const prefix = normalized.slice(0, starIdx).replace(/\/+$/, '')
    const base = join(workDir, prefix)
    if (!existsSync(base) || !statSync(base).isDirectory()) {
        return
    }
    if (normalized.endsWith('**')) {
        for (const entry of readdirSync(base, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const child = join(base, entry.name)
                out.push(child)
                collectSubdirectories(child, out)
            }
        }
        return
    }
    // `dir/*`：仅直接子目录
    for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            out.push(join(base, entry.name))
        }
    }
}

/** 递归收集子目录（`**` 模式用）。 */
function collectSubdirectories(dir: string, out: string[]): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const child = join(dir, entry.name)
            out.push(child)
            collectSubdirectories(child, out)
        }
    }
}
