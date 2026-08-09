import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import YAML from 'yaml'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpgradeDependencyParams {
    /** 包名（如 `'lodash'`, `'@babel/traverse'`） */
    packageName: string
    /** 目标精确版本（如 `'4.17.21'`） */
    targetVersion: string
    /** 工作目录（workspace 根，包含 `package.json` 和 `pnpm-lock.yaml`） */
    workDir: string
    /**
     * 可选：目标 manifest 所在成员目录（相对 workDir，如 `'packages/web'`）。
     * 缺省 = 根 `package.json`（现状行为）。
     * 指定时：修改成员 manifest 的依赖声明，`pnpm install` 仍在根 `workDir`
     * 执行（workspace 解析语义），失败回滚成员 manifest + `pnpm-lock.yaml`。
     */
    manifestDir?: string
}

export interface DependencyFixResult {
    packageName: string
    /** 升级前版本声明（保留原始 range 格式，如 `^4.17.20`） */
    fromVersion: string
    /** 升级后版本声明（保留原始前缀，如 `^4.17.21`） */
    toVersion: string
    /** 是否为 major 版本升级 */
    isMajor: boolean
    /** 升级是否成功 */
    success: boolean
    /** 失败原因（仅 `success=false` 时有值） */
    error?: string
    /** 成功但存在需要用户注意的附加信息（如 overrides 写入位置可能被 pnpm 忽略） */
    warning?: string
}

interface PackageJson {
    name?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    pnpm?: {
        overrides?: Record<string, string>
        [key: string]: unknown
    }
    [key: string]: unknown
}

interface DependencyInfo {
    group: 'dependencies' | 'devDependencies' | 'optionalDependencies'
    version: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 升级单个依赖到指定版本。
 *
 * - 在目标 manifest（根 `package.json`，或 `params.manifestDir` 指定的成员 manifest）
 *   中修改目标包的版本声明（保留原始前缀）
 * - 执行 `pnpm install --no-frozen-lockfile` 更新 lockfile（始终在根 `workDir` 执行，
 *   workspace 解析语义——成员声明变更会触发全 workspace 重新解析）
 * - 失败时自动回滚目标 manifest 和 `pnpm-lock.yaml`
 * - 声明为包管理器协议（`workspace:` / `catalog:` / `link:` 等）时明确失败，
 *   不做不可逆的声明改写
 * - 不执行验证（由验证执行器负责）
 *
 * @param params - 包名、目标版本、工作目录、可选成员目录
 * @returns 修复结果
 */
export async function upgradeDependency(
    params: UpgradeDependencyParams,
): Promise<DependencyFixResult> {
    const { packageName, targetVersion, workDir, manifestDir } = params
    const pkgPath = join(workDir, manifestDir ?? '.', 'package.json')
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')

    // ---- 1. 读取 package.json ----
    if (!existsSync(pkgPath)) {
        return failResult(packageName, targetVersion, '', `${pkgPath}: file not found`)
    }

    let pkg: PackageJson
    try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
    } catch {
        return failResult(packageName, targetVersion, '', `${pkgPath}: invalid JSON`)
    }

    // ---- 2. 查找目标包 ----
    const dep = findDependencyVersion(pkg, packageName)
    if (!dep) {
        return failResult(
            packageName,
            targetVersion,
            '',
            `package "${packageName}" not found in dependencies / devDependencies / optionalDependencies`,
        )
    }

    // ---- 2.5 非 semver 声明防护 ----
    // `workspace:` / `catalog:` / `link:` 等协议声明无法安全改写为 semver range
    // （extractPrefix 会将其误归为 `^`，导致声明被不可逆改写），明确失败计 failed。
    if (isNonSemverDeclaration(dep.version)) {
        return failResult(
            packageName,
            targetVersion,
            dep.version,
            `package "${packageName}" has a non-semver declaration "${dep.version}" (workspace:/catalog:/link:/etc.); manual upgrade required`,
        )
    }

    const fromVersion = dep.version
    const prefix = extractPrefix(fromVersion)
    const toVersion = `${prefix}${targetVersion}`
    const isMajor = parseMajorVersion(fromVersion) !== parseMajorVersion(toVersion)
        && parseMajorVersion(fromVersion) !== -1
        && parseMajorVersion(toVersion) !== -1

    // ---- 3. 备份 ----
    const pkgBackup = `${pkgPath}.bak`
    const lockBackup = `${lockfilePath}.bak`

    try {
        copyFileSync(pkgPath, pkgBackup)
        if (existsSync(lockfilePath)) {
            copyFileSync(lockfilePath, lockBackup)
        }
    } catch {
        return failResult(packageName, targetVersion, fromVersion, 'failed to create backup files')
    }

    // ---- 4. 修改 package.json ----
    const deps = pkg[dep.group]
    if (!deps) {
        // 不应发生: findDependencyVersion 已确认该组存在且包含目标包
        return failResult(packageName, targetVersion, fromVersion, `dependency group "${dep.group}" is missing`)
    }
    deps[packageName] = toVersion
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')

    // ---- 5. 执行 pnpm install ----
    try {
        await execPnpmInstall(workDir)
    } catch (installErr: unknown) {
        // 回滚
        rollback(pkgPath, pkgBackup, lockfilePath, lockBackup)

        // 回滚后清理备份
        cleanupBackups({ pkgBackup, lockBackup })

        const stderr = getStderr(installErr)
        return {
            packageName,
            fromVersion,
            toVersion,
            isMajor,
            success: false,
            error: `pnpm install failed: ${stderr}`,
        }
    }

    // 成功 — 清理备份文件
    cleanupBackups({ pkgBackup, lockBackup })

    return {
        packageName,
        fromVersion,
        toVersion,
        isMajor,
        success: true,
    }
}

/**
 * 通过 pnpm `overrides` 升级间接（transitive）依赖。
 *
 * 间接依赖不在 `package.json` 的 `dependencies` / `devDependencies` 中列出，
 * 因此无法通过常规 `upgradeDependency` 处理。本函数根据项目类型选择覆盖写入位置：
 *
 * - **有 `pnpm-workspace.yaml`**（monorepo / workspace）→ 写入其中的 `overrides` 字段（pnpm v10+ 推荐）
 * - **无 `pnpm-workspace.yaml`**（单包项目）→ 写入 `package.json` 的 `pnpm.overrides`
 *
 * 失败时自动回滚被修改的文件和 `pnpm-lock.yaml`。不执行验证（由验证执行器负责）。
 *
 * @param params - 包名、目标版本、工作目录
 * @returns 修复结果
 */
export async function overrideTransitiveDependency(
    params: UpgradeDependencyParams,
): Promise<DependencyFixResult> {
    const { packageName, targetVersion, workDir } = params
    const pkgPath = join(workDir, 'package.json')
    const workspaceYamlPath = join(workDir, 'pnpm-workspace.yaml')
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')

    const usesWorkspaceYaml = existsSync(workspaceYamlPath)

    // ---- 1. 读取 package.json ----
    if (!existsSync(pkgPath)) {
        return failResult(packageName, targetVersion, '', `${pkgPath}: file not found`)
    }

    let pkg: PackageJson
    try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
    } catch {
        return failResult(packageName, targetVersion, '', `${pkgPath}: invalid JSON`)
    }

    // ---- 2. 确认是间接依赖 ----
    const directDep = findDependencyVersion(pkg, packageName)
    if (directDep) {
        return failResult(
            packageName,
            targetVersion,
            directDep.version,
            `package "${packageName}" is a direct dependency (${directDep.group}), use upgradeDependency instead`,
        )
    }

    // ---- 3. 从 lockfile 提取当前版本 ----
    const fromVersion = readLockfileVersion(lockfilePath, packageName) ?? 'unknown'

    // ---- 4. 构建目标版本声明 ----
    const prefix = extractPrefix(fromVersion)
    const toVersion = `${prefix}${targetVersion}`
    const isMajor = parseMajorVersion(fromVersion) !== parseMajorVersion(toVersion)
        && parseMajorVersion(fromVersion) !== -1
        && parseMajorVersion(toVersion) !== -1

    // ---- 5. 备份 ----
    const pkgBackup = `${pkgPath}.bak`
    const workspaceBackup = usesWorkspaceYaml ? `${workspaceYamlPath}.bak` : null
    const lockBackup = `${lockfilePath}.bak`

    try {
        copyFileSync(pkgPath, pkgBackup)
        if (usesWorkspaceYaml && workspaceBackup) {
            copyFileSync(workspaceYamlPath, workspaceBackup)
        }
        if (existsSync(lockfilePath)) {
            copyFileSync(lockfilePath, lockBackup)
        }
    } catch {
        return failResult(packageName, targetVersion, fromVersion, 'failed to create backup files')
    }

    // ---- 6. 写入 overrides ----
    let oldOverride: string | undefined
    // 无 workspace.yaml 且 pnpm v10+ → package.json overrides 可能被忽略（假成功风险）
    let pkgJsonOverrideWarning: string | undefined
    let verifyOverrideTookEffect = false

    if (usesWorkspaceYaml) {
        oldOverride = writeWorkspaceOverride(workspaceYamlPath, packageName, toVersion)
    } else {
        const pnpmMajor = detectPnpmMajor(workDir)
        if (pnpmMajor !== null && pnpmMajor >= 10) {
            pkgJsonOverrideWarning = `pnpm v${pnpmMajor} may ignore package.json#pnpm.overrides without pnpm-workspace.yaml — if the lockfile does not update to >= ${targetVersion}, create pnpm-workspace.yaml with the override instead`
            verifyOverrideTookEffect = true
        }
        const overrides = ensurePnpmOverrides(pkg)
        oldOverride = overrides[packageName]
        overrides[packageName] = toVersion
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    }

    // ---- 7. 执行 pnpm install ----
    try {
        await execPnpmInstall(workDir)
    } catch (installErr: unknown) {
        // 回滚
        rollbackOverrideWrite({
            usesWorkspaceYaml,
            workspaceYamlPath,
            packageName,
            oldOverride,
            pkg,
            pkgPath,
            pkgBackup,
            lockfilePath,
            lockBackup,
            workspaceBackup,
        })

        const stderr = getStderr(installErr)
        return {
            packageName,
            fromVersion,
            toVersion,
            isMajor,
            success: false,
            error: `pnpm install failed: ${stderr}`,
        }
    }

    // ---- 7.5 生效校验：仅"无 workspace.yaml + pnpm v10+"风险场景——
    // install 后 lockfile 版本必须达到目标，否则判定假成功：回滚 + 报错 ----
    if (verifyOverrideTookEffect) {
        const afterVersion = readLockfileVersion(lockfilePath, packageName)
        if (afterVersion !== null && compareSemver(afterVersion, targetVersion) < 0) {
            rollbackOverrideWrite({
                usesWorkspaceYaml,
                workspaceYamlPath,
                packageName,
                oldOverride,
                pkg,
                pkgPath,
                pkgBackup,
                lockfilePath,
                lockBackup,
                workspaceBackup,
            })
            return {
                packageName,
                fromVersion,
                toVersion,
                isMajor,
                success: false,
                error: `override did not take effect: lockfile still at ${afterVersion} (< ${targetVersion}). pnpm v10+ may ignore package.json#pnpm.overrides without pnpm-workspace.yaml — changes rolled back; create pnpm-workspace.yaml with the override and retry.`,
            }
        }
    }

    // 成功 — 清理备份文件
    cleanupBackups({
        pkgBackup,
        lockBackup,
        workspaceBackup,
    })

    return {
        packageName,
        fromVersion,
        toVersion,
        isMajor,
        success: true,
        warning: pkgJsonOverrideWarning,
    }
}

/**
 * 通过 pnpm `overrides` **批量**写入覆盖条目并执行 install（多版本共存 / 单 major 统一入口）。
 *
 * 场景：lockfile 中同一包共存多个版本实例（如 vite@5.4.14 与 vite@8.2.0），
 * 单一 `pkg: version` 全局覆盖会波及所有实例（可能误降级根声明），
 * 因此按版本实例分别写 `pkg@major: ^target`（pnpm 版本化 override 惯例，
 * 参考用户提供的 path-to-regexp / picomatch 多版本分别覆盖示例）。
 *
 * key 形式由生成侧（buildVersionedOverrides）按大版本冲突判定决定：
 * - 多 major 共存 → 版本化 key `pkg@major: ^target`
 * - 单 major（含同 major 多小版本）→ 无版本号 key `pkg: ^target`
 * 本函数对 key 形式无感知，按 entries 通用写入（2026-08-09 复盘）。
 *
 * 写入位置与 `overrideTransitiveDependency` 一致：
 * - 存在 `pnpm-workspace.yaml` → 写入其中 `overrides`
 * - 否则 → 写入 `package.json` 的 `pnpm.overrides`
 *
 * 失败时自动回滚被修改的文件和 `pnpm-lock.yaml`。不执行验证（由上层负责）。
 *
 * @param params - 包名、overrides 映射（`pkg@major` 或 `pkg` → `^target`）、工作目录
 * @returns 修复结果（fromVersion 为空字符串，表示多实例无单一来源版本）
 */
export async function applyVersionedOverrides(
    params: {
        packageName: string
        versionedOverrides: Record<string, string>
        workDir: string
    },
): Promise<DependencyFixResult> {
    const { packageName, versionedOverrides, workDir } = params
    const entries = Object.entries(versionedOverrides)
    if (entries.length === 0) {
        return failResult(packageName, '', '', 'no versioned overrides provided')
    }

    const pkgPath = join(workDir, 'package.json')
    const workspaceYamlPath = join(workDir, 'pnpm-workspace.yaml')
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')

    const usesWorkspaceYaml = existsSync(workspaceYamlPath)

    // ---- 1. 读取 package.json ----
    if (!existsSync(pkgPath)) {
        return failResult(packageName, '', '', `${pkgPath}: file not found`)
    }

    let pkg: PackageJson
    try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
    } catch {
        return failResult(packageName, '', '', `${pkgPath}: invalid JSON`)
    }

    // ---- 2. 备份 ----
    const pkgBackup = `${pkgPath}.bak`
    const workspaceBackup = usesWorkspaceYaml ? `${workspaceYamlPath}.bak` : null
    const lockBackup = `${lockfilePath}.bak`

    try {
        copyFileSync(pkgPath, pkgBackup)
        if (usesWorkspaceYaml && workspaceBackup) {
            copyFileSync(workspaceYamlPath, workspaceBackup)
        }
        if (existsSync(lockfilePath)) {
            copyFileSync(lockfilePath, lockBackup)
        }
    } catch {
        return failResult(packageName, '', '', 'failed to create backup files')
    }

    // ---- 3. 记录旧值并写入版本化 overrides ----
    const oldValues = new Map<string, string | undefined>()
    let pkgJsonOverrideWarning: string | undefined

    if (usesWorkspaceYaml) {
        let doc: Record<string, unknown>
        try {
            const raw = readFileSync(workspaceYamlPath, 'utf-8')
            doc = YAML.parse(raw) as Record<string, unknown> ?? {}
        } catch {
            doc = {}
        }
        const overrides = (doc.overrides ?? {}) as Record<string, string>
        for (const [key, target] of entries) {
            oldValues.set(key, overrides[key])
            overrides[key] = target
        }
        doc.overrides = overrides
        writeFileSync(workspaceYamlPath, YAML.stringify(doc), 'utf-8')
    } else {
        const pnpmMajor = detectPnpmMajor(workDir)
        if (pnpmMajor !== null && pnpmMajor >= 10) {
            pkgJsonOverrideWarning = `pnpm v${pnpmMajor} may ignore package.json#pnpm.overrides without pnpm-workspace.yaml — verify the lockfile actually updated; create pnpm-workspace.yaml with the overrides if not`
        }
        const overrides = ensurePnpmOverrides(pkg)
        for (const [key, target] of entries) {
            oldValues.set(key, overrides[key])
            overrides[key] = target
        }
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    }

    // ---- 4. 执行 pnpm install ----
    try {
        await execPnpmInstall(workDir)
    } catch (installErr: unknown) {
        // 回滚 overrides 到旧值（或删除新增 key）
        const restoreOverrides = (map: Record<string, string>): void => {
            for (const [key] of entries) {
                const old = oldValues.get(key)
                if (old === undefined) {
                    delete map[key]
                } else {
                    map[key] = old
                }
            }
        }
        if (usesWorkspaceYaml) {
            try {
                const raw = readFileSync(workspaceYamlPath, 'utf-8')
                const doc = YAML.parse(raw) as Record<string, unknown> ?? {}
                const overrides = (doc.overrides ?? {}) as Record<string, string>
                restoreOverrides(overrides)
                doc.overrides = overrides
                writeFileSync(workspaceYamlPath, YAML.stringify(doc), 'utf-8')
            } catch {
                // 回滚失败时由下方 rollback(workspaceBackup) 兜底
            }
        } else {
            restoreOverrides(ensurePnpmOverrides(pkg))
            writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
        }
        rollback(pkgPath, pkgBackup, lockfilePath, lockBackup)
        if (usesWorkspaceYaml && workspaceBackup) {
            rollback(workspaceYamlPath, workspaceBackup, lockfilePath, null)
        }
        cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })

        const stderr = getStderr(installErr)
        return {
            packageName,
            fromVersion: '',
            toVersion: entries.map((entry) => entry[1]).join(', '),
            isMajor: false,
            success: false,
            error: `pnpm install failed: ${stderr}`,
        }
    }

    // 成功 — 清理备份文件
    cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })

    return {
        packageName,
        fromVersion: '',
        toVersion: entries.map((entry) => entry[1]).join(', '),
        isMajor: false,
        success: true,
        warning: pkgJsonOverrideWarning,
    }
}


// ---------------------------------------------------------------------------
// Exported helpers (for unit testing)
// ---------------------------------------------------------------------------

/**
 * 从版本声明中提取前缀（^ / ~ / 空）。
 *
 * @example
 * extractPrefix('^4.17.20')  // '^'
 * extractPrefix('~4.17.0')   // '~'
 * extractPrefix('4.17.20')   // ''
 * extractPrefix('*')         // '^'  (默认)
 */
export function extractPrefix(version: string): string {
    const trimmed = version.trim()
    if (/^\d/.test(trimmed)) {
        return ''
    }
    if (trimmed.startsWith('^')) {
        return '^'
    }
    if (trimmed.startsWith('~')) {
        return '~'
    }
    // 复杂 range / * / latest → 默认 ^
    return '^'
}

/**
 * 检测版本声明是否包含包管理器协议前缀
 * （`workspace:` / `catalog:` / `link:` / `file:` / `npm:` / `github:` /
 * `gitlab:` / `bitbucket:` / `gist:` / `git:` / `git+ssh:` / `git+https:` /
 * `git+http:` / `git+file:` / `https:` / `ssh:` 等）。
 *
 * 这类声明不是 semver range，`extractPrefix` 会将其误归为 `^` 导致声明被
 * 不可逆改写（如 `catalog:` → `^x.y.z`、`git+ssh:` 来源从 fork/私有源静默
 * 切回 registry），升级前必须拒绝。
 *
 * @example
 * isNonSemverDeclaration('^4.17.20')      // false
 * isNonSemverDeclaration('workspace:*')   // true
 * isNonSemverDeclaration('catalog:')      // true
 * isNonSemverDeclaration('link:../pkg')   // true
 * isNonSemverDeclaration('git+ssh://...') // true
 * isNonSemverDeclaration('gitlab:...')    // true
 * isNonSemverDeclaration('https://...tgz') // true
 */
export function isNonSemverDeclaration(version: string): boolean {
    const trimmed = version.trim()
    return /^(workspace|catalog|link|file|npm|github|gitlab|bitbucket|gist|git(?:\+ssh|\+https|\+http|\+file)?|portal|patch|https?|ssh)\s*:/.test(trimmed)
}

/**
 * 从版本声明中提取主版本号（major）。
 * 去除前缀后匹配第一个 semver 段。
 *
 * @example
 * parseMajorVersion('^4.17.20')   // 4
 * parseMajorVersion('~2.0.0')     // 2
 * parseMajorVersion('1.2.3')      // 1
 * parseMajorVersion('*')          // -1
 */
export function parseMajorVersion(version: string): number {
    const cleaned = version.replace(/^\s*[\^~>=<]*\s*/, '')
    const match = /^(\d+)\.\d+\.\d+/.exec(cleaned)
    return match ? Number.parseInt(match[1], 10) : -1
}

/**
 * 比较两个语义化版本（`x.y.z`，可选 pre-release 后缀）。
 *
 * - `a > b` 返回正数，`a < b` 返回负数，相等返回 0
 * - 非 semver 字符串按 0 处理（保守：不参与大小比较）
 * - 仅比较主/次/补丁段，pre-release 后缀忽略（如 `1.0.0-beta` 视为 `1.0.0`）
 *
 * @example
 * compareSemver('4.18.0', '4.17.21')  // 1
 * compareSemver('5.4.20', '6.4.3')    // -1
 * compareSemver('1.2.3', '1.2.3')     // 0
 */
export function compareSemver(a: string, b: string): number {
    const parse = (v: string): number[] => {
        const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
        return match ? [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10)] : [0, 0, 0]
    }

    const [aMajor, aMinor, aPatch] = parse(a)
    const [bMajor, bMinor, bPatch] = parse(b)

    if (aMajor !== bMajor) {
        return aMajor - bMajor
    }
    if (aMinor !== bMinor) {
        return aMinor - bMinor
    }
    return aPatch - bPatch
}

/**
 * 在 `package.json` 的 `dependencies` / `devDependencies` / `optionalDependencies` 中按顺序查找包。
 */
export function findDependencyVersion(
    pkg: PackageJson,
    packageName: string,
): DependencyInfo | null {
    const groups = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
    for (const group of groups) {
        const deps = pkg[group]
        if (deps && typeof deps === 'object' && packageName in deps) {
            return { group, version: deps[packageName] }
        }
    }
    return null
}

/**
 * 确保 `package.json` 中存在 `pnpm.overrides` 对象，若不存在则创建。
 * 返回 `overrides` 对象的引用，调用方可直接写入。
 */
export function ensurePnpmOverrides(pkg: PackageJson): Record<string, string> {
    if (!pkg.pnpm) {
        pkg.pnpm = {}
    }
    if (!pkg.pnpm.overrides) {
        pkg.pnpm.overrides = {}
    }
    return pkg.pnpm.overrides
}

/**
 * 从 `pnpm-lock.yaml` 中读取指定包的**所有**锁定版本实例。
 *
 * 支持两种 lockfile 键格式：
 * 1. v9 早期格式（lockfileVersion 9.0 起）：`/package-name/version:`
 * 2. pnpm v10+/v11 snapshot 格式：`package-name@version:` 或
 *    `package-name@version(peer@x)(peer2@y):`（peer 后缀条目）
 *
 * 同一包在 lockfile 中可能共存多个版本（如 vite@5.4.14 与 vite@8.2.0），
 * 多版本共存是「版本化 overrides（pkg@version: ^target）」修复策略的前提。
 *
 * @returns 去重后的版本列表（如 `['5.4.14', '8.2.0']`），未找到返回 `[]`
 */
export function readLockfileVersions(lockfilePath: string, packageName: string): string[] {
    if (!existsSync(lockfilePath)) {
        return []
    }

    try {
        const content = readFileSync(lockfilePath, 'utf-8')
        const escapedName = escapeRegExp(packageName)
        const versionCapture = '(\\d+(?:\\.\\d+(?:\\.\\d+)?(?:-[a-zA-Z0-9.]+)?))'
        const versions = new Set<string>()

        // 1. v9 格式：/packageName/version:
        // 包名不转义：fast-uri → /fast-uri/5.0.0:；@babel/traverse → /@babel/traverse/7.26.0:
        // 真实 pnpm v9 lockfile 的 packages 键带两空格缩进（fixtures 曾用列 0 合成数据）
        const v9Pattern = new RegExp(`^\\s*/${escapedName}/${versionCapture}:`, 'gm')
        for (const match of content.matchAll(v9Pattern)) {
            versions.add(match[1])
        }

        // 2. pnpm v10+/v11 snapshot 格式：
        //    - 普通包：pkg@version: 或 pkg@version(peer...):
        //    - scoped 包：'@types/node@26.1.2':（键带单引号，右引号在冒号前）
        //    版本后边界允许 `:` / `(`（peer 后缀）/ `'`（引号键右引号）
        const snapshotPattern = new RegExp(`^\\s*'?${escapedName}@${versionCapture}(?:[(:'])`, 'gm')
        for (const match of content.matchAll(snapshotPattern)) {
            versions.add(match[1])
        }

        return [...versions].sort(compareSemver)
    } catch {
        return []
    }
}

/**
 * 从 `pnpm-lock.yaml` 中读取指定包的当前锁定版本。
 *
 * 多版本并存时（如同一包同时被根与子目录 manifest 引用），取**最高版本**
 * （保守：不降级保护依赖此语义，如根 vite@8.2.0 与 docs vite@5.4.14 并存）。
 *
 * @returns 锁定版本字符串（如 `'5.0.0'`），未找到返回 `null`
 */
export function readLockfileVersion(lockfilePath: string, packageName: string): string | null {
    const versions = readLockfileVersions(lockfilePath, packageName)
    if (versions.length === 0) {
        return null
    }
    // 多版本并存 → 取最高（不降级保护语义）
    return versions[versions.length - 1]
}

/**
 * 读取当前已生效的 pnpm overrides 映射（与写入位置保持一致）：
 * - 存在 `pnpm-workspace.yaml` → 读取其中 `overrides` 字段（pnpm v10+ 推荐位置）
 * - 否则 → 读取 `package.json` 的 `pnpm.overrides`
 *
 * 供 overrides 生成侧协同使用（如 buildVersionedOverrides）：新目标与已有
 * 条目取 max 合并，不丢不改写已有条目（2026-08-09 复盘：此前生成侧不感知
 * 已有条目，导致 `pkg: ^x` 与 `pkg@major: ^y` 并存分裂）。
 *
 * @returns 已有 overrides 映射（key → 版本声明）；无配置或解析失败返回 {}
 */
export function readExistingOverrides(workDir: string): Record<string, string> {
    const workspaceYamlPath = join(workDir, 'pnpm-workspace.yaml')
    try {
        if (existsSync(workspaceYamlPath)) {
            const raw = readFileSync(workspaceYamlPath, 'utf-8')
            const doc = YAML.parse(raw) as Record<string, unknown> ?? {}
            return (doc.overrides ?? {}) as Record<string, string>
        }
        const pkgPath = join(workDir, 'package.json')
        if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
            return (pkg.pnpm?.overrides ?? {}) as Record<string, string>
        }
        return {}
    } catch {
        return {}
    }
}

/**
 * 转义正则表达式特殊字符。
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * 探测当前 pnpm 大版本（pnpm v10+ 对无 `pnpm-workspace.yaml` 的项目
 * 可能不读取 `package.json#pnpm.overrides`，写入会"假成功"）。
 * 探测失败（pnpm 不可用 / 输出异常）返回 null，调用方降级为不告警。
 */
export function detectPnpmMajor(workDir: string): number | null {
    try {
        const raw = execSync('pnpm --version', {
            cwd: workDir,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 10_000,
        })
        const match = /(\d+)\./.exec(raw.trim())
        if (!match) {
            return null
        }
        const major = Number.parseInt(match[1], 10)
        return Number.isInteger(major) ? major : null
    } catch {
        return null
    }
}

/**
 * 跨线修复判定（2026-08-06 复盘 PR #28）。
 *
 * lockfile 告警的推荐版本 major 不在 lockfile 实例 majors 中 → 本仓库没有该
 * 大版本线的实例，且当前线（如 5.x）没有该告警的修复版本（如 GHSA-fx2h
 * 影响 `<= 6.4.2`、first_patched 6.4.3）——只能**跨大版本升级**才能修复。
 *
 * 保持不跨大版本自动升级：此类告警不进入修复链路（不标 fixed/converged），
 * 由上层计入 skipped 并提示用户手动检查/升级/批准。
 *
 * lockfile 中无该包实例（versions 为空）时返回 false——"无实例"场景由
 * partitionSubmanifestAlerts 的常规跳过逻辑处理，避免重复计数。
 */
export function isCrossMajorFixRequired(lockfilePath: string, alert: NormalizedSecurityAlert): boolean {
    const target = alert.recommendedVersion
    if (!target) {
        return false
    }
    const targetMajor = parseMajorVersion(target)
    if (targetMajor === -1) {
        return false
    }
    const versions = readLockfileVersions(lockfilePath, alert.packageName)
    if (versions.length === 0) {
        return false
    }
    return !versions.some((v) => parseMajorVersion(v) === targetMajor)
}

/**
 * 执行 `pnpm install --no-frozen-lockfile`。
 * 将同步 `execSync` 包装为 Promise，使上层 `upgradeDependency` 保持 async 语义。
 */
function execPnpmInstall(workDir: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        try {
            execSync('pnpm install --no-frozen-lockfile', {
                cwd: workDir,
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 120_000, // 2 min
            })
            resolve()
        } catch (err: unknown) {
            reject(err instanceof Error ? err : new Error(String(err)))
        }
    })
}

function failResult(
    packageName: string,
    targetVersion: string,
    fromVersion: string,
    error: string,
): DependencyFixResult {
    return {
        packageName,
        fromVersion,
        toVersion: targetVersion, // 无原始前缀上下文
        isMajor: false,
        success: false,
        error,
    }
}

/**
 * 回滚一次 overrides 写入 + install 的全部变更（复用：install 失败与
 * 生效校验失败共用同一回滚路径，保证"写盘但未生效"也不残留脏状态）。
 */
function rollbackOverrideWrite(params: {
    usesWorkspaceYaml: boolean
    workspaceYamlPath: string
    packageName: string
    oldOverride: string | undefined
    pkg: PackageJson
    pkgPath: string
    pkgBackup: string
    lockfilePath: string
    lockBackup: string
    workspaceBackup: string | null
}): void {
    const {
        usesWorkspaceYaml,
        workspaceYamlPath,
        packageName,
        oldOverride,
        pkg,
        pkgPath,
        pkgBackup,
        lockfilePath,
        lockBackup,
        workspaceBackup,
    } = params
    rollbackOverrides({
        usesWorkspaceYaml,
        workspaceYamlPath,
        packageName,
        oldOverride,
        pkg,
        pkgPath,
    })
    rollback(pkgPath, pkgBackup, lockfilePath, lockBackup)
    if (usesWorkspaceYaml && workspaceBackup) {
        rollback(workspaceYamlPath, workspaceBackup, lockfilePath, null)
    }
    cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })
}

function rollback(
    pkgPath: string,
    pkgBackup: string,
    lockfilePath: string,
    lockBackup: string | null,
): void {
    try {
        if (existsSync(pkgBackup)) {
            copyFileSync(pkgBackup, pkgPath)
        }
        if (lockBackup !== null && existsSync(lockBackup)) {
            copyFileSync(lockBackup, lockfilePath)
        }
    } catch {
        // 回滚失败 → 已写入 result.error，不在此层二次抛异常
    }
}

/**
 * 安全删除备份文件，失败静默忽略。
 */
function safeUnlink(filePath: string): void {
    try {
        if (existsSync(filePath)) {
            unlinkSync(filePath)
        }
    } catch {
        // 静默降级
    }
}

/**
 * 清理所有备份文件。
 */
function cleanupBackups(paths: { pkgBackup: string, lockBackup: string | null, workspaceBackup?: string | null }): void {
    safeUnlink(paths.pkgBackup)
    if (paths.lockBackup !== null) {
        safeUnlink(paths.lockBackup)
    }
    if (paths.workspaceBackup) {
        safeUnlink(paths.workspaceBackup)
    }
}

/**
 * 在 `pnpm-workspace.yaml` 中写入一条 override。
 *
 * 读取现有 YAML → 设置 `overrides[packageName] = version` → 原样写回。
 *
 * @returns 写入前该包的旧值（`undefined` 表示原先不存在该 override）
 */
function writeWorkspaceOverride(
    workspaceYamlPath: string,
    packageName: string,
    version: string,
): string | undefined {
    let doc: Record<string, unknown>

    try {
        const raw = readFileSync(workspaceYamlPath, 'utf-8')
        doc = YAML.parse(raw) as Record<string, unknown> ?? {}
    } catch {
        doc = {}
    }

    const overrides = (doc.overrides ?? {}) as Record<string, string>
    const old = overrides[packageName]
    overrides[packageName] = version
    doc.overrides = overrides

    writeFileSync(workspaceYamlPath, YAML.stringify(doc), 'utf-8')
    return old
}

/**
 * 回滚 override 写入操作。
 *
 * - `pnpm-workspace.yaml` 模式：删除刚写入的条目，或恢复旧值
 * - `package.json` 模式：同理操作 `pkg.pnpm.overrides`
 */
function rollbackOverrides(params: {
    usesWorkspaceYaml: boolean
    workspaceYamlPath: string
    packageName: string
    oldOverride: string | undefined
    pkg: PackageJson
    pkgPath: string
}): void {
    const { usesWorkspaceYaml, workspaceYamlPath, packageName, oldOverride, pkg, pkgPath } = params

    if (usesWorkspaceYaml) {
        try {
            const raw = readFileSync(workspaceYamlPath, 'utf-8')
            const doc = YAML.parse(raw) as Record<string, unknown> ?? {}
            const overrides = (doc.overrides ?? {}) as Record<string, string>

            if (oldOverride === undefined) {
                const next = Object.fromEntries(
                    Object.entries(overrides).filter(([key]) => key !== packageName),
                )
                if (Object.keys(next).length === 0) {
                    delete doc.overrides
                } else {
                    doc.overrides = next
                }
            } else {
                overrides[packageName] = oldOverride
            }

            writeFileSync(workspaceYamlPath, YAML.stringify(doc), 'utf-8')
        } catch {
            // 回滚失败 → 已被 backup 机制覆盖
        }
    } else {
        if (pkg.pnpm?.overrides) {
            const overrides = pkg.pnpm.overrides
            if (oldOverride === undefined) {
                const next = Object.fromEntries(
                    Object.entries(overrides).filter(([key]) => key !== packageName),
                )
                if (Object.keys(next).length === 0) {
                    delete pkg.pnpm.overrides
                    if (Object.keys(pkg.pnpm).length === 0) {
                        delete pkg.pnpm
                    }
                } else {
                    pkg.pnpm.overrides = next
                }
            } else {
                overrides[packageName] = oldOverride
            }
        }
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    }
}

function getStderr(err: unknown): string {
    if (err instanceof Error && 'stderr' in err) {
        const stderr = (err as Error & { stderr: unknown }).stderr
        if (typeof stderr === 'string') {
            return stderr.trim()
        }
        if (Buffer.isBuffer(stderr)) {
            return stderr.toString('utf-8').trim()
        }
        return typeof stderr === 'object' && stderr !== null ? JSON.stringify(stderr) : String(stderr)
    }
    if (err instanceof Error) {
        return err.message
    }
    return typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err)
}
