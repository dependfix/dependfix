import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import YAML from 'yaml'
import type { DependencyFixResult, PackageJson } from './index'

// ---------------------------------------------------------------------------
// pnpm overrides 写入 / 回滚 / 备份 的文件 IO 组
//
// 本组函数为 dependency/index.ts 升级链路的内部实现（不在 engine 公共
// 入口 re-export），供"写入 overrides → install → 失败回滚 → 清理备份"
// 各阶段复用。拆分动机：dependency/index.ts 文件行数治理（max-lines 800），
// 本组与核心升级逻辑无耦合，独立成文件后 index.ts 收敛到行数限制内。
// ---------------------------------------------------------------------------

/**
 * 执行 `pnpm install --no-frozen-lockfile`。
 * 将同步 `execSync` 包装为 Promise，使上层 `upgradeDependency` 保持 async 语义。
 */
export function execPnpmInstall(workDir: string): Promise<void> {
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

export function failResult(
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
export function rollbackOverrideWrite(params: {
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

export function rollback(
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
export function cleanupBackups(paths: { pkgBackup: string, lockBackup: string | null, workspaceBackup?: string | null }): void {
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
export function writeWorkspaceOverride(
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

export function getStderr(err: unknown): string {
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

// ---------------------------------------------------------------------------
// pnpm install 失败原因识别
// ---------------------------------------------------------------------------

/**
 * `pnpm install` stderr 中的已知失败特征 → 可读提示。
 * 当前覆盖：minimumReleaseAge 冷却期约束（目标仓库显式配置该策略时 strict 模式生效，
 * 解析报 ERR_PNPM_NO_MATURE_MATCHING_VERSION、frozen 校验报 ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION）。
 * 未识别时返回 null，调用方保留原始 stderr。
 */
const INSTALL_FAILURE_HINTS: [RegExp, string][] = [
    [
        /ERR_PNPM_NO_MATURE_MATCHING_VERSION|ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION|minimumReleaseAge/i,
        'target repo has a minimumReleaseAge policy; the upgrade target version is too fresh (cooldown not elapsed). Retry after the cooldown period, or relax the policy',
    ],
]

/** 识别 `pnpm install` 失败原因，未识别返回 null。 */
export function classifyInstallFailure(stderr: string): string | null {
    for (const [pattern, hint] of INSTALL_FAILURE_HINTS) {
        if (pattern.test(stderr)) {
            return hint
        }
    }
    return null
}

/**
 * 格式化 `pnpm install` 失败错误信息：识别到已知原因时附加可读提示。
 * 供升级链路各 catch 块统一使用（upgradeDependency / overrideTransitiveDependency /
 * applyVersionedOverrides），避免三处重复匹配逻辑。
 */
export function formatInstallFailure(stderr: string): string {
    const hint = classifyInstallFailure(stderr)
    return hint ? `pnpm install failed: ${hint}: ${stderr}` : `pnpm install failed: ${stderr}`
}
