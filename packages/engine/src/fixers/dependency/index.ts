import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import {
    cleanupBackups,
    execPnpmInstall,
    failResult,
    formatInstallFailure,
    describeInstallError,
    isInstallEnvironmentalFailure,
    rollback,
    rollbackOverrideWrite,
    writeWorkspaceOverride,
    type VersionedOverridesApplyResult,
    type VersionedOverridesPlan,
} from './overrides-io'

export type { VersionedOverridesApplyResult, VersionedOverridesPlan } from './overrides-io'
import { upsertOverride } from './override-key'
import { parseMajorVersion } from './semver'
import { readLockfileVersion, readLockfileVersions } from './lockfile-versions'
import { remainingVersionsBelowTarget, classifyPeerOnlyFailure, verifyVersionedOverridesAppliedAll } from './override-verification'
import { ensurePnpmOverrides, extractPrefix, findDependencyVersion, type PackageJson } from './manifest'
import { applyManifestUpgrades, type ManifestUpgradeApplied } from './manifest-upgrades'
import { applyWorkspaceOverrides, readOverridesSection, readWorkspaceDocument, rollbackWorkspaceOverrides } from './workspace-yaml'

export { normalizeOverrideKey, normalizeOverrideSelector, upsertOverride } from './override-key'
export { compareSemver, isNonSemverDeclaration, parseMajorVersion } from './semver'
export { readLockfileVersion, readLockfileVersions } from './lockfile-versions'
export type { OverrideUpsert } from './override-key'
export { ensurePnpmOverrides, extractPrefix, findDependencyVersion, type PackageJson } from './manifest'
export type { ManifestUpgradeApplied } from './manifest-upgrades'

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
    /**
     * 失败是否由安装环境问题导致（信号终止 / 超时 / 无 stderr 诊断）。
     * 调用方据此停止后续安装尝试——同一环境下逐包重试只会重复失败并耗尽运行预算。
     */
    environmental?: boolean
    /**
     * 无法自动修复、需人工处置（当前仅 peer-only 实例）。已回滚，调用方应记跳过而非失败动作。
     */
    manualReview?: boolean
}

/** 家族锁步升级结果：`updates` 在安装失败时也保留已尝试的声明，便于报告展示。 */
export interface FamilyUpgradeDependenciesResult {
    success: boolean
    updates: ManifestUpgradeApplied[]
    error?: string
    environmental?: boolean
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
    const outcome = await applyManifestUpgrades({
        workDir,
        manifestDir,
        requests: [{ packageName, targetVersion }],
    })
    const applied = outcome.updates[0]

    if (!outcome.success) {
        // 校验类早退（未写盘）保留既有 `toVersion` 口径：目标版本裸串（无原前缀）
        const error = outcome.error ?? 'unknown error'
        return applied && outcome.failurePhase === 'install'
            ? {
                packageName,
                fromVersion: applied.fromVersion,
                toVersion: applied.toVersion,
                isMajor: applied.isMajor,
                success: false,
                error,
                ...(outcome.environmental !== undefined ? { environmental: outcome.environmental } : {}),
            }
            : failResult(packageName, targetVersion, applied?.fromVersion ?? '', error)
    }

    return {
        packageName,
        fromVersion: applied.fromVersion,
        toVersion: applied.toVersion,
        isMajor: applied.isMajor,
        success: true,
    }
}

/**
 * 家族锁步升级：一次写盘 + 一次安装，失败整体回滚（含 lockfile）。
 *
 * 与 [upgradeDependency] 的区别只有写盘条数：族成员的 manifest 声明全部改完再执行
 * 一次 `pnpm install`，任一成员校验失败 / 安装失败 / 回滚失败都按「整族失败」返回，
 * 不产生半族状态。成员清单由 [planFamilyUpgrade] 决定（含触发包）。
 *
 * @param params - 工作目录、可选成员目录、待写盘成员（包名 + 目标版本）
 */
export async function upgradeFamilyDependencies(
    params: {
        workDir: string
        manifestDir?: string
        updates: ReadonlyArray<{ packageName: string, targetVersion: string }>
    },
): Promise<FamilyUpgradeDependenciesResult> {
    const { workDir, manifestDir, updates } = params
    if (updates.length === 0) {
        return { success: false, updates: [], error: 'no family member updates provided' }
    }
    const outcome = await applyManifestUpgrades({
        workDir,
        manifestDir,
        requests: updates.map((update) => ({ packageName: update.packageName, targetVersion: update.targetVersion })),
    })
    return {
        success: outcome.success,
        updates: outcome.updates,
        ...(outcome.error !== undefined ? { error: outcome.error } : {}),
        ...(outcome.environmental !== undefined ? { environmental: outcome.environmental } : {}),
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
    // 实际写入的 override key：归一化可能命中既有写法（`vite@1` → `vite@^1`），回滚必须用实际 key
    let overrideKey = packageName
    // 无 workspace.yaml 且 pnpm v10+ → package.json overrides 可能被忽略（假成功风险）
    let pkgJsonOverrideWarning: string | undefined

    if (usesWorkspaceYaml) {
        const writeResult = writeWorkspaceOverride(workspaceYamlPath, packageName, toVersion)
        if (!writeResult.ok) {
            cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })
            return failResult(
                packageName,
                targetVersion,
                fromVersion,
                `pnpm-workspace.yaml kept unchanged: ${writeResult.error ?? 'unknown write failure'}`,
            )
        }
        oldOverride = writeResult.oldValue
        overrideKey = writeResult.key ?? packageName
    } else {
        const pnpmMajor = detectPnpmMajor(workDir)
        if (pnpmMajor !== null && pnpmMajor >= 10) {
            pkgJsonOverrideWarning = `pnpm v${pnpmMajor} may ignore package.json#pnpm.overrides without pnpm-workspace.yaml — if the lockfile does not update to >= ${targetVersion}, create pnpm-workspace.yaml with the override instead`
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
            overrideKey,
            oldOverride,
            pkg,
            pkgPath,
            pkgBackup,
            lockfilePath,
            lockBackup,
            workspaceBackup,
        })

        const installFailure = describeInstallError(installErr)
        return {
            packageName,
            fromVersion,
            toVersion,
            isMajor,
            success: false,
            error: formatInstallFailure(installFailure),
            environmental: isInstallEnvironmentalFailure(installErr),
        }
    }

    // ---- 7.5 生效校验：所有 override 写入路径（含 pnpm-workspace.yaml）——
    // install 后回读**全部**锁定实例；只要仍有实例低于目标，就判定 override 未生效：
    // 回滚 + 报错。不能只看最高版本：通用 override 已存在、但被路径级规则压过时，
    // pnpm install 可能认为 lockfile 已最新而不重解析（2026-10-18 cmyr-skills-agents
    // undici 7.28.0 实证：日志报升级成功、实际无 diff、commit 被跳过）。
    const remaining = remainingVersionsBelowTarget(lockfilePath, packageName, targetVersion)
    if (remaining.length > 0) {
        rollbackOverrideWrite({
            usesWorkspaceYaml,
            workspaceYamlPath,
            packageName,
            overrideKey,
            oldOverride,
            pkg,
            pkgPath,
            pkgBackup,
            lockfilePath,
            lockBackup,
            workspaceBackup,
        })
        // peer-only 实例不随 overrides 重解析：给出可判定的人工处置结论，不记为失败动作
        const peerOnly = classifyPeerOnlyFailure(lockfilePath, packageName, remaining)
        return {
            packageName,
            fromVersion,
            toVersion,
            isMajor,
            success: false,
            ...(peerOnly ? { manualReview: true } : {}),
            error: peerOnly
                ? `manual review: peer-only instances do not follow pnpm overrides — locked instance(s) ${remaining.join(', ')} remain below ${targetVersion}; changes rolled back`
                : `override did not take effect: locked instance(s) ${remaining.join(', ')} remain below ${targetVersion}`
                    + `${pkgJsonOverrideWarning ? ` (${pkgJsonOverrideWarning})` : ''}; changes rolled back`,
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
/**
 * 批量应用版本化 overrides：**一次写盘 + 一次安装**，失败整体回滚（含 lockfile）。
 * 动机：逐包应用使单仓安装次数 = 可修包数（实测大仓 7–8 次），是资源受限主机 OOM 的放大器之一；
 * [applyVersionedOverrides] 为单包薄包装，与本函数共用实现。调用方应过滤 `overrides` 为空的条目。
 */
export async function applyVersionedOverridesBatch(
    params: {
        workDir: string
        plans: VersionedOverridesPlan[]
    },
): Promise<VersionedOverridesApplyResult> {
    const { workDir, plans } = params
    if (plans.length === 0) {
        return { success: false, error: 'no versioned overrides provided', failurePhase: 'precheck' }
    }

    const pkgPath = join(workDir, 'package.json')
    const workspaceYamlPath = join(workDir, 'pnpm-workspace.yaml')
    const lockfilePath = join(workDir, 'pnpm-lock.yaml')

    const usesWorkspaceYaml = existsSync(workspaceYamlPath)

    // 写入前的锁定版本快照（From 列展示用）：仅单包路径消费（合批动作的 From 由调用方按包传入，
    // 见 `VersionedOverrideBatchItem.fromVersion`）；多包时不重复读整份 lockfile
    const fromVersionSnapshot = plans.length === 1
        ? readLockfileVersions(lockfilePath, plans[0].packageName).join(', ')
        : ''

    // ---- 1. 读取 package.json ----
    if (!existsSync(pkgPath)) {
        return { success: false, error: `${pkgPath}: file not found`, failurePhase: 'precheck' }
    }

    let pkg: PackageJson
    try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson
    } catch {
        return { success: false, error: `${pkgPath}: invalid JSON`, failurePhase: 'precheck' }
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
        return { success: false, error: 'failed to create backup files', failurePhase: 'precheck' }
    }

    // ---- 3. 记录旧值并写入版本化 overrides ----
    // 语义等价 key 复用已有写法（如已有 `pkg@^1` 时不再新增 `pkg@1`，见 override-key.ts）
    const oldValues = new Map<string, string | undefined>()
    const writtenKeys = new Set<string>()
    let pkgJsonOverrideWarning: string | undefined

    if (usesWorkspaceYaml) {
        // 定点编辑：只改目标键（保留注释 / 引号风格 / 键序）；解析失败不落盘
        const updates = plans.flatMap((plan) => Object.entries(plan.overrides).map(([key, value]) => ({ key, value })))
        const writeResult = applyWorkspaceOverrides(workspaceYamlPath, updates)
        if (!writeResult.ok) {
            cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })
            return {
                success: false,
                error: `pnpm-workspace.yaml kept unchanged: ${writeResult.error ?? 'unknown write failure'}`,
                failurePhase: 'precheck',
            }
        }
        for (const [key, oldValue] of writeResult.applied) {
            oldValues.set(key, oldValue)
            writtenKeys.add(key)
        }
    } else {
        const pnpmMajor = detectPnpmMajor(workDir)
        if (pnpmMajor !== null && pnpmMajor >= 10) {
            pkgJsonOverrideWarning = `pnpm v${pnpmMajor} may ignore package.json#pnpm.overrides without pnpm-workspace.yaml — verify the lockfile actually updated; create pnpm-workspace.yaml with the overrides if not`
        }
        const overrides = ensurePnpmOverrides(pkg)
        for (const plan of plans) {
            for (const [key, target] of Object.entries(plan.overrides)) {
                const { key: actualKey, oldValue } = upsertOverride(overrides, key, target)
                if (!oldValues.has(actualKey)) {
                    oldValues.set(actualKey, oldValue)
                }
                writtenKeys.add(actualKey)
            }
        }
        writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    }

    // ---- 4. 执行 pnpm install（单次；失败整体回滚） ----
    try {
        await execPnpmInstall(workDir)
    } catch (installErr: unknown) {
        // 回滚 overrides 到旧值（或删除新增 key）。
        // 不可变重建（避免动态 delete）：本次新增的 key（旧值 undefined）剔除，
        // 既有 key 恢复旧值，其余保留原样。
        const restoreOverrides = (map: Record<string, string>): Record<string, string> => {
            const removed = new Set(
                [...writtenKeys].filter((key) => oldValues.get(key) === undefined),
            )
            const next: Record<string, string> = {}
            for (const [key, value] of Object.entries(map)) {
                if (removed.has(key)) {
                    continue
                }
                const old = oldValues.get(key)
                next[key] = old !== undefined ? old : value
            }
            return next
        }
        // 备份还原为权威路径（字节级）；仅在备份缺失 / 复制失败时退回内存 / 定点恢复，
        // 避免兜底路径自身出错时连带跳过还原与备份清理（留下脏写与 `.bak`）。
        const pkgRestored = rollback(pkgPath, pkgBackup, lockfilePath, lockBackup)
        const workspaceRestored = usesWorkspaceYaml
            ? workspaceBackup !== null && rollback(workspaceYamlPath, workspaceBackup, lockfilePath, null)
            : true
        if (!pkgRestored && !usesWorkspaceYaml) {
            const pnpm = pkg.pnpm ?? {}
            pnpm.overrides = restoreOverrides(pnpm.overrides ?? {})
            try {
                writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
            } catch {
                // 备份已缺失：尽最大努力，失败不再二次抛错（保持原有「回滚不中断」语义）
            }
        }
        if (usesWorkspaceYaml && !workspaceRestored) {
            rollbackWorkspaceOverrides(workspaceYamlPath, oldValues)
        }
        cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })

        return {
            success: false,
            error: formatInstallFailure(describeInstallError(installErr)),
            failurePhase: 'install',
            environmental: isInstallEnvironmentalFailure(installErr),
        }
    }

    // ---- 5. 生效校验：回读 lockfile，确认每条 override 覆盖的实例都达到目标 ----
    // 与单包 override 同族：pnpm install 成功 ≠ override 真正生效（已存在 / 被更具体规则压过时
    // lockfile 可能保持旧版本）。未满足则整体回滚，不能把「无改动」当成功。
    const verifyFailures = verifyVersionedOverridesAppliedAll(lockfilePath, plans)
    if (verifyFailures.length > 0) {
        rollback(pkgPath, pkgBackup, lockfilePath, lockBackup)
        if (usesWorkspaceYaml && workspaceBackup) {
            rollback(workspaceYamlPath, workspaceBackup, lockfilePath, null)
        }
        cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })
        // 逐 plan 归因：peer-only 包与普通失败分开（合批只跳过前者，其余逐包重试）
        // 包级归因：只有该包**全部**失败项都是 peer-only 时才整包记人工处置；
        // 同包混合版本线（pkg@4 peer + pkg@5 直接实例未达标）仍走逐包重试，避免静默放弃可修实例
        const peerOnlyPackages = [...new Set(
            verifyFailures.filter((failure) => failure.peerOnly).map((failure) => failure.packageName),
        )].filter((packageName) => verifyFailures
            .filter((failure) => failure.packageName === packageName)
            .every((failure) => failure.peerOnly))
        const firstNonPeer = verifyFailures.find((failure) => !failure.peerOnly)
        const manualReview = firstNonPeer === undefined
        // 披露同包父级 scoped 键：被 `parent>pkg` 遮蔽时不能只留一句「未生效」
        const scopedHint = describeScopedOverrides(workDir, plans.map((plan) => plan.packageName))
        const failureHead = manualReview
            ? `manual review: peer-only instances do not follow pnpm overrides — ${verifyFailures.map((failure) => failure.message).join('; ')}`
            : `versioned override did not take effect: ${firstNonPeer.message}`
        return {
            success: false,
            fromVersion: fromVersionSnapshot,
            ...(manualReview ? { manualReview: true } : {}),
            ...(peerOnlyPackages.length > 0 ? { manualReviewPackages: peerOnlyPackages } : {}),
            error: `${failureHead}${scopedHint}; changes rolled back`,
            failurePhase: 'verify',
        }
    }

    // 成功 — 清理备份文件
    cleanupBackups({ pkgBackup, lockBackup, workspaceBackup })

    return { success: true, warning: pkgJsonOverrideWarning, fromVersion: fromVersionSnapshot }
}

/**
 * 应用单个包的版本化 overrides（内部委托 [applyVersionedOverridesBatch]）。
 * 写入位置：有 `pnpm-workspace.yaml` 时写其 `overrides`，否则写 `package.json#pnpm.overrides`；
 * 失败自动回滚（含 lockfile），不执行验证（由上层负责）。
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

    const result = await applyVersionedOverridesBatch({
        workDir,
        plans: [{ packageName, overrides: versionedOverrides }],
    })

    // toVersion 口径保持既有语义：校验 / 备份类早退（未写盘）为空串，安装失败与成功为目标版本串
    const toVersion = result.success || result.failurePhase === 'install'
        ? entries.map((entry) => entry[1]).join(', ')
        : ''

    return {
        packageName,
        fromVersion: result.fromVersion ?? '',
        toVersion,
        isMajor: false,
        success: result.success,
        ...(result.error !== undefined ? { error: result.error } : {}),
        ...(result.warning !== undefined ? { warning: result.warning } : {}),
        ...(result.environmental !== undefined ? { environmental: result.environmental } : {}),
        ...(result.manualReview !== undefined ? { manualReview: result.manualReview } : {}),
    }
}


/**
 * 列出现存 `parent>pkg` 形式的 scoped override 键（段尾包名命中目标包）。
 *
 * 供生效校验失败消息披露「被哪条 scoped 规则遮蔽」：`buildVersionedOverrides` 只改写
 * 有对应版本线目标的键，缺失线 / 无法比较的键会保持原样并导致实例不重解析。
 */
function describeScopedOverrides(workDir: string, packageNames: readonly string[]): string {
    const existing = readExistingOverrides(workDir)
    const hits = Object.keys(existing).filter((key) => {
        if (!key.includes('>')) {
            return false
        }
        const last = key.trim().split('>').pop()?.trim() ?? ''
        const atIndex = last.startsWith('@') ? last.indexOf('@', 1) : last.indexOf('@')
        const pkg = atIndex > 0 ? last.slice(0, atIndex) : last
        return packageNames.includes(pkg)
    })
    return hits.length > 0 ? `; existing scoped overrides: ${hits.join(', ')}` : ''
}

// ---------------------------------------------------------------------------
// Exported helpers (for unit testing)
// ---------------------------------------------------------------------------

/**
 * 读取当前已生效的 pnpm overrides 映射（与写入位置保持一致）：
 * - 存在 `pnpm-workspace.yaml` → 读取其中 `overrides` 字段（pnpm v10+ 推荐位置）
 * - 否则 → 读取 `package.json` 的 `pnpm.overrides`
 *
 * 供 overrides 生成侧协同使用（如 buildVersionedOverrides）：新目标与已有
 * 条目取 max 合并，不丢不改写已有条目（2026-08-09 复盘：此前生成侧不感知
 * 已有条目，导致 `pkg: ^x` 与 `pkg@major: ^y` 并存分裂）。
 *
 * @returns 已有 overrides 映射（key → 版本声明）；无配置、解析失败或 `overrides` 形态非法返回 {}
 */
export function readExistingOverrides(workDir: string): Record<string, string> {
    const workspaceYamlPath = join(workDir, 'pnpm-workspace.yaml')
    try {
        if (existsSync(workspaceYamlPath)) {
            // 与写入侧同一校验口径：非映射 / 非标量 / 别名文档一律按「无既有 overrides」处理
            const parsed = readWorkspaceDocument(workspaceYamlPath)
            if (!parsed.ok) {
                return {}
            }
            return readOverridesSection(parsed.doc) ?? {}
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
