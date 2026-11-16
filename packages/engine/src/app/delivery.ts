// delivery.ts — 交付门禁的共享判定：是否存在可交付修复、修复后安装是否仍为既有失败。
//
// 背景（2026-10-18 生产复盘）：
// - `commitLocalChanges` / `executeFixAndPrMode` 原先只检查 `hasGitChanges`；side-effect 改动
//   （`.gitignore` / `pnpm-workspace.yaml` 的 allowBuilds）也能让零修复运行产生 commit + PR。
// - 基线安装失败（如 lockfile 损坏）会被标为 `PRE_EXISTING_FAILURE`，门禁不阻断；但修复后
//   安装仍失败时，PR 的 CI 必然以同一错误失败，普通 PR 不应创建。
// 本模块只做纯判定，不依赖 AppContext，避免 helpers / index 之间的循环依赖。
import type { DeliverySkipRecord, FixAction } from '@dependfix/core'

/**
 * 安装类命令判定（与 `verify-project.ts` 的基线安装失败识别同口径）。
 *
 * 覆盖默认链的 `pnpm install --frozen-lockfile` 与显式 toolchain 形态
 * `corepack pnpm@x install --frozen-lockfile`。
 */
export function isInstallCommand(command: string): boolean {
    return /(?:^|\s)(?:corepack\s+)?pnpm(?:@\S+)?\s+install(?=\s|$)/.test(command)
}

/**
 * 单条动作是否构成**可交付的成功修复**。
 *
 * 计数口径与 `computeSummary` 的 fixed / lockfileRepairs 保持一致：
 * - 跳过 `noOp`（无需修改）与 AI 过程动作（ai-patch / ai-suggestion；主 action 代表结果）
 * - `dependency-upgrade`：排除 `PR #N` 记录型 action
 * - `code-scanning-fix`：成功且非 noOp
 * - `lockfile-repair`：成功且非 noOp（`tryLockfileRepair` 对「已合规、未改动」标记 noOp）
 */
export function isDeliverableFix(action: FixAction): boolean {
    if (!action.success || action.noOp) {
        return false
    }
    if (action.strategy === 'ai-patch' || action.strategy === 'ai-suggestion') {
        return false
    }
    if (action.type === 'dependency-upgrade') {
        return !action.target.startsWith('PR #')
    }
    return action.type === 'code-scanning-fix' || action.type === 'lockfile-repair'
}

/** 是否存在可交付的成功修复（零修复不 commit / 不建 PR）。 */
export function hasDeliverableFixes(actions: FixAction[]): boolean {
    return actions.some(isDeliverableFix)
}

/**
 * 修复后验证中安装命令仍为既有失败（基线 install 红 + 修复后仍红）。
 *
 * 这类运行即使存在其它成功修复，也不应创建普通 PR：安装门禁本身未恢复，CI 会以同一
 * 错误失败。若 lockfile repair 让修复后安装转绿，则不会命中本判定，仍允许交付。
 */
export function isPreExistingInstallFailure(action: FixAction): boolean {
    return action.type === 'verification'
        && action.success === false
        && action.preExisting === true
        && isInstallCommand(action.target)
}

/** 是否存在修复后仍为既有失败的安装命令（run 级）。 */
export function hasPreExistingInstallFailure(actions: FixAction[]): boolean {
    return actions.some(isPreExistingInstallFailure)
}

/**
 * 返回「既有安装失败 **且** 本仓库有可交付修复」的仓库列表。
 *
 * 交付是 run 级（一个 PR / 一次 commit），但安装失败是仓库级：只按 run 级判定会让
 * B 仓的既有安装失败阻断 A 仓的有效修复（多仓共享 workDir 时会静默少交付）。因此只
 * 阻断「自身安装仍红、同时又有修复要交付」的仓库；零修复仓库由零修复守卫处理。
 */
export function findInstallBlockedReposWithFixes(actions: FixAction[]): string[] {
    const fixRepos = new Set(actions.filter(isDeliverableFix).map((action) => action.repository))
    return [...new Set(
        actions
            .filter(isPreExistingInstallFailure)
            .map((action) => action.repository)
            .filter((repo) => fixRepos.has(repo)),
    )]
}

/**
 * 收集给定仓库上「既有失败的安装命令」（去重，保持执行顺序）。
 *
 * 报告与交付降级 issue 正文只引用命令本身：错误文本可能含凭据 / 路径，且会让
 * 失败指纹随日志抖动漂移（见 [pr-delivery-closure-history.md §16]）。
 */
export function collectFailingInstallCommands(actions: FixAction[], repositories: string[]): string[] {
    const scoped = new Set(repositories)
    const commands: string[] = []
    for (const action of actions) {
        if (!scoped.has(action.repository) || !isPreExistingInstallFailure(action)) {
            continue
        }
        if (!commands.includes(action.target)) {
            commands.push(action.target)
        }
    }
    return commands
}

/**
 * 记录一次交付跳过（run 级；`summary.deliverySkipped*` 由 `computeSummary` 据此派生）。
 *
 * 入参用结构化最小面（而非 `AppContext`）以避免 `helpers.ts ↔ delivery.ts` 循环依赖；
 * 返回同一条记录引用，便于调用方创建载体后回填编号。
 */
export function recordDeliverySkip(
    target: { deliverySkips?: DeliverySkipRecord[] },
    record: DeliverySkipRecord,
): DeliverySkipRecord {
    const list = target.deliverySkips ?? (target.deliverySkips = [])
    list.push(record)
    return record
}
