/**
 * 定时调度服务（双模）：
 * - async 模式：BullMQ upsertJobScheduler（Redis 持久化、多实例安全、原生 cron）
 * - sync 降级模式：node-cron 进程内调度（单实例可用；多实例部署必须 QUEUE_ENABLED=true）
 * 决策见 docs/design/governance/platform-scheduled-batch.md §4。
 *
 * Schedule 增删改时通过 registerSchedule / unregisterSchedule 同步更新调度注册；
 * triggerSchedule 为统一触发入口（cron 到点 / 手动触发 / Worker scheduled-scan job 共用）：
 * 解析仓库列表 → executeBatchRun（创建 BatchRun → 逐仓库入队/串行）→ 回填触发信息。
 */
import cron, { type ScheduledTask } from 'node-cron'
import { createError } from 'h3'
import { getQueueService } from '../queue/queue.service'
import { SCAN_JOB_PRIORITY } from '../queue/queue-mode'
import type { ScanRequest } from '../scan-orchestrator.service'
import { executeBatchRun } from '../batch/batch-executor'
import { resolveRepositoryIds, type ScheduleSelectorData } from './selector'
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

/**
 * 统一触发：解析仓库列表 → executeBatchRun（创建 BatchRun → 逐仓库执行）→ 回填触发信息。
 * 手动触发（/api/schedules/[id]/trigger）与 cron 到点、Worker scheduled-scan job 消费共用；
 * disabled 计划手动触发也允许（测试配置用），但调度器不会自动触发。
 */
export const triggerSchedule = async (scheduleId: string): Promise<TriggerResult> => {
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

    // 统一批量执行（与手动批量 API 共用）：创建 BatchRun → 逐仓库入队（async）/串行（sync）；
    // 空批次/中断终态兜底在 executeBatchRun 内收敛（设计 §5.2 轮询聚合）
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

    return { batchRunId: result.batchRunId, repositoryCount: result.repositoryCount }
}

/** 供手动触发 API 与 Worker processor 复用；关闭清理（进程退出时调用，防御性） */
export const shutdownScheduler = (): void => {
    for (const task of scheduledTasks.values()) {
        // destroy 类型为 void | Promise<void>，进程内注销同步执行即可
        void task.destroy()
    }
    scheduledTasks.clear()
}
