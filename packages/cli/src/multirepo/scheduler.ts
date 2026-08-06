import PQueue from 'p-queue'
import type { Logger } from '@dependfix/core'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 并发上限（1-16，T402 配置校验范围） */
export const MAX_CONCURRENCY_LIMIT = 16
/** 默认并发（保守：行为与现状一致，逐仓库串行） */
export const DEFAULT_CONCURRENCY = 1

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConcurrencySchedulerOptions<T> {
    items: T[]
    /** 并发窗口（1-16） */
    concurrency: number
    /** 单仓库任务（内部应自行 catch 并记录仓库级失败结果） */
    task: (item: T) => Promise<void>
    /** 调度日志（可选） */
    logger?: Logger
    /**
     * 防御性失败隔离回调：task 未捕获的异常在此兜底记录，
     * 不中断其余任务执行。
     */
    onError?: (item: T, error: unknown) => void
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * 以受限并发执行任务列表（T402）。
 *
 * - 并发窗口 = concurrency（p-queue 调度；>1 时调用方应输出警告）
 * - 失败隔离：单任务异常不影响其余任务（配合 task 内部 try-catch +
 *   onError 兜底，保证"单仓库失败不中断整体"）
 * - 任务完成顺序不保证（并发下与输入顺序无关），但每个任务都会被调度
 */
export async function runWithConcurrency<T>(
    options: ConcurrencySchedulerOptions<T>,
): Promise<void> {
    const { items, concurrency, task, logger, onError } = options

    if (items.length === 0) {
        return
    }

    logger?.info(`[scheduler] processing ${items.length} item(s) with concurrency ${concurrency}`)

    const queue = new PQueue({ concurrency })
    await Promise.all(items.map((item) => queue.add(async () => {
        try {
            await task(item)
        } catch (error: unknown) {
            // 防御层：task 内部未捕获的异常在此兜底，避免中断整体
            onError?.(item, error)
        }
    })))
}

/** 校验并发值是否在 1-16 范围内（config 层调用，抛 AppError）。 */
export function isValidConcurrency(value: number): boolean {
    return Number.isInteger(value) && value >= 1 && value <= MAX_CONCURRENCY_LIMIT
}
