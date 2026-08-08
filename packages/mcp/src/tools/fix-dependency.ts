import { overrideTransitiveDependency, repairLockfile, upgradeDependency, type LockfileDiff } from 'dependfix'

/** `fix_dependency` 返回结构（按 fixType 判别） */
export type FixDependencyResult =
    | {
        ok: true
        fixType: 'override' | 'direct'
        packageName: string
        fromVersion: string
        toVersion: string
        isMajor: boolean
        warning?: string
    }
    | {
        ok: true
        fixType: 'lockfile'
        strategy?: string
        diff?: LockfileDiff | null
        lockfileVersion?: string
        lockfileVersionChanged?: boolean
    }
    | {
        ok: false
        fixType: 'override' | 'direct' | 'lockfile'
        packageName?: string
        fromVersion?: string
        toVersion?: string
        isMajor?: boolean
        error: string
    }

/**
 * `fix_dependency`：修复单个依赖或 lockfile（按 `fix_type` 分发，复用 cli fixers）：
 * - `override`（默认）：间接依赖 → `overrideTransitiveDependency`（写入 pnpm overrides）
 * - `direct`：直接依赖 → `upgradeDependency`（改写 manifest + `pnpm install`，失败回滚）
 * - `lockfile`：frozen-lockfile 漂移 → `repairLockfile`（策略链修复，全部失败回滚）
 * 均需本地已 clone 的仓库目录（workDir）。
 */
export const fixDependency = async (input: {
    workDir: string
    fix_type?: 'override' | 'direct' | 'lockfile'
    packageName?: string
    targetVersion?: string
}): Promise<FixDependencyResult> => {
    const fixType = input.fix_type ?? 'override'
    try {
        switch (fixType) {
            case 'lockfile': {
                const result = repairLockfile({ workDir: input.workDir })
                return {
                    ok: result.success,
                    fixType: 'lockfile',
                    strategy: result.strategy,
                    diff: result.diff ?? null,
                    lockfileVersion: result.lockfileVersion,
                    lockfileVersionChanged: result.lockfileVersionChanged,
                    error: result.success ? undefined : (result.failureDetail ?? 'lockfile repair failed'),
                }
            }
            case 'direct': {
                if (!input.packageName || !input.targetVersion) {
                    return { ok: false, fixType: 'direct', error: 'packageName 与 targetVersion 必填（fix_type=direct）' }
                }
                const result = await upgradeDependency({
                    packageName: input.packageName,
                    targetVersion: input.targetVersion,
                    workDir: input.workDir,
                })
                return {
                    ok: result.success,
                    fixType: 'direct',
                    packageName: result.packageName,
                    fromVersion: result.fromVersion,
                    toVersion: result.toVersion,
                    isMajor: result.isMajor,
                    warning: result.warning,
                    error: result.error,
                }
            }
            case 'override': {
                if (!input.packageName || !input.targetVersion) {
                    return { ok: false, fixType: 'override', error: 'packageName 与 targetVersion 必填（fix_type=override）' }
                }
                const result = await overrideTransitiveDependency({
                    packageName: input.packageName,
                    targetVersion: input.targetVersion,
                    workDir: input.workDir,
                })
                return {
                    ok: result.success,
                    fixType: 'override',
                    packageName: result.packageName,
                    fromVersion: result.fromVersion,
                    toVersion: result.toVersion,
                    isMajor: result.isMajor,
                    warning: result.warning,
                    error: result.error,
                }
            }
        }
    } catch (error) {
        return {
            ok: false,
            fixType,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
