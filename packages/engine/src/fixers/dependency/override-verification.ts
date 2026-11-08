// override-verification.ts — override 写入后的 lockfile 生效校验。
//
// 背景（2026-10-18 生产复盘）：`pnpm install` 成功 ≠ override 真正生效。通用 override 已存在、
// 但被更具体的路径级规则压过时，pnpm 可能认为 lockfile 已最新而不重解析，日志报「升级成功」
// 但实际无 diff（cmyr-skills-agents undici 7.28.0 实证）。校验必须回读**全部**锁定实例，
// 不能只看最高版本。
import type { VersionedOverridesPlan } from './overrides-io'
import { readLockfileVersions, scanPeerOnlyInstances } from './lockfile-versions'
import { compareSemver, parseMajorVersion } from './semver'

/**
 * 生效校验失败的结构化结果。
 *
 * `peerOnly` 为真时表示未达标实例全部只以 peer 后缀形态存在——pnpm 写入 override 后
 * 只改 `peerDependencies` 的 range、不重解析已锁定实例，属「无法通过 overrides 自动修复」，
 * 上层应给出人工处置结论而不是把它记成失败动作。
 */
export interface OverrideVerificationFailure {
    /** 未达标的包名 */
    packageName: string
    message: string
    peerOnly: boolean
}

/**
 * 逐 plan 返回全部未达标项（不短路）。
 *
 * 合批路径需要「哪些包是不可自动修复的 peer-only、哪些包只是普通失败」的完整集合，
 * 才能只对 peer-only 包记跳过、其余走逐包重试（不能用一个布尔代表整批）。
 */
export function verifyVersionedOverridesAppliedAll(
    lockfilePath: string,
    plans: VersionedOverridesPlan[],
): OverrideVerificationFailure[] {
    const failures: OverrideVerificationFailure[] = []
    for (const plan of plans) {
        const versions = readLockfileVersions(lockfilePath, plan.packageName)
        if (versions.length === 0) {
            continue
        }
        for (const [key, range] of Object.entries(plan.overrides)) {
            if (key.includes('>')) {
                continue
            }
            const target = extractTargetVersion(range)
            if (!target) {
                continue
            }
            const selector = key.startsWith(`${plan.packageName}@`)
                ? key.slice(plan.packageName.length + 1)
                : undefined
            const selectorMajor = selector === undefined
                ? undefined
                : Number(/^[^\d]*(\d+)/.exec(selector)?.[1])
            const covered = selectorMajor === undefined || Number.isNaN(selectorMajor)
                ? versions
                : versions.filter((version) => parseMajorVersion(version) === selectorMajor)
            const remaining = covered.filter((version) => compareSemver(version, target) < 0)
            if (remaining.length > 0) {
                failures.push({
                    packageName: plan.packageName,
                    message: `${plan.packageName}: ${remaining.join(', ')} remain below ${target}`,
                    peerOnly: classifyPeerOnlyFailure(lockfilePath, plan.packageName, remaining),
                })
            }
        }
    }
    return failures
}

/**
 * `verifyVersionedOverridesApplied` 的结构化版本：返回首个失败项（含 `peerOnly` 归因）。
 *
 * 判定与逐条比较逻辑与旧实现完全一致（版本化 key 只校验同 major、路径级 key 跳过、
 * 无法提取版本号时视为通过）。
 */
export function verifyVersionedOverridesAppliedDetailed(
    lockfilePath: string,
    plans: VersionedOverridesPlan[],
): OverrideVerificationFailure | undefined {
    return verifyVersionedOverridesAppliedAll(lockfilePath, plans)[0]
}

/**
 * 剩余未达标实例是否可全部归因为 peer-only 形态。
 *
 * 口径：每个未达标版本都必须落在 peer 后缀版本集合内（直接实例若已达标不否决；
 * 若存在未达标的直接实例，它不在 peer 集合里，自然返回 false）。
 */
export function classifyPeerOnlyFailure(
    lockfilePath: string,
    packageName: string,
    remaining: readonly string[],
): boolean {
    if (remaining.length === 0) {
        return false
    }
    const scan = scanPeerOnlyInstances(lockfilePath, packageName)
    if (scan.peerOnlyVersions.length === 0) {
        return false
    }
    const peerVersions = new Set(scan.peerOnlyVersions)
    return remaining.every((version) => peerVersions.has(version))
}

/**
 * 返回仍低于目标的锁定实例（空数组 = 全部达到目标 / lockfile 中无该包）。
 *
 * lockfile 中完全没有该包时返回空数组：无法从版本回读判断，保持既有成功语义。
 */
export function remainingVersionsBelowTarget(
    lockfilePath: string,
    packageName: string,
    targetVersion: string,
): string[] {
    return readLockfileVersions(lockfilePath, packageName)
        .filter((version) => compareSemver(version, targetVersion) < 0)
}

/**
 * 回读 lockfile，确认每个版本化 override 覆盖的实例都达到目标。
 *
 * - 版本化 key `pkg@major`：只校验同一 major 的实例
 * - 通用 key `pkg`：校验全部实例
 * - 路径级 key（`parent>child`）：无法按包名映射，跳过（由上层完整验证兜底）
 *
 * @returns 首个未满足项的描述；全部满足返回 undefined
 */
export function verifyVersionedOverridesApplied(
    lockfilePath: string,
    plans: VersionedOverridesPlan[],
): string | undefined {
    return verifyVersionedOverridesAppliedDetailed(lockfilePath, plans)?.message
}

/**
 * 从 override 目标 range（如 `^5.4.21` / `~1.2.3` / `7.29.1`）提取可比较的版本号。
 * 无法提取时返回 undefined（该条不参与生效校验，保持既有成功语义）。
 */
function extractTargetVersion(range: string): string | undefined {
    return /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/.exec(range)?.[1]
}
