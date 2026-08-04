// helpers/index.ts（原 fix-helpers.ts）
// 修复规划与逐包验证辅助：同包告警收敛、文件快照回滚、逐包快速验证。
// G3：多个 alerts 指向同一包时逐个升级会互相覆盖甚至降级；逐包验证失败
// 只回滚该包改动，避免"一个包失败导致全部回滚"。
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { compareSemver } from '../fixers/dependency'
import { runVerification } from '../runners/verification-runner'
import { validateVerifyCommands, type AppContext } from '../app/helpers'

/**
 * 对可修复告警按包名去重（G3 同包收敛）。
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
 * 用于逐包升级验证失败时精确回滚该包产生的改动，而不影响此前已成功的包。
 */
export function snapshotTrackedFiles(workDir: string): Record<string, string | null> {
    const targets = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']
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
 * 快速验证（逐包）：仅运行 `pnpm lint`（脚本存在时）。
 *
 * 完整验证（install + lint + build）成本高，逐包执行不现实；
 * lint 是依赖兼容性的快速信号（本次坏 PR 即因 lint 失败）。
 * 无 lint 脚本时视为通过（与 verifyProject 的跳过语义一致）。
 */
export async function quickVerifyProject(
    ctx: Pick<AppContext, 'logger' | 'workDir'>,
    repo: string,
): Promise<boolean> {
    const { logger, workDir } = ctx
    const { valid, skipped } = validateVerifyCommands(['pnpm lint'], workDir)

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
 * 区分根 manifest 告警与子目录 manifest 告警（P0：vite 张冠李戴降级修复的防护）。
 *
 * Dependabot 告警携带 `dependency.manifest_path`（如 `docs/package.json`），
 * 但修复模型是单根 workDir（package.json + pnpm overrides 全局生效）：
 * - 子目录 manifest 的告警若包同时是根直接依赖（如 docs 的 vite@5 告警命中
 *   根 vite@8），`upgradeDependency` 会误改根声明造成 major 降级（run 30929090403）；
 * - pnpm overrides 是全局的，无法只修子目录而不影响根。
 *
 * 因此子目录 manifest 告警一律剔除修复链路（报告保留、计入 skipped），
 * 标记"需人工处理"；pnpm-audit 源（manifestPath=''）不受影响。
 */
export function partitionSubmanifestAlerts(
    alerts: NormalizedSecurityAlert[],
): { root: NormalizedSecurityAlert[], sub: NormalizedSecurityAlert[] } {
    const root: NormalizedSecurityAlert[] = []
    const sub: NormalizedSecurityAlert[] = []
    for (const alert of alerts) {
        const normalized = alert.manifestPath.trim().replace(/\\/g, '/')
        if (normalized && normalized !== 'package.json') {
            sub.push(alert)
        } else {
            root.push(alert)
        }
    }
    return { root, sub }
}
