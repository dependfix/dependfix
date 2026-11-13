import type { RunResult } from '@dependfix/core'
import { deleteRemoteBranch } from '@dependfix/engine'
import { createPlatformOctokit } from './executor/platform-delivery'
import type { Repository } from '#server/entities/repository'
import type { ScanRun } from '#server/entities/scan-run'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'
import { sanitizeString } from '#server/utils/sanitize'
import { logger } from '#server/utils/logger'

/**
 * 沙箱交付失败 / 取消后的远端分支副作用处置。
 *
 * - 只处理结果显式声明的 `dependfix/` 分支：默认分支（fix 直推）与其它命名一律跳过，
 *   避免误删他人分支
 * - 删除成功 / 失败 / 跳过（无凭据、越界）都落 `delivery_branch_cleanup` 审计事件，
 *   副作用可观测；删除失败不阻断运行结论
 */
export async function cleanupFailedSandboxDelivery(
    repository: Pick<Repository, 'id' | 'owner' | 'name' | 'defaultBranch'>,
    run: Pick<ScanRun, 'id'>,
    result: RunResult | undefined,
    token: string | undefined,
): Promise<void> {
    const delivery = result?.delivery
    if (delivery?.status !== 'pushed' || !delivery.branch) {
        return
    }
    const branch = delivery.branch
    if (!branch.startsWith('dependfix/') || branch === repository.defaultBranch) {
        await recordDeliveryCleanupEvent(repository, run, branch, 'skipped', 'branch_out_of_scope')
        return
    }
    if (!token) {
        await recordDeliveryCleanupEvent(repository, run, branch, 'skipped', 'no_credential')
        return
    }
    try {
        await deleteRemoteBranch(createPlatformOctokit(token), repository.owner, repository.name, branch)
        await recordDeliveryCleanupEvent(repository, run, branch, 'deleted')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await recordDeliveryCleanupEvent(repository, run, branch, 'failed', sanitizeString(message))
    }
}

/** 交付分支清理审计事件（只落库、不通知：属副作用处置记录）。 */
export async function recordDeliveryCleanupEvent(
    repository: Pick<Repository, 'id'>,
    run: Pick<ScanRun, 'id'>,
    branch: string,
    outcome: 'deleted' | 'failed' | 'skipped',
    reason?: string,
): Promise<void> {
    try {
        const ds = await ensureDatabaseInitialized()
        const eventRepo = ds.getRepository(AuditEvent)
        await eventRepo.save(eventRepo.create({
            type: 'delivery_branch_cleanup',
            severity: outcome === 'failed' ? 'warn' : 'info',
            repositoryId: repository.id,
            scanRunId: run.id,
            payloadJson: JSON.stringify({ branch, outcome, ...(reason ? { reason } : {}) }),
            notified: false,
            notifiedVia: null,
        }))
    } catch (error) {
        logger.error('[scan-orchestrator] failed to record delivery branch cleanup event', { error })
    }
}
