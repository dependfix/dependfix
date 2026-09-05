// helpers/index.ts（原 fix-helpers.ts）
// 修复规划与逐包验证辅助：同包告警收敛、文件快照回滚、逐包快速验证。
// 多个 alerts 指向同一包时逐个升级会互相覆盖甚至降级；逐包验证失败
// 只回滚该包改动，避免"一个包失败导致全部回滚"。
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { compareSemver, readLockfileVersions, isCrossMajorFixRequired } from '../fixers/dependency'
import { runVerification } from '../runners/verification-runner'
import { validateVerifyCommands } from '../verification/validate-commands'
import type { AppContext } from '../app/helpers'

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
 * `extraPaths` 可附加额外相对路径（key 即相对路径，如 `packages/web/package.json`），
 * 用于成员级修复将成员 manifest 纳入回滚基线。
 * 用于逐包升级验证失败时精确回滚该包产生的改动，而不影响此前已成功的包。
 */
export function snapshotTrackedFiles(workDir: string, extraPaths?: string[]): Record<string, string | null> {
    const targets = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', ...(extraPaths ?? [])]
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
 * 快速验证（逐包）：运行验证命令序列。
 *
 * 有自定义命令时执行完整序列（含 install + setup + lint + build），
 * 否则仅运行 `pnpm lint`（脚本存在时）。
 *
 * 设计决策（run 33946113272 复盘）：旧版仅跑 `pnpm lint`，但 Nuxt 等框架
 * 项目 lint 依赖 `nuxt prepare` 生成的 `.nuxt/tsconfig.json`——无 prepare
 * 步骤会导致 ESLint OOM。自定义命令已含 prepare，走完整序列可避免此问题；
 * `pnpm install` 在 node_modules 已就绪时近乎空操作，性能影响可忽略。
 */
export async function quickVerifyProject(
    ctx: Pick<AppContext, 'logger' | 'workDir' | 'customCommands'>,
    repo: string,
): Promise<boolean> {
    const { logger, workDir, customCommands } = ctx
    const rawCommands = customCommands ?? ['pnpm lint']
    const { valid, skipped } = validateVerifyCommands(rawCommands, workDir)

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
 * 成员级可修复告警条目：告警 + 所属成员目录（相对 workDir，如 `packages/web`）。
 */
export interface MemberManifestAlert {
    alert: NormalizedSecurityAlert
    /** 成员目录（相对 workDir，如 `packages/web`） */
    manifestDir: string
}

/**
 * 告警分区结果：根 manifest / 成员 manifest（可自动修复）/ 其他（人工）。
 */
export interface SubmanifestPartition {
    root: NormalizedSecurityAlert[]
    member: MemberManifestAlert[]
    sub: NormalizedSecurityAlert[]
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
 * - 其他子目录 manifest：
 *   - **workspace 成员 manifest**（目录 ∈ `pnpm-workspace.yaml` packages 白名单）
 *     + 包在成员 manifest 直接声明 + lockfile 单版本 + 推荐 >= 锁定 + 非跨线
 *     → member（成员级升级）
 *   - 其余 → sub（单根模型无法安全修 / 多版本共存 / 降级风险 / 跨线 / 非成员路径，
 *     需人工处理）
 */
export function partitionSubmanifestAlerts(
    alerts: NormalizedSecurityAlert[],
    workDir: string,
): SubmanifestPartition {
    const root: NormalizedSecurityAlert[] = []
    const member: MemberManifestAlert[] = []
    const sub: NormalizedSecurityAlert[] = []
    // 成员白名单（绝对路径）一次计算，供所有告警复用
    const memberDirs = findWorkspaceMembers(workDir)
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
        const memberDir = resolveMemberManifestDir(workDir, memberDirs, normalized, alert)
        if (memberDir) {
            member.push({ alert, manifestDir: memberDir })
            continue
        }
        sub.push(alert)
    }
    return { root, member, sub }
}

/**
 * 判定告警是否来自 workspace 成员 manifest 且可安全自动升级。
 * 返回成员目录（相对 workDir，如 `packages/web`）；不满足任一准入条件返回 null。
 *
 * 准入（全部满足）：
 * - manifestPath 的目录部分 ∈ 成员白名单（绝对路径集合，防路径穿越 / 非成员路径）
 * - 包在成员 manifest 直接声明（dependencies / devDependencies / optionalDependencies）
 * - 告警可修复（`fixable`，与 2.0.1/2.0.2 链路的 fixable 过滤语义一致）
 * - lockfile 该包**单版本**（多版本共存 → 成员声明无法安全收敛，人工）
 * - 推荐版本 >= 锁定版本（防降级）
 * - **非跨线**（跨线语义仅限根直接依赖）
 */
function resolveMemberManifestDir(
    workDir: string,
    memberDirs: string[],
    manifestPath: string,
    alert: NormalizedSecurityAlert,
): string | null {
    const slashIdx = manifestPath.lastIndexOf('/')
    // 仅处理 manifest 文件本身（Dependabot 只产出 package.json；其他文件名落 sub）
    const basename = slashIdx >= 0 ? manifestPath.slice(slashIdx + 1) : manifestPath
    if (basename !== 'package.json') {
        return null
    }
    const manifestDir = slashIdx > 0 ? manifestPath.slice(0, slashIdx) : ''
    if (!manifestDir) {
        return null
    }
    // 成员白名单校验（绝对路径包含判断）
    if (!memberDirs.includes(join(workDir, manifestDir))) {
        return null
    }
    // 告警可修复（无修复版本的成员告警维持人工，进入 sub 桶计 skipped）
    if (!alert.fixable) {
        return null
    }
    // 包在成员 manifest 直接声明
    const names = new Set<string>()
    collectDirectDependencyNames(names, join(workDir, manifestDir, 'package.json'))
    if (!names.has(alert.packageName)) {
        return null
    }
    // lockfile 版本关系：单版本 + 推荐 >= 锁定 + 非跨线
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')
    const versions = readLockfileVersions(lockfilePath, alert.packageName)
    if (versions.length !== 1) {
        return null
    }
    if (!alert.recommendedVersion || compareSemver(alert.recommendedVersion, versions[0]) < 0) {
        return null
    }
    if (isCrossMajorFixRequired(lockfilePath, alert)) {
        return null
    }
    return manifestDir
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
 * 进入跨线链路必然失败，维持人工处理。
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
