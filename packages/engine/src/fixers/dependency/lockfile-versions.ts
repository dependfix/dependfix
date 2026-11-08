// lockfile-versions.ts — 从 pnpm-lock.yaml 读取包实例版本（从 index.ts 拆出以控制文件行数）。
// index.ts 继续 re-export，外部消费者无需调整 import。
import { existsSync, readFileSync } from 'node:fs'
import { compareSemver } from './semver'

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

/** 转义正则元字符（包名含 `.` / `+` 等时按字面量匹配）。 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 扫描指定包在 lockfile 中的实例形态，判定是否**仅以 peer 后缀形态**存在。
 *
 * 背景（2026-11-01 rss-to-memos-sync vite 实证）：peer-only 依赖写入通用 override 后，
 * pnpm 只把 `peerDependencies` 的 range 改成目标，已锁定实例不变（`--force` 亦不重解析），
 * 生效校验会误判成「override 未生效」并回滚。上层据此给出 `peer-only` 人工处置结论。
 *
 * 判定口径：
 * - `peerOnlyVersions`：snapshot 键带 peer 后缀（`pkg@1.2.3(peer@4.5.6)`）的版本
 * - `hasDirectInstances`：存在 v9 `/pkg/ver:` 或 v10 裸键 `pkg@ver:` / `'pkg@ver'`
 *
 * 仅当「存在 peer 实例且不存在任何直接实例」时，才可把剩余未达标实例归因为 peer-only。
 */
export function scanPeerOnlyInstances(
    lockfilePath: string,
    packageName: string,
): { peerOnlyVersions: string[], hasDirectInstances: boolean } {
    const empty = { peerOnlyVersions: [] as string[], hasDirectInstances: false }
    if (!existsSync(lockfilePath)) {
        return empty
    }

    try {
        const content = readFileSync(lockfilePath, 'utf-8')
        const escapedName = escapeRegExp(packageName)
        const versionCapture = '(\\d+(?:\\.\\d+(?:\\.\\d+)?(?:-[a-zA-Z0-9.]+)?))'
        const peerVersions = new Set<string>()

        // peer 后缀形态：pkg@ver(peer@x) / 'pkg@ver(peer@x)'（scoped 包带引号）
        const peerPattern = new RegExp(`^\\s*'?${escapedName}@${versionCapture}\\(`, 'gm')
        for (const match of content.matchAll(peerPattern)) {
            peerVersions.add(match[1])
        }

        // 直接实例：v9 `/pkg/ver:` 与 v10 裸键 `pkg@ver:` / `'pkg@ver'`
        const v9Pattern = new RegExp(`^\\s*/${escapedName}/${versionCapture}:`, 'gm')
        const barePattern = new RegExp(`^\\s*'?${escapedName}@${versionCapture}(?::|')`, 'gm')
        const hasDirectInstances = v9Pattern.test(content) || barePattern.test(content)

        return { peerOnlyVersions: [...peerVersions].sort(compareSemver), hasDirectInstances }
    } catch {
        return empty
    }
}
