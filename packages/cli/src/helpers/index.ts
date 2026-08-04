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
 * 区分可安全自动修复的告警与需人工处理的告警（P0 防护 + run 30933266831 复盘修正）。
 *
 * Dependabot 告警携带 `dependency.manifest_path`，其值与包类型相关：
 * - 直接依赖 → `package.json`（根）
 * - **间接依赖 → `pnpm-lock.yaml`**（lockfile 即间接依赖的 manifest，G3 overrides 修复的标准场景）
 * - 子目录 manifest → `docs/package.json`、`packages/x/package.json`、fixtures 等
 *
 * 修复模型是单根 workDir（package.json + pnpm overrides 全局生效），规则：
 * - `''` / `package.json` → root（正常修复；pnpm-audit 源 manifestPath='' 不受影响）
 * - `pnpm-lock.yaml`：
 *   - 包**不是**根直接依赖 → root（标准间接依赖，走 overrides 修复，fast-uri 等）
 *   - 包**是**根直接依赖 → sub（告警针对传递依赖实例，但 overrides 全局会波及根声明，
 *     如 vite@5 告警会降级根 vite@8——run 30929090403 教训；需人工处理）
 * - 其他子目录 manifest → sub（单根模型无法安全修，需人工处理）
 */
export function partitionSubmanifestAlerts(
    alerts: NormalizedSecurityAlert[],
    workDir: string,
): { root: NormalizedSecurityAlert[], sub: NormalizedSecurityAlert[] } {
    const root: NormalizedSecurityAlert[] = []
    const sub: NormalizedSecurityAlert[] = []
    for (const alert of alerts) {
        const normalized = alert.manifestPath.trim().replace(/\\/g, '/')
        if (normalized === '' || normalized === 'package.json') {
            root.push(alert)
            continue
        }
        if (normalized === 'pnpm-lock.yaml') {
            if (isRootDirectDependency(workDir, alert.packageName)) {
                sub.push(alert)
            } else {
                root.push(alert)
            }
            continue
        }
        sub.push(alert)
    }
    return { root, sub }
}

/** 判断包是否为根 package.json 的直接依赖（dependencies / devDependencies / optionalDependencies）。 */
function isRootDirectDependency(workDir: string, packageName: string): boolean {
    try {
        const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8')) as Record<string, unknown>
        for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
            const deps = pkg[group]
            // Object.hasOwn 防原型链误判（'toString' in {} 为 true）
            if (deps && typeof deps === 'object' && Object.hasOwn(deps, packageName)) {
                return true
            }
        }
    } catch {
        // package.json 缺失/损坏：视为非直接依赖（后续升级流程会明确报错，不静默）
    }
    return false
}
