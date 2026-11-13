// helpers.ts（原 app-helpers.ts）：DependfixApp 的辅助方法集合。
// 为控制 app/index.ts 文件规模（max-lines 800），将不直接参与模式编排的方法
// 提取为模块级函数；通过 AppContext 传入所需状态，行为与原类方法一致。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import {
    type AlertsDisabledRecord,
    type CiAlignmentRecord,
    type FixAction,
    type FixError,
    type Logger,
    type NormalizedSecurityAlert,
    type RepeatedAttemptRecord,
    type RepositoryResult,
    type PrCheckWatchReport,
    type RunSummary,
    type AlertFixOutcome,
    type DeliverySkipRecord,
    type RunDelivery,
} from '@dependfix/core'
import { stageAndCommit } from '../github/pr-creator'
import { collectDeclaredPaths } from '../github/commit-scope'
import type { ClosedAttemptIndex } from '../github/attempt-history'
import { type AuthProvider } from '../auth'
import {
    compareSemver,
    parseMajorVersion,
    readLockfileVersions,
    normalizeOverrideKey,
} from '../fixers/dependency'
import { applyCodeScanningFix, restoreSourceFile, snapshotSourceFile } from '../fixers/code-scanning'
import { inferRepoFromGitRemote, type RuntimeConfig } from '../config'

import { quickVerifyProject } from '../helpers'
import { collectFailingInstallCommands, findInstallBlockedReposWithFixes, hasDeliverableFixes, recordDeliverySkip } from './delivery'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 匹配 `pnpm <singleWord>` 模式的命令（可能是 package.json script 引用） */

/**
 * 解析本次运行要处理的仓库列表。
 * - `github-dependabot`：config.repositories（配置层已保证非空）
 * - `pnpm-audit`：显式 --repo（≤1）→ git remote 推断（无 token 不代表无 remote）→ `local` 兜底
 */
export function resolveAlertRepositories(
    ctx: Pick<AppContext, 'config' | 'workDir' | 'logger'>,
): string[] {
    if (ctx.config.alertSource !== 'pnpm-audit') {
        return ctx.config.repositories
    }
    if (ctx.config.repositories.length > 0) {
        return ctx.config.repositories
    }
    const inferred = inferRepoFromGitRemote(ctx.workDir)
    if (inferred) {
        ctx.logger.info(`[alerts] pnpm-audit: repository inferred from git remote: ${inferred}`)
        return [inferred]
    }
    ctx.logger.info('[alerts] pnpm-audit: no git remote found, using "local" as repository')
    return ['local']
}

/** 自动修复提交的兜底标题（无成功升级 / 包名超长无法生成动态标题时） */
export const FIX_COMMIT_MESSAGE = 'chore(deps): automated dependfix security repair'

/** commitlint header-max-length 上限（commitlint-config-cmyr 覆盖为 140） */
const COMMIT_HEADER_MAX_LENGTH = 140

/**
 * 生成带升级明细的提交消息（Dependabot bump 风格）。
 * 标题含包名：单包 `bump flatted from 3.3.3 to 3.4.2`；多包列表（超长截断 `and N more`）。
 * 明细 `- pkg: from → to (pnpm overrides)`；排除 `PR #N` 记录型 action；无成功升级仅返回标题。
 */
export function buildCommitMessage(actions: FixAction[]): string {
    const upgrades = actions.filter((a) => a.type === 'dependency-upgrade' && a.success && !a.target.startsWith('PR #'))

    if (upgrades.length === 0) {
        return FIX_COMMIT_MESSAGE
    }

    const lines = [buildCommitTitle(upgrades), '']
    for (const a of upgrades) {
        const from = a.fromVersion && a.fromVersion !== 'unknown' ? `${a.fromVersion} → ` : ''
        const to = a.toVersion ?? 'latest'
        const suffix = a.strategy === 'override' ? ' (pnpm overrides)' : ''
        lines.push(`- ${a.target}: ${from}${to}${suffix}`)
    }
    return lines.join('\n')
}

/** 生成提交标题：单包 `bump pkg from X to Y`；多包列表（超长截断为前 N 个 + `and M more`）。 */
function buildCommitTitle(upgrades: FixAction[]): string {
    if (upgrades.length === 1) {
        const a = upgrades[0]
        const from = a.fromVersion && a.fromVersion !== 'unknown' ? ` from ${a.fromVersion}` : ''
        const to = a.toVersion ? ` to ${a.toVersion}` : ''
        const title = `chore(deps): bump ${a.target}${from}${to}`
        return title.length <= COMMIT_HEADER_MAX_LENGTH ? title : FIX_COMMIT_MESSAGE
    }

    const names = upgrades.map((a) => a.target)
    const full = `chore(deps): bump ${names.join(', ')}`
    if (full.length <= COMMIT_HEADER_MAX_LENGTH) {
        return full
    }

    // 超长：逐步减少展示数量，直到 `bump a, b and N more` 不超过上限
    let count = names.length - 1
    while (count > 0) {
        const candidate = `chore(deps): bump ${names.slice(0, count).join(', ')} and ${names.length - count} more`
        if (candidate.length <= COMMIT_HEADER_MAX_LENGTH) {
            return candidate
        }
        count--
    }
    return FIX_COMMIT_MESSAGE
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** DependfixApp 提供给辅助方法的最小状态切片。 */
export interface AppContext {
    config: RuntimeConfig
    workDir: string
    logger: Logger
    customCommands?: string[]
    /** 仓库级验证命令超时（毫秒；缺省走 env / 内置默认） */
    verifyCommandTimeoutMs?: number
    /**
     * 交付结果（仅 fix / fix-and-pr 模式由引擎写入；report-only 缺省）。
     * 进程内完成 push / PR 时由引擎维护，平台据此映射 runUrl / PR 与失败清理。
     */
    delivery?: RunDelivery
    runId: string
    allAlerts: NormalizedSecurityAlert[]
    allActions: FixAction[]
    allErrors: FixError[]
    /** alerts 功能未启用记录（方案 A：未启用 ≠ 失败，不计入 allErrors） */
    alertsDisabled: AlertsDisabledRecord[]
    repoResults: RepositoryResult[]
    summary: RunSummary
    startedAt: string
    finishedAt: string
    /** GitHub App 认证提供者（用于 commit author 真实 bot 身份） */
    authProvider?: AuthProvider
    /**
     * 验证链口径记录（run 级累积；`verifyProject` 写入，报告与 PR 正文消费）。
     *
     * 缺省（测试直接构造 ctx）⇒ 不记录；同一仓库多次验证取命令并集（按首次出现顺序），
     * 并集未增长时复用既有记录与首轮健康预检结果，避免重复发起 API 调用。
     */
    ciAlignment?: CiAlignmentRecord[]
    /**
     * 同告警尝试记录（run 级累积；`repo-fix` 的计划阶段写入，报告与 PR 正文标记消费）。
     * 缺省（测试直接构造 ctx）⇒ 不记录。
     */
    attemptTracking?: RepeatedAttemptRecord[]
    /**
     * 最近关闭 dependfix PR 的尝试索引（运行级缓存；仅 fix-and-pr 模式注入）。
     * 缺省 ⇒ 不做同告警尝试判定（行为与引入前一致）。
     */
    attemptIndex?: ClosedAttemptIndex
    /**
     * PR 落点仓库（`owner/repo`，= 本次运行的第一个仓库）。
     *
     * 尝试标记只能写进该仓库的 PR，故只有该仓库的告警参与尝试计数；多仓运行其余仓库
     * 不做跳过判定（避免「在 A 仓计 B 仓的尝试」造成永久跳过）。
     */
    attemptRepo?: string
    /**
     * 告警级修复结果收集器（run 级；修复管线在无法由 actions 反推的判定点写入，
     * 报告 `alertOutcomes` 与平台 `ScanResult.fixStatus` 回写消费）。
     * 缺省（测试直接构造 ctx）⇒ 报告只按 actions 与告警属性推导，不含收敛 / 跳过等显式判定。
     */
    alertOutcomes?: Map<string, AlertFixOutcome>
    /**
     * PR check 回环结果（仅 `--wait-pr-checks` 且实际创建 PR 时存在）。
     * 缺省 ⇒ 不等待（行为与引入前一致）。
     */
    prCheckWatch?: PrCheckWatchReport
    /**
     * 交付跳过记录（修复后安装仍为既有失败 → 有修复但不交付）。
     * 缺省（测试直接构造 ctx）⇒ 不记录，summary 计数保持 0。
     */
    deliverySkips?: DeliverySkipRecord[]
    /**
     * 运行截止时间（epoch ms；来自 `RuntimeConfig.deadlineAt`）。
     * 缺省 ⇒ 不限预算（CLI 本地运行），所有预算检查放行。
     */
    deadlineAt?: number
    /** 已记录的预算跳过（`stage:work`；避免同一跳过来回刷审计）。缺省 ⇒ 不去重。 */
    budgetSkips?: Set<string>
}

// ---------------------------------------------------------------------------
// Upgrade helpers
// ---------------------------------------------------------------------------

/**
 * 判断告警包是否在 lockfile 中多版本共存（版本化 overrides 修复的前置条件）。
 *
 * 多版本共存 = lockfile 中该包存在 **多个大版本**（如 vite@5.4.14 与 vite@8.2.0）。
 * 同一大版本内的多个小版本（如 fast-uri@3.1.0 与 3.1.5）不构成多版本场景，
 * 仍走常规单目标升级（lockfile 最高版本已 >= 目标时不降级保护跳过）。
 */
export function hasMultipleMajorVersions(lockfilePath: string, packageName: string): boolean {
    const versions = readLockfileVersions(lockfilePath, packageName)
    const majors = new Set(versions.map((v) => v.split('.')[0]))
    return majors.size > 1
}

/**
 * 为 lockfile 中存在脆弱实例的包构建 overrides 映射。
 *
 * 输入为该包所有 fixable 告警（不同 GHSA 推荐版本不同），按大版本分组取各线
 * 最高推荐（2026-08-06 run 31028234123 复盘：不用全局最高导致 5.x 实例匹配失败）。
 *
 * **key 形式决策**（2026-08-09 复盘）：真实大版本冲突（多 major 共存，如
 * vite@5.4.14 + vite@8.2.0）→ 版本化 key `pkg@major`；单 major（含同 major 多
 * 小版本）→ 无版本号 key `pkg`——与既有无版本号条目并存会语义分裂（无版本号
 * 兜底匹配未命中 `@major` 的实例，多 major 下可能静默跨线强制）。例外：单 major
 * 已有 `pkg@major` 条目（历史遗留）时沿用版本化 key，否则新条目被精确 key 截获。
 *
 * **与既有 overrides 协同**：目标与已有同 key 条目取 max（剥离前缀比较），
 * 已有条目不删除、不改写形式；已有目标 >= 推荐时不重复写入。
 *
 * @param existingOverrides - 当前已生效的 overrides 映射（readExistingOverrides 读取）
 * @returns 需要新增/更新的 overrides 映射；无脆弱实例或无需更新时返回 {}
 */
export function buildVersionedOverrides(
    lockfilePath: string,
    alerts: NormalizedSecurityAlert[],
    existingOverrides: Record<string, string> = {},
): Record<string, string> {
    const first = alerts[0]
    if (!first) {
        return {}
    }
    const packageName = first.packageName
    const versions = readLockfileVersions(lockfilePath, packageName)

    // 按大版本分组取各线最高推荐
    const targetByMajor = new Map<string, string>()
    for (const alert of alerts) {
        const target = alert.recommendedVersion
        if (!target) {
            continue
        }
        const major = String(parseMajorVersion(target))
        const current = targetByMajor.get(major)
        if (!current || compareSemver(target, current) > 0) {
            targetByMajor.set(major, target)
        }
    }

    // 大版本冲突判定：多 major 共存才用版本化 key；单 major 已有版本化条目则沿用
    const majors = [...new Set(versions.map((v) => String(parseMajorVersion(v))))]
    // 已有 overrides 按归一化 key 建索引：`pkg@^1` 与 `pkg@1` 视为同一 selector（override-key.ts）
    const existingKeyByNormalized = new Map<string, string>()
    for (const key of Object.keys(existingOverrides)) {
        const normalized = normalizeOverrideKey(key)
        // 文件已存在重复等价 key 时取首个（与 upsertOverride 的首次命中策略一致）
        if (!existingKeyByNormalized.has(normalized)) {
            existingKeyByNormalized.set(normalized, key)
        }
    }
    const useVersionedKey = majors.length > 1
        || existingKeyByNormalized.has(normalizeOverrideKey(`${packageName}@${majors[0] ?? ''}`))
    // 命中已有等价 key 时沿用其原写法，避免同一 selector 并存两种写法（2026-10-02 PR #298 复盘）
    const resolveWriteKey = (canonicalKey: string): string =>
        existingKeyByNormalized.get(normalizeOverrideKey(canonicalKey)) ?? canonicalKey
    // 剥离 ^ / ~ 前缀后比较（compareSemver 不处理前缀）
    const existingTarget = (canonicalKey: string): string | undefined => {
        const actualKey = existingKeyByNormalized.get(normalizeOverrideKey(canonicalKey))
        return actualKey === undefined
            ? undefined
            : existingOverrides[actualKey]?.replace(/^\s*[\^~>=<]*\s*/, '')
    }

    const overrides: Record<string, string> = {}
    for (const version of versions) {
        const major = String(parseMajorVersion(version))
        const target = targetByMajor.get(major)
        // 该大版本线存在推荐目标且实例低于目标 → 脆弱，覆盖整条线
        if (target && compareSemver(version, target) < 0) {
            const canonicalKey = useVersionedKey ? `${packageName}@${major}` : packageName
            // 与已有条目协同：目标取 max，已有 >= 推荐则无需写入
            const existing = existingTarget(canonicalKey)
            if (!existing || compareSemver(target, existing) > 0) {
                overrides[resolveWriteKey(canonicalKey)] = `^${target}`
            }
        }
    }

    // 路径级补丁（顶层兜底 + 路径级补丁策略）：有 dependencyPath 时额外生成
    // `parent>child` key，精确覆盖特定父包的传递依赖。顶层与路径级正交叠加。
    // 按 pathKey 预聚合取 max（对齐顶层 targetByMajor 模式），避免同 key 跨告警
    // last-write-wins 导致写入低于修复所需的版本。
    const pathTargetByKey = new Map<string, string>()
    for (const alert of alerts) {
        if (!alert.dependencyPath) {
            continue
        }
        const target = alert.recommendedVersion
        if (!target) {
            continue
        }
        for (const path of alert.dependencyPath) {
            const pathKey = extractPathOverrideKey(path)
            if (!pathKey) {
                continue
            }
            const current = pathTargetByKey.get(pathKey)
            if (!current || compareSemver(target, current) > 0) {
                pathTargetByKey.set(pathKey, target)
            }
        }
    }
    for (const [pathKey, target] of pathTargetByKey) {
        const existing = existingTarget(pathKey)
        if (!existing || compareSemver(target, existing) > 0) {
            overrides[resolveWriteKey(pathKey)] = `^${target}`
        }
    }

    // 父级限定键遮蔽（2026-11-01 cmyr-skills-agents undici 实证）：已有的 `parent>pkg` 规则
    // 优先于通用 / 版本化键，通用键升级后 pnpm 不重新解析 → 实例不变。这里把「同包且仍低于
    // 本次目标」的父级键一并提升（保持原 key 写法，只改值），不新增条目、不删既有条目。
    // 目标必须与键自身的版本线一致：有 selector 用 selector 的 major；无 selector 用当前值的
    // major。对应线没有本次目标时跳过——不做未授权的跨 major 改写（由校验失败消息披露遮蔽键）。
    if (Object.keys(overrides).length > 0) {
        for (const [key, value] of Object.entries(existingOverrides)) {
            if (!key.includes('>')) {
                continue
            }
            const segments = key.trim().split('>')
            const lastSegment = segments[segments.length - 1].trim()
            const atIndex = lastSegment.startsWith('@') ? lastSegment.indexOf('@', 1) : lastSegment.indexOf('@')
            const keyPackage = atIndex > 0 ? lastSegment.slice(0, atIndex) : lastSegment
            if (keyPackage !== packageName) {
                continue
            }
            const selectorMajor = atIndex > 0
                ? /^[^\d]*(\d+)/.exec(lastSegment.slice(atIndex + 1))?.[1]
                : undefined
            const current = value.replace(/^\s*[\^~>=<]*\s*/, '')
            const lineMajor = selectorMajor ?? /^(\d+)/.exec(current)?.[1]
            if (lineMajor === undefined) {
                continue
            }
            const target = targetByMajor.get(lineMajor)
            if (!target) {
                continue
            }
            if (compareSemver(current, target) < 0) {
                overrides[key] = `^${target}`
            }
        }
    }
    return overrides
}

/**
 * 从依赖链提取路径级 override key（`parent>child`）。
 *
 * 取最后两级（pnpm 官方语义「只覆盖特定父包」）：
 * 链 `docs>vitepress>@vitejs/plugin-vue>vite` → key `@vitejs/plugin-vue>vite`。
 * 少于两级返回 undefined（无法形成 `parent>child` 结构）。
 */
export function extractPathOverrideKey(dependencyPath: string): string | undefined {
    const segments = dependencyPath.split('>').map((s) => s.trim()).filter(Boolean)
    if (segments.length < 2) {
        return undefined
    }
    return `${segments[segments.length - 2]}>${segments[segments.length - 1]}`
}


// ---------------------------------------------------------------------------
// Lockfile repair
// ---------------------------------------------------------------------------

/**
 * 执行 Code Scanning 模板修复（2.0 节；从 app/index.ts 提取以控制文件行数）。
 * 仅处理 A 类告警；按批处理（默认每 10 个告警跑一次 lint）：快照 → 应用模板 → 累积到批 → 批满跑 lint → 失败回滚整批（不静默）。
 * - 快照失败 / 无模板 / 模板不适用 / 缺文件 → noOp 动作（回退建议模式，展示；
 *   error 原因可审计，不计 failed 避免陈旧告警永久 exit 1/2）
 * - 写盘失败 → 立即失败（不计 lint）+ 整批回滚
 * - lint 验证失败 → 整批回滚（粒度 = batchSize；vs 旧版每个告警回滚，回滚粒度变粗但 lint 提速 ~10x）
 *
 * 性能权衡（批处理实证）：
 * - N 个 cs 告警（旧版）→ N 次 spawn `pnpm lint` 子进程：N=100 平均 2593 ms（基准 commit 395ee29）
 * - N 个 cs 告警（批处理）→ ceil(N/batchSize) 次 lint：N=100 平均 ~300 ms（提速 ~10x）
 * - 合并验证可提速 ~96x 但回滚粒度过粗（整次 fix 全失败）；批处理折中
 *
 * @returns 本批次实际修复数（fixed）与失败数（failed），调用方累加到仓库统计
 */
export async function runCodeScanningFixes(
    ctx: Pick<AppContext, 'config' | 'workDir' | 'logger' | 'allActions'>,
    repo: string,
    alerts: NormalizedSecurityAlert[],
    options: { batchSize?: number } = {},
): Promise<{ fixed: number, failed: number }> {
    const { config, workDir, logger } = ctx
    const batchSize = options.batchSize ?? DEFAULT_CS_BATCH_SIZE
    const codeScanningAutoFixable = alerts.filter(
        (a) => a.source === 'code-scanning' && a.alertClass === 'auto-fixable',
    )

    let fixed = 0
    let failed = 0

    /** 待 lint 批：每条保留 sourceSnapshot + action 用于 lint 失败时整批回滚 */
    const pendingBatch: Array<{
        csAlert: NormalizedSecurityAlert
        sourceSnapshot: NonNullable<ReturnType<typeof snapshotSourceFile>>
        action: FixAction
    }> = []

    /**
     * 处理当前批：跑 lint + 按结果分发 fixed/failed + 回滚（lint 失败时）。
     */
    const flushBatch = async () => {
        if (pendingBatch.length === 0) {
            return
        }
        const quickOk = await quickVerifyProject(ctx, repo)
        if (quickOk) {
            for (const item of pendingBatch) {
                ctx.allActions.push(item.action)
                fixed++
                logger.info(`[code-scanning] ${item.csAlert.ruleId}: ${item.action.diff}`)
            }
        } else {
            for (const item of pendingBatch) {
                const restored = restoreSourceFile(workDir, item.sourceSnapshot)
                item.action.success = false
                item.action.error = restored
                    ? 'lint failed after code-scanning fix; changes rolled back'
                    : 'lint failed after code-scanning fix; rollback failed, file may be modified'
                ctx.allActions.push(item.action)
                failed++
                logger.warn(`[code-scanning] ${item.csAlert.ruleId} fix rolled back: lint failed`)
            }
        }
        pendingBatch.length = 0
    }

    for (const csAlert of codeScanningAutoFixable) {
        // 源码文件快照（不在 snapshotTrackedFiles 清单范围内——回滚必须精确到目标文件）
        const sourceSnapshot = snapshotSourceFile(workDir, csAlert.manifestPath)
        if (!sourceSnapshot) {
            // 快照失败（路径越界/读取异常）：构造 noOp action 保证可审计（不静默）
            const snapAction: FixAction = {
                type: 'code-scanning-fix',
                repository: csAlert.repository,
                target: csAlert.ruleId,
                success: true,
                noOp: true,
                filePath: csAlert.manifestPath,
                error: `cannot snapshot ${csAlert.manifestPath} (unsafe path or unreadable)`,
                durationMs: 0,
            }
            ctx.allActions.push(snapAction)
            logger.warn(`[code-scanning] ${csAlert.ruleId} skipped: ${snapAction.error}`)
            continue
        }

        const action = applyCodeScanningFix({ workDir, alert: csAlert, dryRun: config.dryRun })
        if (!action) {
            continue // 防御：过滤条件已保证非空
        }

        if (!action.success) {
            // 失败分支也恢复快照（写盘异常可能产生中间态；幂等，未改动时写回原内容无害）
            const restored = restoreSourceFile(workDir, sourceSnapshot)
            if (!restored) {
                action.error = `${action.error}; rollback failed, file may be modified`
            }
            ctx.allActions.push(action)
            failed++
            logger.warn(`[code-scanning] ${csAlert.ruleId} not auto-fixed: ${action.error}`)
            continue
        }

        // no-op / 无法安全处理（陈旧告警、无模板、歧义）→ 不计 fixed/failed，
        // error 在 Fix Actions 表可见（不静默）
        if (action.noOp) {
            ctx.allActions.push(action)
            if (action.error) {
                logger.warn(`[code-scanning] ${csAlert.ruleId} skipped: ${action.error}`)
            }
            continue
        }

        if (config.dryRun) {
            fixed++
            ctx.allActions.push(action)
            continue
        }

        // 加入批 + 批满后跑 lint（批大小 = batchSize）
        pendingBatch.push({ csAlert, sourceSnapshot, action })
        if (pendingBatch.length >= batchSize) {
            await flushBatch()
        }
    }

    // 末尾剩余告警：跑一次 lint（避免留下"未 lint" 状态）
    await flushBatch()

    return { fixed, failed }
}

/**
 * Code Scanning 修复批处理默认大小（批处理决策）。
 *
 * 决策依据（commit 395ee29 baseline）：
 * - 旧版（每个告警 1 次 lint）：N=10 平均 263 ms / N=50 平均 1294 ms / N=100 平均 2593 ms
 * - 批处理 batchSize=10：N=10 触发 1 次 lint（vs 旧版 10 次 → 提速 ~10x）
 * - 回滚粒度 = batchSize（vs 旧版每个告警独立回滚）
 *
 * 经验值：典型 cs 告警场景 5-50 个 / repo，batchSize=10 平衡 lint 提速 + 回滚粒度。
 */
const DEFAULT_CS_BATCH_SIZE = 10

export { tryLockfileRepair } from './lockfile-repair-action'


// ---------------------------------------------------------------------------
// Local commit helpers
// ---------------------------------------------------------------------------

/**
 * 将修复产生的变更提交到本地当前分支。
 *
 * - 工作目录不是 git 仓库时跳过（warn，不抛错）——避免异常路径（如 report-only 被误降级为
 *   `fix + commit` 却未 clone）上以 `git config` 硬失败污染整次运行结果
 * - 该守卫**有意 fail-open**（仅 warn、不写 `allErrors`、不影响退出码）：非仓库意味着「无可提交内容」
 *   而非「交付失败」，故不产生 `COMMIT_FAILED`（平台会把该 category 判为 `failed`，见 run-failure-taxonomy）。
 *   平台 fix / fix-and-pr 路径必先 clone（workDir 恒为仓库），故该分支仅在 CLI 于非 git cwd 运行 `--commit` 时可达。
 *   代价是「请求 commit 但未交付」在 run 结果里只留日志、不留结构化信号（已登记 backlog 候选评估补信号）。
 * - 无任何变更（含已暂存变更）时跳过
 * - config 校验已保证 `commit` 与 `dryRun` / `createPullRequest` 互斥，
 *   因此这里不需要再检查这两个开关
 * - 提交集合由白名单 + fixer 声明路径决定（`stageAndCommit`）；含未声明的已跟踪改动时抛
 *   `CommitScopeError('UNEXPECTED_CHANGES')`，仅供生成物 / 未跟踪文件时抛 `NO_CHANGES`
 */
export async function commitLocalChanges(
    ctx: Pick<AppContext, 'logger' | 'workDir' | 'allActions' | 'authProvider' | 'deliverySkips'>,
): Promise<void> {
    const { logger, workDir, allActions, authProvider } = ctx

    // 纵深防御（不依赖 `hasGitChanges` 的内部非仓库守卫）：非 git 仓库时不能提交
    // （`git config` / `git add` 均会失败），且需要与「仓库但无变更」区分日志级别。
    // 2026-10-11 生产实证：report-only 扫描被降级为 fix+commit 且未 clone → 走到 stageAndCommit
    // 并以 `git config user.name` 抛 `fatal: not in a git directory` → COMMIT_FAILED → 平台误标失败。
    if (!isGitRepository(workDir)) {
        logger.warn(`工作目录不是 git 仓库 — 跳过本地提交（${workDir}）`)
        return
    }

    if (!hasGitChanges(workDir)) {
        logger.info('No changes to commit — skipping local commit')
        return
    }

    // 修复后安装仍为既有失败：PR 的 CI 会以同一错误失败，普通交付不应继续。
    // 放在 hasGitChanges 之后：无改动的运行仍保留原有「No changes」日志。
    const installBlockedRepos = findInstallBlockedReposWithFixes(allActions)
    if (installBlockedRepos.length > 0) {
        // run 标记：平台执行链（fix + commit）不经引擎 PR 面 → 只记录跳过，供平台展示「交付跳过」
        // （载体恒为 `skip`：该路径不产出 issue / draft PR，不能在报告里谎报载体）
        recordDeliverySkip(ctx, {
            repositories: installBlockedRepos,
            failingCommands: collectFailingInstallCommands(allActions, installBlockedRepos),
            carrier: { mode: 'skip' },
        })
        logger.warn(
            `Install verification is still failing (pre-existing) after the fix for ${installBlockedRepos.join(', ')} `
            + '— skipping local commit; fix the execution environment or target repository lockfile first',
        )
        return
    }

    // 零修复（只有 .gitignore / allowBuilds 等 side-effect 改动）不产生提交 / PR。
    if (!hasDeliverableFixes(allActions)) {
        logger.info('No deliverable fixes produced — skipping local commit')
        return
    }

    // 提交前先确保报告目录被 .gitignore 忽略，避免残留的 dependfix-reports/ 被 git add 提交
    ensureGitignore(workDir)

    const commitMessage = buildCommitMessage(allActions)
    const author = authProvider?.getCommitAuthor()
    // 提交集合 = 固定白名单 ∪ 声明路径；未声明改动 / 空集合由 stageAndCommit 抛
    // CommitScopeError（调用方据此写 UNEXPECTED_CHANGES / NO_CHANGES，而不是笼统的 COMMIT_FAILED）
    const scope = await stageAndCommit(commitMessage, workDir, author, {
        declaredPaths: collectDeclaredPaths(allActions),
    })
    if (scope.ignored.length > 0) {
        logger.info(`Not committing ${scope.ignored.length} generated / undeclared path(s): ${scope.ignored.join(', ')}`)
    }
    if (scope.missing.length > 0) {
        // 声明了但工作区没有对应改动（被 .gitignore 忽略 / 内容无 diff）→ PR 会少文件，必须留痕
        logger.warn(`Declared path(s) had no changes in the worktree: ${scope.missing.join(', ')}`)
    }
    logger.info(`Committed fix changes to current branch: ${commitMessage.split('\n')[0]}`)
}

/**
 * 判断 workDir 是否为 git 仓库工作树。
 *
 * 必须显式探测：git 在非仓库目录下的错误文案随子命令而异（`fatal: not in a git directory`
 * vs `fatal: not a git repository`），且 `--local` / 写入类命令与只读类命令的行为并不统一，
 * 因此**不能**用「某条 git 命令是否失败」反推仓库存在。
 */
export function isGitRepository(workDir: string): boolean {
    try {
        execFileSync('git', ['rev-parse', '--git-dir'], { cwd: workDir, stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

/**
 * 检查工作目录是否有未提交的变更（含未暂存与已暂存）。
 *
 * **非 git 仓库返回 `false`**（`isGitRepository` 前置判定）：不存在可判定的工作树 ⇒ 不存在变更。
 * 若把「git 命令失败」当作「有变更」（旧行为），调用方会被推进 branch / commit / push 链路，
 * 并以 `fatal: not in a git directory` 收尾 → `COMMIT_FAILED` → 平台把整次运行误标失败
 * （2026-10-11 生产实证的同类盲区）。
 */
export function hasGitChanges(workDir: string): boolean {
    if (!isGitRepository(workDir)) {
        return false
    }
    try {
        execSync('git diff --quiet', { cwd: workDir, stdio: 'pipe' })
        execSync('git diff --cached --quiet', { cwd: workDir, stdio: 'pipe' })
        return false // 两者都无变更
    } catch {
        return true // 任一有变更
    }
}

/**
 * `.gitignore` 行的归一化形态（判定「目标目录是否已被忽略」的等价类）。
 *
 * 处理顺序：去尾随空格与 `\r`（CRLF 行结束符；**保留尾随 tab**，与 git 一致）→ 行首 `#`（注释）/ `!`（取反）
 * → 前导 globstar 前缀（双星号加斜杠）与根路径斜杠 → 尾部内容通配（斜杠 + 双星号 / 斜杠 + 星号）→ 尾部 `/`（目录标记）。
 *
 * 与 git 语义对齐的三条边界（**安全方向优先：宁可多追加，不可漏追加**——漏追加会让报告目录
 * 出现在工作区变更集里（污染「无变更」判定，并需要交付侧额外排除）：
 * - **行中 `#` 是字面字符**（git 仅把行首 `#` 当注释）——`dir/ # note` 在 git 中并不生效，不视为已忽略；
 * - **前导空白属于模式本身**（git 仅忽略尾随空白）——` dir/` 不视为已忽略；
 * - **以「斜杠 + 双星号 + 斜杠」结尾的形态只忽略目录内层级**，不忽略目录自身，不视为已忽略。
 *
 * 返回 `undefined` 表示该行不构成对目标目录的忽略（空行 / 注释行 / 取反行 / 首尾处理后为空）。
 */
export function normalizeGitignoreEntry(line: string): string | undefined {
    // git 只剥离尾随空格与行结束符 `\r`（**不**剥离尾随 tab）；仅行首 `#` / `!` 有特殊含义
    const trimmedEnd = line.replace(/[ \r]+$/, '')
    if (!trimmedEnd || trimmedEnd.startsWith('#') || trimmedEnd.startsWith('!')) {
        return undefined
    }
    let t = trimmedEnd
    if (t.startsWith('**/')) {
        t = t.slice(3)
    }
    if (t.startsWith('/')) {
        t = t.slice(1)
    }
    if (t.endsWith('/**') || t.endsWith('/*')) {
        t = t.slice(0, t.lastIndexOf('/'))
    } else if (t.endsWith('/')) {
        t = t.slice(0, -1)
    }
    return t || undefined
}

/**
 * 判定 `.gitignore` 内容中是否已存在对 `entry` 的等价忽略条目。
 *
 * 语义等价集见 [normalizeGitignoreEntry]——用户已用 `/dependfix-reports`、`dependfix-reports`、
 * globstar 前缀 + 目录名、目录名 + 双星号通配等等价写法忽略时，均视为已忽略，不再重复追加。
 */
export function isGitignoreEntryIgnored(content: string, entry: string): boolean {
    const target = normalizeGitignoreEntry(entry)
    if (!target) {
        return false
    }
    return content.split('\n').some((line) => normalizeGitignoreEntry(line) === target)
}

/**
 * 确保目标仓库的 `.gitignore` 中包含 `dependfix-reports/`。
 *
 * - 仅在 workDir 是 git 仓库时执行
 * - 已存在该条目时幂等跳过（**语义等价写法**亦视为存在，见 [isGitignoreEntryIgnored]）
 * - 失败（权限、磁盘满等）静默降级
 */
export function ensureGitignore(workDir: string): void {
    try {
        const gitDir = join(workDir, '.git')
        if (!existsSync(gitDir)) {
            return
        }

        const gitignorePath = join(workDir, '.gitignore')
        const entry = 'dependfix-reports/'

        let content = ''
        if (existsSync(gitignorePath)) {
            content = readFileSync(gitignorePath, 'utf-8')
        }

        // 幂等检查：精确写法与语义等价写法（前导 `/`、尾部 `/`、`**/` 前缀、`/**` 与 `/*` 通配、行内注释）均视为已忽略
        if (isGitignoreEntryIgnored(content, entry)) {
            return
        }

        // 追加（末尾无换行时补一个）
        const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n'
        const block = `${suffix}# dependfix\n${entry}\n`
        writeFileSync(gitignorePath, content + block, 'utf-8')
    } catch {
        // 静默降级
    }
}

// ---------------------------------------------------------------------------
// Branch cleanup（迁移至 ./branch-cleanup，保持向后兼容 re-export）
// ---------------------------------------------------------------------------

export {
    autoCleanupMergedBranches,
    closeSupersededPRs,
    confirmCleanup,
    reportCleanupCandidates,
    runBranchCleanupForRepo,
} from './branch-cleanup'

/**
 * 按动作构成生成 PR 标题（收尾审查遗留修复：cs-only 修复不再误标 "N upgrades"，
 * lockfile-only 不再出现 "0 upgrades"）。
 * - 依赖升级 + code-scanning 修复分别计数；均为 0 时（lockfile-only）中性标题。
 * - ⚠️ 不变式：`upgrades = alertsFixed - codeFixes` 依赖 computeSummary 与
 *   codeFixes 过滤条件一致（均 success && !noOp）；任一侧口径变更必须同步。
 */
export function buildPrTitle(summary: Pick<RunSummary, 'alertsFixed'>, actions: FixAction[]): string {
    const codeFixes = actions.filter((a) => a.type === 'code-scanning-fix' && a.success && !a.noOp).length
    const upgrades = Math.max(0, summary.alertsFixed - codeFixes)

    const parts: string[] = []
    if (upgrades > 0) {
        parts.push(`${upgrades} upgrade${upgrades > 1 ? 's' : ''}`)
    }
    if (codeFixes > 0) {
        parts.push(`${codeFixes} code fix${codeFixes > 1 ? 'es' : ''}`)
    }
    return parts.length > 0
        ? `chore(deps): automated security fix — ${parts.join(', ')}`
        : 'chore(deps): automated security fix'
}

// ---------------------------------------------------------------------------
// Result assembly（迁移至 ./result-assembly，保持向后兼容 re-export）
// ---------------------------------------------------------------------------

export {
    buildRunResult,
    computeExitCode,
    computeSummary,
    mergeAiUsage,
} from './result-assembly'
