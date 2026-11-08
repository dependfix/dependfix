// repo-fix-batch.ts — 版本化 overrides 的合批快路径（一次安装）与失败回退。
//
// 动机（2026-10-16 生产复盘）：逐包应用使单仓安装次数 = 可修包数（大仓实测 7–8 次），
// 每次都是完整依赖解析；在资源受限主机上这是内核 OOM 级联的放大器之一。
//
// 语义承诺（合批**只做加速**，不改变可观测语义）：
// - 成功：为每个包各产出一条版本化 override 动作（报告表 / PR 正文 / 内容指纹 / 提交信息
//   的口径与逐包路径完全一致），并计入 fixed
// - 失败（安装失败或组级验证失败）：回滚到合批前快照后返回 `false`，**不**产出动作、
//   不计数、不写审计条目——真实归因交由调用方的逐包路径给出（保持既有失败粒度）
// - peer-only 例外：不可自动修复的包在合批层直接记「跳过」（告警级展开）并经 `skipPackages`
//   排除逐包重试，这是失败回退路径里唯一会写计数/审计的分支
//
// 拆出理由：`repo-fix.ts` 已处 `max-lines` 上限（该文件的既定处置是先拆分再改）。
import { addSkipped, type NormalizedSecurityAlert } from '@dependfix/core'
import { applyVersionedOverridesBatch, type VersionedOverridesPlan } from '../fixers/dependency'
import { quickVerifyProject, restoreTrackedFiles, snapshotTrackedFiles } from '../helpers'
import { getAbortReason, isAbortRequested } from '../runners/process-control'
import { recordSkippedAlerts } from './alert-outcomes'
import type { RepoFixCtx, RepoFixProgress } from './repo-fix'
import { budgetAllows } from './budget'
import { recordVerificationCheckpoint } from './verification-checkpoint'

/** 合批条目（一个包一条；`targets` 用于动作的 `toVersion` 展示，与逐包路径同口径）。 */
export interface VersionedOverrideBatchItem {
    alert: NormalizedSecurityAlert
    versionedOverrides: Record<string, string>
    targets: string[]
    /** 写入前的锁定实例（`From` 列展示用；多实例以 `, ` 连接） */
    fromVersion: string
    /** 该包在本次运行中的全部待修告警（跳过记录按告警级展开，与逐包路径同源） */
    alerts: NormalizedSecurityAlert[]
}

/** 合批结果：是否已应用 + 是否应跳过逐包重试（环境性失败时逐包只会重复同一失败）。 */
export interface VersionedOverrideBatchOutcome {
    /** `true` = 已应用（动作与计数已写入，调用方不得再逐包重试） */
    applied: boolean
    /** `true` = 环境性失败（信号 / 超时 / 无 stderr 诊断），调用方应跳过逐包重试 */
    skipSequential?: boolean
    /** `true` = 全部条目均为 peer-only 等不可自动修复形态（已记跳过），调用方应直接继续后续步骤 */
    manualReviewOnly?: boolean
    /** 已记跳过、不得再逐包重试的包名（部分 peer-only 时其余包仍需重试） */
    skipPackages?: string[]
    /** 失败原因（供日志 / 审计条目复用） */
    reason?: string
    /** 运行预算不足：调用方应停止本仓库剩余安装尝试（不重试、不停机判定） */
    budgetStop?: boolean
}

/**
 * 尝试合批应用版本化 overrides（调用方仅在条目数 ≥ 2 时调用）。
 *
 * @returns `applied: true` = 已应用（动作与计数已写入，调用方不得再逐包重试）；
 *          `applied: false` = 未应用（工作区已回滚到合批前，调用方应逐包重试）；
 *          `skipSequential: true` = 环境性失败（信号 / 超时 / 无 stderr 诊断），逐包重试无归因价值且会耗尽预算
 */
export async function tryBatchVersionedOverrides(
    ctx: RepoFixCtx,
    repo: string,
    progress: RepoFixProgress,
    items: VersionedOverrideBatchItem[],
): Promise<VersionedOverrideBatchOutcome> {
    if (!budgetAllows(ctx, { repository: repo, stage: 'fix', work: `batched versioned overrides (${items.length} packages)` })) {
        return { applied: false, budgetStop: true, reason: 'run budget exhausted' }
    }
    const snapshot = snapshotTrackedFiles(ctx.workDir)
    const packages = items.map((item) => item.alert.packageName)
    await recordVerificationCheckpoint(ctx, repo, progress, `versioned-override-batch:${packages.join(',')}`)
    ctx.logger.info(
        `[multi-version] 合批 ${items.length} 个包：${packages.join(', ')}（一次安装 + 组级验证）`,
    )

    const result = await applyVersionedOverridesBatch({
        workDir: ctx.workDir,
        plans: items.map((item): VersionedOverridesPlan => ({
            packageName: item.alert.packageName,
            overrides: item.versionedOverrides,
        })),
    })

    if (!result.success) {
        restoreTrackedFiles(ctx.workDir, snapshot)
        // 运行级取消优先于环境性判定：中止是独立类别，不得伪装成 ENVIRONMENT_ERROR
        if (isAbortRequested()) {
            ctx.logger.warn('[multi-version] 合批安装失败（运行已取消） — 跳过逐包重试')
            return { applied: false, skipSequential: true, reason: getAbortReason() ?? 'abort requested' }
        }
        if (result.environmental) {
            // 信号 / 超时属于环境级失败：逐包重试会重复同一失败，并可能耗尽单仓执行预算。
            // 审计条目走 ENVIRONMENT_ERROR（不归因本次运行），不产出逐包失败动作。
            ctx.allErrors.push({
                repository: repo,
                target: packages.join(', '),
                stage: 'fix',
                category: 'ENVIRONMENT_ERROR',
                message: `batch install failed (environmental): ${result.error ?? 'no error detail'}`,
            })
            ctx.logger.warn(
                `[multi-version] 合批安装失败（环境性：${result.error ?? 'no error detail'}）`
                + ' — 已回滚，跳过逐包重试（避免重复消耗安装预算）',
            )
            return { applied: false, skipSequential: true, reason: result.error }
        }
        if (result.manualReviewPackages?.length) {
            // peer-only 包不可自动修复（逐包重试只会得到同一结论）：只对它们记跳过；
            // 其余包仍走逐包重试——合批回滚不影响它们的可修复性。
            const peerOnlyPackages = new Set(result.manualReviewPackages)
            for (const item of items) {
                if (!peerOnlyPackages.has(item.alert.packageName)) {
                    continue
                }
                // 告警级口径：同包全部告警都记跳过（与逐包路径同源）
                addSkipped(ctx.summary, 'peer-only', item.alerts.length)
                recordSkippedAlerts(ctx, item.alerts, 'peer-only')
            }
            if (peerOnlyPackages.size === items.length) {
                ctx.logger.warn(
                    `[multi-version] 合批命中不可自动修复形态（${result.error ?? 'manual review required'}）`
                    + ' — 已回滚，跳过逐包重试',
                )
                return {
                    applied: false,
                    manualReviewOnly: true,
                    skipPackages: [...peerOnlyPackages],
                    reason: result.error,
                }
            }
            ctx.logger.warn(
                `[multi-version] 合批含 ${peerOnlyPackages.size} 个不可自动修复包 — 已回滚，逐包重试其余包`,
            )
            return { applied: false, skipPackages: [...peerOnlyPackages] }
        }
        ctx.logger.warn(
            `[multi-version] 合批安装失败（${result.error ?? 'no error detail'}）— 已回滚，改为逐包重试`,
        )
        return { applied: false }
    }

    const groupOk = await quickVerifyProject(ctx, repo)
    if (!groupOk) {
        restoreTrackedFiles(ctx.workDir, snapshot)
        ctx.logger.warn('[multi-version] 合批后组级验证失败 — 已回滚，改为逐包重试（失败点见上方留痕）')
        return { applied: false }
    }

    for (const item of items) {
        ctx.allActions.push({
            type: 'dependency-upgrade',
            repository: item.alert.repository,
            target: item.alert.packageName,
            fromVersion: item.fromVersion,
            toVersion: item.targets.join(', '),
            isMajor: false,
            strategy: 'versioned-override',
            success: true,
            durationMs: 0,
        })
        progress.fixed++
    }
    ctx.logger.info(`[multi-version] 合批 ${items.length} 个包：versioned overrides passed verification`)
    return { applied: true }
}
