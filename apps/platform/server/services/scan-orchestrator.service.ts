import type { RunResult } from '@dependfix/core'
import { resolveScanRunState } from './scan-run-state'
import { withRepoLock } from './repo-lock'
import { decryptToken, getEncryptionKey } from './credential.service'
import { ContainerExecutor } from './executor/container-executor'
import { SandboxExecutor } from './executor/sandbox-executor'
import { ActionTriggerExecutor } from './executor/action-trigger-executor'
import { ActionResultFetcher } from './executor/action-result-fetcher'
import type { ScanExecutorContext } from './executor/types'
import { notifyEnvEvent } from './notification'
import type { NotificationEvent } from './notification/channel'
import { Repository, parseSandboxLimits } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * 扫描编排：触发 → 执行 → 落库（同步执行模型 Q2，请求内完成）。
 *
 * 流程：
 * 1. 读取 Repository + 关联 Credential（解密仅执行时内存）
 * 2. 按 executorKind 选择执行器（container 默认 / github-action 需配置 actionWorkflowFile）
 * 3. 执行 → 结果落库 ScanRun + ScanResult（原子写：失败不写半截结果）
 * 4. 回填 Repository.lastScanAt
 *
 * 并发防护：同仓库互斥（进程内锁；队列化后由 BullMQ jobId 去重承接跨进程/多实例语义，本锁兜底单进程内竞态）。
 * 同一仓库同一时间只允许一个扫描——防止容器执行器对同一 workDir 的并发写冲突。
 */

export interface ScanRequest {
    /** 扫描模式（report-only / fix / fix-and-pr） */
    mode: 'report-only' | 'fix' | 'fix-and-pr'
    /** 严重级别阈值（critical / high / medium / all） */
    severityThreshold: string
    /** 执行后端（默认 container；sandbox 启动时不可用自动降级） */
    executorKind?: 'container' | 'github-action' | 'sandbox'
}

export interface ScanRunOptions {
    /** 队列模式：复用已创建的 pending run（worker 消费时续用）；同步模式不传则新建 */
    runId?: string
    /** 所属批量运行 id（定时/批量触发时关联；单独手动触发不传为 null） */
    batchRunId?: string
    /**
     * 用户主动复用既有 ScanRun（todo.md §M16.2 C66-D）：绕过"终态不可续用"校验，
     * 并重置 status / finishedAt / errorJson / summaryJson（让既有 record 复用为新执行的载体）。
     * 与 queue-mode continuation（runId 单传）区分：
     * - queue-mode：仅 pending / running 可续用；terminal 不允许（崩溃重试场景）
     * - reuse=true：terminal 也允许（用户主动复用，例如 report-only → fix）
     */
    reuse?: boolean
}

/** 执行器选择：请求显式指定优先 > 仓库 executorKind 字段 > actionWorkflowFile 自动（B 模式） > 默认 container */
const resolveExecutorKind = (
    repository: Repository,
    request: ScanRequest,
): 'container' | 'github-action' | 'sandbox' => {
    if (request.executorKind) {
        return request.executorKind
    }
    const repoKind = repository.executorKind as 'container' | 'github-action' | 'sandbox' | undefined
    if (repoKind === 'sandbox' || repoKind === 'github-action') {
        return repoKind
    }
    return repository.actionWorkflowFile ? 'github-action' : 'container'
}

/**
 * 队列模式：预创建 pending run（API 入队时调用，立即返回；worker 消费时经
 * runScanForRepository({ runId }) 续用并标记 running）。
 */
export const createPendingScanRun = async (
    repositoryId: string,
    request: ScanRequest,
    options?: { batchRunId?: string },
): Promise<ScanRun> => {
    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const runRepo = ds.getRepository(ScanRun)

    const repository = await repoRepo.findOne({ where: { id: repositoryId } })
    if (!repository) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '仓库不存在' })
    }

    const run = runRepo.create({
        repositoryId: repository.id,
        mode: request.mode,
        severityThreshold: request.severityThreshold,
        executorKind: resolveExecutorKind(repository, request),
        status: 'pending',
        startedAt: null,
        batchRunId: options?.batchRunId ?? null,
    })
    return runRepo.save(run)
}

export const runScanForRepository = async (
    repositoryId: string,
    request: ScanRequest,
    options?: ScanRunOptions,
): Promise<ScanRun> =>
    // 同仓库互斥：同一仓库同时只允许一个扫描（防止容器执行器并发写同一 workDir）
    withRepoLock(repositoryId, () => runScanInternal(repositoryId, request, options))


const runScanInternal = async (
    repositoryId: string,
    request: ScanRequest,
    options?: ScanRunOptions,
): Promise<ScanRun> => {
    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    const repository = await repoRepo.findOne({
        where: { id: repositoryId },
        relations: { credential: true },
    })
    if (!repository) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '仓库不存在' })
    }

    // 执行器选择：显式指定优先，其次按 actionWorkflowFile 自动（B 模式）
    const executorKind = resolveExecutorKind(repository, request)

    // 预创建/续用 ScanRun（队列模式续用 pending run；同步模式新建 running run——失败时更新为 failed 保持一条记录可追溯）
    let savedRun: ScanRun
    if (options?.runId) {
        const existing = await runRepo.findOne({ where: { id: options.runId } })
        if (!existing) {
            throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '扫描记录不存在' })
        }
        // 终态校验（竞态防护）：入队半成功 + failover 双执行时，job 续用不得回滚已终态的 run
        // （worker 侧抛错走 BullMQ 重试/失败，不触碰 run 记录）；pending/running 允许续用（保留崩溃重试）
        // —— reuse=true 时绕过（用户主动复用，例如 report-only run → fix 复用为 fix 模式 run）
        if (!options.reuse
            && (existing.status === 'completed' || existing.status === 'failed' || existing.status === 'dispatched' || existing.status === 'degraded')) {
            throw new Error(`[scan] run ${existing.id} 已处于终态 ${existing.status}，跳过重复执行`)
        }
        existing.status = 'running'
        existing.startedAt = existing.startedAt ?? new Date()
        // reuse=true 时重置终态字段：让既有 record 复用为新执行的载体（finishedAt / errorJson /
        // summaryJson 来自上一次执行，重置以避免新执行的 summaryJson 与旧 finishedAt 时间戳错位）
        if (options.reuse) {
            // 清空旧 ScanResult（与 ScanRun 字段重置同步）：避免按 scanRunId JOIN 查询
            // （alerts dedupe / /api/runs/[id] / `run-detail-dialog` 渲染）出现"旧 report-only
            // 告警 + 新 fix 告警"并存的数据不一致
            await resultRepo.delete({ scanRunId: existing.id })
            existing.finishedAt = null
            existing.errorJson = null
            existing.summaryJson = null
            existing.runUrl = null
            // 同时更新 mode / severityThreshold 以匹配本次请求（用户从 report-only 切到 fix）
            existing.mode = request.mode
            existing.severityThreshold = request.severityThreshold
            existing.executorKind = executorKind
        }
        savedRun = await runRepo.save(existing)
    } else {
        const run = runRepo.create({
            repositoryId: repository.id,
            mode: request.mode,
            severityThreshold: request.severityThreshold,
            executorKind,
            status: 'running',
            startedAt: new Date(),
            batchRunId: options?.batchRunId ?? null,
        })
        savedRun = await runRepo.save(run)
    }

    // 解密凭据（仅执行时内存，用后即弃）
    let token: string | undefined
    if (repository.credentialId) {
        const credential = await ds.getRepository(Credential).findOne({ where: { id: repository.credentialId } })
        if (credential?.encryptedToken) {
            token = decryptToken(credential.encryptedToken, getEncryptionKey())
        }
    }

    const ctx: ScanExecutorContext = {
        runId: savedRun.id,
        repository: {
            owner: repository.owner,
            name: repository.name,
            defaultBranch: repository.defaultBranch,
            packageManager: repository.packageManager as 'pnpm' | 'npm' | 'yarn',
            actionWorkflowFile: repository.actionWorkflowFile ?? undefined,
        },
        config: {
            mode: request.mode,
            severityThreshold: request.severityThreshold as 'critical' | 'high' | 'medium' | 'all',
            repositories: [`${repository.owner}/${repository.name}`],
            dryRun: false,
            createPullRequest: request.mode === 'fix-and-pr',
            commit: request.mode === 'fix',
            cleanupBranches: false,
            cleanupBranchesAuto: false,
            githubToken: token ?? '',
            alertSource: 'github-dependabot',
            codeScanningEnabled: false,
            codeQualityEnabled: false,
            allowMajorUpgrade: false,
            maxAlertsPerRepository: 20,
            maxConcurrency: 1,
            maxRetries: 3,
            maxBackoffMs: 30_000,
        },
        credential: token ? { token } : undefined,
        workDir: savedRun.id,
    }

    try {
        // 执行器路由
        let result: RunResult | undefined
        let error: { code: string, message: string } | undefined
        let runUrl: string | null = null
        // 降级信号（todo.md §M11 T1005-C）：sandbox 启动时不可用 → 自动降级 ContainerExecutor → degradedReason 记录原 sandbox_unavailable
        // 范围：try 块顶层，确保 decision 处理块可见（degraded 状态机决策的输入）
        let degradedReason: { code: string, message: string } | undefined

        if (executorKind === 'github-action') {
            const executor = new ActionTriggerExecutor(token ?? '')
            const execResult = await executor.execute(ctx)
            result = execResult.result
            error = execResult.error
            runUrl = execResult.runUrl ?? null

            // 触发成功且定位到 run → 等待 action 完成并拉取报告回填（结果回填见 docs/design/governance/executor-sandbox.md §4）
            if (!error && execResult.runId) {
                try {
                    const fetcher = new ActionResultFetcher(token ?? '')
                    const fetched = await fetcher.fetch(repository.owner, repository.name, execResult.runId)
                    if (fetched) {
                        result = fetched
                        error = undefined
                    }
                } catch (fetchError) {
                    // 结果拉取失败不阻断触发（run 已在目标仓库运行）；标记 dispatched + 提示
                    error = {
                        code: 'result_fetch_failed',
                        message: fetchError instanceof Error ? fetchError.message : String(fetchError),
                    }
                }
            }
        } else if (executorKind === 'sandbox') {
            // sandbox 路由：先探测 RuntimeAdapter 可用性（docker daemon 可用性）。
            // **降级信号契约**（todo.md §M11 T1005-C，2026-08-20）：
            // - 启动时不可用（isAvailable() false）→ 自动降级回 ContainerExecutor + degradedReason 记录 → degraded 状态
            //   （业务结果完整，UI info 提示，不静默降级）
            // - 运行时偶发故障（execute() 抛 errno）→ 不静默降级，sandbox_unavailable 错误码 → failed 状态
            //   （环境中途变化，UI warn 告警，避免掩盖真实错误）
            // 详见 executor-sandbox.md §7.8
            const sandbox = new SandboxExecutor({
                workRoot: process.env.RUN_WORK_ROOT ?? 'data/runs',
                // todo.md §M11 T1005-B：仓库级 sandboxLimits 透传（可选；undefined 时走平台 SANDBOX_DEFAULTS）。
                // 限额优先级：仓库级 > 沙箱级 > SANDBOX_DEFAULTS（见 sandbox-executor.ts:107 注释）。
                sandboxLimits: parseSandboxLimits(repository.sandboxLimits),
            })
            if (await sandbox.isAvailable()) {
                // 启动可用 → 走 sandbox（可能 B 场景：execute 抛 errno → sandbox_unavailable）
                const execResult = await sandbox.execute(ctx)
                result = execResult.result
                error = execResult.error
            } else {
                // A 场景：启动时不可用 → 记录降级原因 + 走 ContainerExecutor
                degradedReason = {
                    code: 'sandbox_unavailable',
                    message: `沙箱执行器启动时不可用（无 rootless daemon / user namespace 受限），已自动降级到平台容器（${repository.owner}/${repository.name}）`,
                }
                console.warn(`[sandbox] Repository ${repository.owner}/${repository.name} executorKind='sandbox' but daemon unavailable; falling back to container`)
                const executor = new ContainerExecutor({
                    workRoot: process.env.RUN_WORK_ROOT ?? 'data/runs',
                })
                const execResult = await executor.execute(ctx)
                result = execResult.result
                error = execResult.error
                runUrl = execResult.runUrl ?? null
            }
        } else {
            const executor = new ContainerExecutor({
                workRoot: process.env.RUN_WORK_ROOT ?? 'data/runs',
            })
            const execResult = await executor.execute(ctx)
            result = execResult.result
            error = execResult.error
            // A 模式（container）：fix / fix-and-pr 完成后 executor 端推送修复分支，
            // runUrl 指向 GitHub branch tree 页（参见 container-executor.pushFixBranch 后置）
            runUrl = execResult.runUrl ?? null
        }

        // 落库（状态机决策见 scan-run-state.ts 纯函数）：
        // - A 模式（container）：成功 → completed + results；执行级失败 → failed（不写半截结果）
        // - B 模式（github-action）：结果已拉取 → completed + results；触发已受理但结果未就绪
        //   （result_fetch_failed / run_url_not_resolved：action 已在目标仓库运行）→ dispatched + runUrl + 提示；
        //   仅触发级失败（workflow 未配置/不存在/无权限等，action 未运行）→ failed
        // - sandbox 启动时降级（A 场景，详见 executor-sandbox.md §7.8）：degraded + summaryJson + runUrl + errorJson
        //   （业务结果完整，路径偏离；errorJson 保留 sandbox_unavailable 错误码便于审计）
        const decision = resolveScanRunState(executorKind, error, result, degradedReason)
        if (decision.status === 'dispatched') {
            savedRun.status = 'dispatched'
            savedRun.runUrl = runUrl
            savedRun.errorJson = decision.errorJson ? JSON.stringify(decision.errorJson) : null
        } else if (decision.status === 'failed') {
            savedRun.status = 'failed'
            savedRun.finishedAt = new Date()
            savedRun.errorJson = error ? JSON.stringify(error) : null
        } else if (decision.status === 'degraded') {
            // degraded：业务结果完整 + 路径偏离（与 completed 等价写 summaryJson + runUrl）
            savedRun.status = 'degraded'
            savedRun.finishedAt = new Date()
            savedRun.errorJson = decision.errorJson ? JSON.stringify(decision.errorJson) : null
            if (result) {
                savedRun.summaryJson = JSON.stringify(result.summary)
                savedRun.runUrl = runUrl
                // 原子写结果明细（与 RunResult.alerts 一一对应；degraded 的 ScanResult 参与 severityCounts 统计——业务完整）
                const results = (result as RunResult).alerts.map((alert) => ({
                    scanRunId: savedRun.id,
                    source: alert.source,
                    severity: alert.severity,
                    packageName: alert.packageName,
                    manifestPath: alert.manifestPath,
                    ruleId: alert.ruleId,
                    summary: alert.summary,
                    fixable: alert.fixable,
                    fixStrategy: alert.fixStrategy,
                    recommendedVersion: alert.recommendedVersion,
                    htmlUrl: alert.htmlUrl,
                }))
                if (results.length > 0) {
                    await resultRepo.save(resultRepo.create(results))
                }
            }
        } else if (result) {
            savedRun.status = 'completed'
            savedRun.finishedAt = new Date()
            savedRun.summaryJson = JSON.stringify(result.summary)
            savedRun.runUrl = runUrl
            // 原子写结果明细（与 RunResult.alerts 一一对应）
            const results = (result as RunResult).alerts.map((alert) => ({
                scanRunId: savedRun.id,
                source: alert.source,
                severity: alert.severity,
                packageName: alert.packageName,
                manifestPath: alert.manifestPath,
                ruleId: alert.ruleId,
                summary: alert.summary,
                fixable: alert.fixable,
                fixStrategy: alert.fixStrategy,
                recommendedVersion: alert.recommendedVersion,
                htmlUrl: alert.htmlUrl,
            }))
            if (results.length > 0) {
                await resultRepo.save(resultRepo.create(results))
            }
        }

        // 回填仓库最近扫描时间
        repository.lastScanAt = new Date()
        await repoRepo.save(repository)

        const persistedRun = await runRepo.save(savedRun)

        // 环境事件审计（fire-and-forget）：
        // - A 场景 sandbox 启动降级 → sandbox_degraded 事件
        // - B 场景 sandbox 运行时失败 → sandbox_unavailable 事件
        // 不阻塞扫描主流程：失败仅日志 + audit_event 落库
        await recordEnvAuditEvent(persistedRun, decision, degradedReason, error)

        return persistedRun
    } catch (error) {
        savedRun.status = 'failed'
        savedRun.finishedAt = new Date()
        savedRun.errorJson = JSON.stringify({
            code: 'orchestration_failed',
            message: error instanceof Error ? error.message : String(error),
        })
        return await runRepo.save(savedRun)
    }
}

/**
 * 环境事件审计：sandbox 启动降级（A 场景）或运行时失败（B 场景）
 * 时落 AuditEvent + fire-and-forget 通知。
 *
 * 设计要点：
 * - 不抛错（fail-closed）：审计失败仅日志，不影响扫描主流程
 * - 通知 fire-and-forget：notifyEnvEvent 内部已捕获 channel 异常
 * - A 场景与 B 场景的事件类型与 severity 区分：
 *   - A 场景 sandbox_degraded / warn（业务结果完整，UI info 提示）
 *   - B 场景 sandbox_unavailable / error（环境变化但 UI warn 提示）
 */
async function recordEnvAuditEvent(
    persistedRun: ScanRun,
    decision: ReturnType<typeof resolveScanRunState>,
    degradedReason: { code: string, message: string } | undefined,
    error: { code: string, message: string } | undefined,
): Promise<void> {
    let eventType: 'sandbox_unavailable' | 'sandbox_degraded' | null = null
    let severity: 'info' | 'warn' | 'error' | 'critical' = 'warn'
    let payload: Record<string, unknown> = {}

    if (decision.status === 'degraded' && degradedReason?.code === 'sandbox_unavailable') {
        // A 场景：sandbox 启动时不可用，已自动降级 ContainerExecutor（业务完整）
        eventType = 'sandbox_degraded'
        severity = 'warn'
        payload = { degradedReason, fallback: 'container' }
    } else if (decision.status === 'failed' && error?.code === 'sandbox_unavailable') {
        // B 场景：sandbox 运行时偶发故障，不静默降级（避免掩盖真实错误）
        eventType = 'sandbox_unavailable'
        severity = 'error'
        // payload 包含 errno + code + adapter + message 便于事故溯源
        // adapter 当前固定 docker（唯一已实现的 RuntimeAdapter；未来加 sysbox/kata 时按 executor 注入）
        payload = {
            errno: error.code,
            code: error.code,
            adapter: 'docker',
            message: error.message,
        }
    }

    if (!eventType) {
        return
    }

    try {
        const ds = await ensureDatabaseInitialized()
        const eventRepo = ds.getRepository(AuditEvent)
        const audit = await eventRepo.save(eventRepo.create({
            type: eventType,
            severity,
            repositoryId: persistedRun.repositoryId,
            scanRunId: persistedRun.id,
            payloadJson: JSON.stringify(payload),
            notified: false,
            notifiedVia: null,
        }))

        // 触发通知（fire-and-forget，不 await，避免阻塞扫描主流程）
        const notificationEvent: NotificationEvent = {
            id: audit.id,
            type: eventType,
            severity,
            message: (payload.degradedReason as { message?: string } | undefined)?.message
                ?? (payload.message as string | undefined)
                ?? `${eventType} for ${persistedRun.repositoryId}`,
            scanRunId: persistedRun.id,
            payload,
            createdAt: audit.createdAt,
        }
        // 异步触发：失败由 notifyEnvEvent 内部捕获（fail-closed）
        notifyEnvEvent(notificationEvent).catch((e) => {
            console.error(`[scan-orchestrator] notifyEnvEvent fire-and-forget failed for audit ${audit.id}:`, e)
        })
    } catch (e) {
        console.error('[scan-orchestrator] failed to record env audit event:', e)
    }
}
