/**
 * 定时调度服务（双模）：
 * - async 模式：BullMQ upsertJobScheduler（Redis 持久化、多实例安全、原生 cron）
 * - sync 降级模式：node-cron 进程内调度（单实例可用；多实例部署必须 QUEUE_ENABLED=true）
 * 决策见 docs/design/governance/platform-scheduled-batch.md §4。
 *
 * Schedule 增删改时通过 registerSchedule / unregisterSchedule 同步更新调度注册；
 * triggerSchedule 为统一触发入口（cron 到点 / 手动触发 / Worker scheduled-scan job 共用）：
 * - schedule.kind === 'scan' → 解析仓库列表 → executeBatchRun（创建 BatchRun → 逐仓库入队/串行）→ 回填触发信息
 * - schedule.kind === 'pr-check' → 解析仓库列表 → ActionStatusMonitor.pollOnce（详见 docs/plan/todo.md §M24.1）
 */
import cron, { type ScheduledTask } from 'node-cron'
import { createError } from 'h3'
import { createGitHubClient } from '@dependfix/engine'
import { fromPat } from '@dependfix/engine/auth'
import { getQueueService } from '../queue/queue.service'
import { SCAN_JOB_PRIORITY } from '../queue/queue-mode'
import type { ScanRequest } from '../scan-orchestrator.service'
import { executeBatchRun } from '../batch/batch-executor'
import { ActionStatusMonitor } from '../monitor/action-status-monitor'
import { PollingSource } from '../monitor/polling-source'
import { decryptToken, getEncryptionKey } from '../credential.service'
import { resolveRepositoryIds, type ScheduleSelectorData } from './selector'
import { Credential } from '#server/entities/credential'
import { Repository } from '#server/entities/repository'
import { Schedule } from '#server/entities/schedule'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

/** scheduled-scan job 名称（Worker 侧按此区分手动 scan job） */
export const SCHEDULED_JOB_NAME = 'scheduled-scan'

/**
 * BullMQ job scheduler id（与 scan jobId 同前缀规范，禁冒号——Redis key 分隔符）。
 * node-cron 任务名复用同一 id，便于双向排查。
 */
export const buildSchedulerId = (scheduleId: string): string => `schedule-${scheduleId}`

/** selectorJson JSON 容错解析（非法/缺失返回空对象；输入合法性由 scheduleSchema 拦截） */
const parseSelectorData = (raw: string | null | undefined): ScheduleSelectorData => {
    if (!raw?.trim()) {
        return {}
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
            return parsed as ScheduleSelectorData
        }
    } catch {
        // 容错：非法 JSON 不可能到达（Zod 已拦截），防御性返回空
    }
    return {}
}

/** node-cron 任务注册表（sync 模式；scheduleId → task） */
const scheduledTasks = new Map<string, ScheduledTask>()

/** 注册调度（新建或更新时调用；async 用 BullMQ scheduler / sync 用 node-cron） */
export const registerSchedule = async (schedule: Schedule): Promise<void> => {
    const queueService = await getQueueService()
    const schedulerId = buildSchedulerId(schedule.id)

    if (queueService.mode === 'async' && queueService.queue) {
        await queueService.queue.upsertJobScheduler(schedulerId, {
            pattern: schedule.cron,
            tz: schedule.timezone ?? undefined,
        }, {
            name: SCHEDULED_JOB_NAME,
            data: { scheduleId: schedule.id },
            opts: { priority: SCAN_JOB_PRIORITY.scheduled },
        })
        return
    }

    // sync 降级：进程内 node-cron（到点执行 triggerSchedule；异常不外抛避免任务中断）
    // 幂等：同 id 旧任务先销毁再注册（initScheduler 重复调用 / API 重复注册不泄漏旧任务）
    const existing = scheduledTasks.get(schedule.id)
    if (existing) {
        // destroy 类型为 void | Promise<void>，进程内注销同步执行即可
        void existing.destroy()
    }
    const task = cron.schedule(schedule.cron, () => {
        void triggerSchedule(schedule.id).catch((error) => {
            console.error(`[scheduler] schedule ${schedule.id} 触发失败：`, error)
        })
    }, {
        timezone: schedule.timezone ?? undefined,
        name: schedulerId,
    })
    scheduledTasks.set(schedule.id, task)
}

/** 注销调度（禁用/删除时调用） */
export const unregisterSchedule = async (scheduleId: string): Promise<void> => {
    const queueService = await getQueueService()
    if (queueService.mode === 'async' && queueService.queue) {
        await queueService.queue.removeJobScheduler(buildSchedulerId(scheduleId))
        return
    }
    const task = scheduledTasks.get(scheduleId)
    if (task) {
        // destroy 类型为 void | Promise<void>，进程内注销同步执行即可
        void task.destroy()
        scheduledTasks.delete(scheduleId)
    }
}

/** 初始化：注册全部启用的定时计划（进程启动时调用，幂等） */
export const initScheduler = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    const schedules = await ds.getRepository(Schedule).find({ where: { enabled: true } })
    for (const schedule of schedules) {
        await registerSchedule(schedule)
    }
    if (schedules.length > 0) {
        console.info(`[scheduler] 已注册 ${schedules.length} 个定时计划`)
    }
}

export interface TriggerResult {
    batchRunId: string
    repositoryCount: number
}

/** pr-check schedule 触发结果（详见 docs/plan/todo.md §M24.1 Phase 2） */
export interface PrCheckTriggerResult {
    processed: number
    errors: number
    /** env 开关关闭时为 true（caller 据此决定是否更新 lastTriggeredAt） */
    skipped?: boolean
}

/** triggerSchedule 返回联合类型（discriminated union by kind） */
export type ScheduleTriggerResult =
    | { kind: 'scan', batchRunId: string, repositoryCount: number }
    | { kind: 'pr-check', processed: number, errors: number, skipped?: boolean }

/**
 * 统一触发：按 schedule.kind 分支。
 * - kind='scan'：解析仓库列表 → executeBatchRun → 回填触发信息
 * - kind='pr-check'：解析仓库列表 → ActionStatusMonitor.pollOnce → 回填触发信息（env 关闭时跳过更新 lastTriggeredAt）
 *
 * 手动触发（/api/schedules/[id]/trigger）与 cron 到点、Worker scheduled-scan job 消费共用；
 * disabled 计划手动触发也允许（测试配置用），但调度器不会自动触发。
 */
export const triggerSchedule = async (scheduleId: string): Promise<ScheduleTriggerResult> => {
    const ds = await ensureDatabaseInitialized()
    const schedule = await ds.getRepository(Schedule).findOne({ where: { id: scheduleId } })
    if (!schedule) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '定时计划不存在' })
    }

    const organizationId = schedule.organizationId ?? await resolveOrganizationId(ds)
    const repositoryIds = await resolveRepositoryIds(ds, {
        kind: schedule.selectorKind,
        data: parseSelectorData(schedule.selectorJson),
        organizationId,
    })

    if (schedule.kind === 'pr-check') {
        const prResult = await triggerPrCheckSchedule(ds, schedule, repositoryIds)
        // env 关闭或 0 仓库时不更新 lastTriggeredAt（语义：未实际运行不应落触发时间戳）
        if (!prResult.skipped) {
            schedule.lastTriggeredAt = new Date()
            await ds.getRepository(Schedule).save(schedule)
        }
        return { kind: 'pr-check', processed: prResult.processed, errors: prResult.errors, skipped: prResult.skipped }
    }

    // kind='scan'（默认）：原有批量扫描链路
    const result = await executeBatchRun({
        source: 'scheduled',
        scheduleId: schedule.id,
        repositoryIds,
        request: {
            mode: schedule.mode as ScanRequest['mode'],
            severityThreshold: schedule.severityThreshold,
        },
        organizationId,
    })

    // 回填最近触发信息
    schedule.lastTriggeredAt = new Date()
    schedule.lastBatchRunId = result.batchRunId
    await ds.getRepository(Schedule).save(schedule)

    return { kind: 'scan', batchRunId: result.batchRunId, repositoryCount: result.repositoryCount }
}

/**
 * pr-check schedule 触发：按仓库聚合 credential → 构造 Octokit → ActionStatusMonitor.pollOnce。
 *
 * env 开关（详见 docs/plan/todo.md §M24.1 关键决策 D7）：
 * - ACTION_STATUS_MONITOR_ENABLED=false（默认）→ skip + log warn + 返回 { skipped: true }
 *   （caller 据此不更新 lastTriggeredAt，避免运维调试时每分钟落触发时间戳）
 * - ACTION_STATUS_MONITOR_ENABLED=true → 实际 polling
 *
 * 当前实现仅支持 PAT 路径（GitHub App 路径留作后续阶段，本批次抛 not-implemented）。
 */
const triggerPrCheckSchedule = async (
    ds: Awaited<ReturnType<typeof ensureDatabaseInitialized>>,
    schedule: Schedule,
    repositoryIds: string[],
): Promise<PrCheckTriggerResult> => {
    if (process.env.ACTION_STATUS_MONITOR_ENABLED !== 'true') {
        console.warn(
            `[scheduler] pr-check schedule ${schedule.id} 跳过触发：ACTION_STATUS_MONITOR_ENABLED 未启用（默认 false）。`
            + '设置 ACTION_STATUS_MONITOR_ENABLED=true 后重启进程。',
        )
        return { processed: 0, errors: 0, skipped: true }
    }

    if (repositoryIds.length === 0) {
        return { processed: 0, errors: 0 }
    }

    // 按 credentialId 聚合仓库（同一 PAT 多仓共享）
    const repos = await ds.getRepository(Repository).find({
        where: repositoryIds.map((id) => ({ id })),
    })

    const credentialToRepoIds = new Map<string, string[]>()
    for (const repo of repos) {
        if (!repo.credentialId) {
            console.warn(`[scheduler] 仓库 ${repo.id} 未配置 credential，跳过 polling`)
            continue
        }
        const list = credentialToRepoIds.get(repo.credentialId) ?? []
        list.push(repo.id)
        credentialToRepoIds.set(repo.credentialId, list)
    }

    let totalProcessed = 0
    let totalErrors = 0
    const encryptionKey = getEncryptionKey()

    for (const [credentialId, ids] of credentialToRepoIds) {
        const credential = await ds.getRepository(Credential).findOne({ where: { id: credentialId } })
        if (!credential) {
            console.warn(`[scheduler] credential ${credentialId} 不存在，跳过该批仓库 polling`)
            totalErrors += ids.length
            continue
        }

        // 仅 PAT 路径（M24.1 Phase 2）；GitHub App 路径留作后续阶段
        if (credential.type !== 'classic-pat' && credential.type !== 'fine-grained-pat') {
            console.warn(
                `[scheduler] credential ${credentialId} 类型 ${credential.type} 在 M24.1 Phase 2 不支持，仅 classic-pat / fine-grained-pat；`
                + 'GitHub App 路径留作后续阶段。',
            )
            totalErrors += ids.length
            continue
        }

        const token = decryptToken(credential.encryptedToken, encryptionKey)
        const auth = fromPat(token)
        const octokit = createGitHubClient({ auth })
        const pollingSource = new PollingSource(octokit)
        const monitor = new ActionStatusMonitor(ds, pollingSource)

        const result = await monitor.pollOnce({
            organizationId: schedule.organizationId ?? null,
            repositoryIds: ids,
        })
        totalProcessed += result.processed
        totalErrors += result.errors
    }

    return { processed: totalProcessed, errors: totalErrors }
}

/** 供手动触发 API 与 Worker processor 复用；关闭清理（进程退出时调用，防御性） */
export const shutdownScheduler = (): void => {
    for (const task of scheduledTasks.values()) {
        // destroy 类型为 void | Promise<void>，进程内注销同步执行即可
        void task.destroy()
    }
    scheduledTasks.clear()
}
