import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpgradeDependencyParams {
    /** 包名（如 `'lodash'`, `'@babel/traverse'`） */
    packageName: string
    /** 目标精确版本（如 `'4.17.21'`） */
    targetVersion: string
    /** 工作目录（包含 `package.json` 和 `pnpm-lock.yaml`） */
    workDir: string
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
 * - 在 `workDir` 中查找 `package.json` 并修改目标包的版本声明（保留原始前缀）
 * - 执行 `pnpm install --no-frozen-lockfile` 更新 lockfile
 * - 失败时自动回滚 `package.json` 和 `pnpm-lock.yaml`
 * - 不执行验证（由 T107 负责）
 *
 * @param params - 包名、目标版本、工作目录
 * @returns 修复结果
 */
export async function upgradeDependency(
    params: UpgradeDependencyParams,
): Promise<DependencyFixResult> {
    const { packageName, targetVersion, workDir } = params
    const pkgPath = join(workDir, 'package.json')
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
 * 失败时自动回滚被修改的文件和 `pnpm-lock.yaml`。不执行验证（由 T107 负责）。
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
        if (usesWorkspaceYaml) {
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

    if (usesWorkspaceYaml) {
        oldOverride = writeWorkspaceOverride(workspaceYamlPath, packageName, toVersion)
    } else {
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
        rollbackOverrides({
            usesWorkspaceYaml,
            workspaceYamlPath,
            packageName,
            oldOverride,
            pkg,
            pkgPath,
        })
        rollback(pkgPath, pkgBackup, lockfilePath, lockBackup)
        if (usesWorkspaceYaml) {
            rollback(workspaceYamlPath, workspaceBackup, lockfilePath, null)
        }

        // 回滚后清理备份
        cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })

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
 * 从 `pnpm-lock.yaml` 中读取指定包的当前锁定版本。
 * 通过简单的正则匹配查找，不解析完整 YAML（性能优先）。
 *
 * 支持两种 lockfile 键格式：
 * 1. v9 早期格式（lockfileVersion 9.0 起）：`/package-name/version:`
 * 2. pnpm v10+/v11 snapshot 格式：`package-name@version:` 或
 *    `package-name@version(peer@x)(peer2@y):`（peer 后缀条目）
 *
 * 多版本并存时（如同一包同时被根与子目录 manifest 引用），取**最高版本**
 * （保守：不降级保护依赖此语义，如根 vite@8.2.0 与 docs vite@5.4.14 并存）。
 *
 * @returns 锁定版本字符串（如 `'5.0.0'`），未找到返回 `null`
 */
export function readLockfileVersion(lockfilePath: string, packageName: string): string | null {
    if (!existsSync(lockfilePath)) {
        return null
    }

    try {
        const content = readFileSync(lockfilePath, 'utf-8')
        const escapedName = escapeRegExp(packageName)
        const versionCapture = '(\\d+(?:\\.\\d+(?:\\.\\d+)?(?:-[a-zA-Z0-9.]+)?))'

        // 1. v9 格式：/packageName/version:
        // 包名不转义：fast-uri → /fast-uri/5.0.0:；@babel/traverse → /@babel/traverse/7.26.0:
        const v9Pattern = new RegExp(`^/${escapedName}/${versionCapture}:`, 'm')
        const v9Match = v9Pattern.exec(content)
        if (v9Match) {
            return v9Match[1]
        }

        // 2. pnpm v10+/v11 snapshot 格式：
        //    - 普通包：pkg@version: 或 pkg@version(peer...):
        //    - scoped 包：'@types/node@26.1.2':（键带单引号，右引号在冒号前）
        //    版本后边界允许 `:` / `(`（peer 后缀）/ `'`（引号键右引号）
        const snapshotPattern = new RegExp(`^\\s*'?${escapedName}@${versionCapture}(?:[(:'])`, 'gm')
        const versions: string[] = []
        for (const match of content.matchAll(snapshotPattern)) {
            versions.push(match[1])
        }
        if (versions.length === 0) {
            return null
        }
        // 多版本并存 → 取最高（不降级保护语义）
        versions.sort(compareSemver)
        return versions[versions.length - 1]
    } catch {
        return null
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
