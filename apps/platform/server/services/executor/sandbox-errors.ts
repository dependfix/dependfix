// sandbox-errors.ts — 沙箱执行器的错误分类与超时包装。
//
// 从 sandbox-executor 抽出：单文件行数上限与「执行流程 / 错误语义」两个职责本就分离。
// 与 container-executor / engine-run 的同名工具刻意独立（不交叉依赖），保证各执行路径可分别演进；
// 三者的超时语义如有变更需同步（见 engine-run.ts 的 ExecutionTimeoutError 与 withTimeout）。

import type { RegistryProbeFailure } from '@dependfix/core'
import { sanitizeString } from '../../utils/sanitize'
import type { ExecutorResourceUsage, ScanExecutorResult } from './types'

/** 错误分类:统一从 catch 分支调用,避免错误分类逻辑散落 */
export function classifyError(error: unknown, timeoutMs: number, startedAt: string, outputTail?: string): ScanExecutorResult {
    const finishedAt = new Date().toISOString()

    // 外层 withTimeout 触发的超时:ExecutionTimeoutError → execution_timeout
    if (error instanceof ExecutionTimeoutError) {
        // adapter 卡死时拿不到完整结果：带回已捕获输出尾部，避免「超时且零信息」
        const tail = outputTail?.trim()
        return {
            exitCode: 2,
            error: {
                code: 'execution_timeout',
                message: `执行超时(${timeoutMs}ms 上限)${tail ? `；容器输出末尾：${sanitizeString(tail).slice(-600)}` : ''}`,
            },
            startedAt,
            finishedAt,
        }
    }

    // daemon 不可用:ENOENT(docker CLI 缺失)/ ENOTCONN(daemon 卡死)/ EACCES(无权限)/ ECONNREFUSED
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT' || code === 'ENOTCONN' || code === 'EACCES' || code === 'ECONNREFUSED') {
        const raw = error instanceof Error ? error.message : String(error)
        return {
            exitCode: 2,
            error: {
                code: 'sandbox_unavailable',
                message: `沙箱执行器不可用:${sanitizeString(raw)}`,
            },
            startedAt,
            finishedAt,
        }
    }

    // 其他(容器启动失败 / 业务执行失败等):execution_failed
    const raw = error instanceof Error ? error.message : String(error)
    return {
        exitCode: 2,
        error: {
            code: 'execution_failed',
            message: sanitizeString(raw),
        },
        startedAt,
        finishedAt,
    }
}

/**
 * 安装源连通性预检失败的结果（`registry_unreachable`：安装阶段、可重试）。
 *
 * 单独成函数：沙箱执行器主流程已贴行数上限，且该错误的消息形态（目标 + errno + 探测耗时）
 * 需要与报告 / 运行详情共用同一口径。
 */
export function registryUnreachableResult(
    failure: RegistryProbeFailure,
    resource: ExecutorResourceUsage | undefined,
    startedAt: string,
): ScanExecutorResult {
    return {
        exitCode: 2,
        error: {
            code: 'registry_unreachable',
            message: `安装源不可达（${failure.host}:${failure.port}，${failure.code}，${failure.durationMs}ms）：`
                + '请检查目标 daemon 的出站策略、SANDBOX_NPM_REGISTRY 或仓库级 registry 配置',
        },
        ...(resource ? { resource } : {}),
        startedAt,
        finishedAt: new Date().toISOString(),
    }
}

/** 带超时的 Promise 包装（超时抛 ExecutionTimeoutError，由 classifyError 归类） */
export class ExecutionTimeoutError extends Error {
    constructor(ms: number) {
        super(`operation timeout after ${ms}ms`)
        this.name = 'ExecutionTimeoutError'
    }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ExecutionTimeoutError(ms)), ms)
    })
    try {
        return await Promise.race([promise, timeoutPromise])
    } finally {
        clearTimeout(timer)
    }
}

