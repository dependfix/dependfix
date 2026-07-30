import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
            return { group, version: String(deps[packageName]) }
        }
    }
    return null
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
            // eslint-disable-next-line @typescript-eslint/no-base-to-string -- catch-all for unexpected non-Error throwables
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
    lockBackup: string,
): void {
    try {
        if (existsSync(pkgBackup)) {
            copyFileSync(pkgBackup, pkgPath)
        }
        if (existsSync(lockBackup)) {
            copyFileSync(lockBackup, lockfilePath)
        }
    } catch {
        // 回滚失败 → 已写入 result.error，不在此层二次抛异常
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
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- catch-all for unknown error shapes
        return typeof stderr === 'object' && stderr !== null ? JSON.stringify(stderr) : String(stderr)
    }
    if (err instanceof Error) {
        return err.message
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- catch-all for unknown error types
    return typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err)
}
