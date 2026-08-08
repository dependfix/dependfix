import { overrideTransitiveDependency } from 'dependfix'

/** `fix_dependency` 返回结构 */
export type FixDependencyResult =
    | {
        ok: true
        packageName: string
        fromVersion: string
        toVersion: string
        isMajor: boolean
        warning?: string
    }
    | {
        ok: false
        packageName?: string
        fromVersion?: string
        toVersion?: string
        isMajor?: boolean
        error: string
    }

/**
 * `fix_dependency`：修复单个间接依赖（写入 pnpm overrides）。
 * 需要本地已 clone 的仓库目录（workDir），操作 package.json/pnpm-workspace.yaml/pnpm-lock.yaml。
 */
export const fixDependency = async (input: { workDir: string, packageName: string, targetVersion: string }): Promise<FixDependencyResult> => {
    try {
        const result = await overrideTransitiveDependency({
            packageName: input.packageName,
            targetVersion: input.targetVersion,
            workDir: input.workDir,
        })
        return {
            ok: result.success,
            packageName: result.packageName,
            fromVersion: result.fromVersion,
            toVersion: result.toVersion,
            isMajor: result.isMajor,
            warning: result.warning ?? undefined,
            error: result.error ?? undefined,
        }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
