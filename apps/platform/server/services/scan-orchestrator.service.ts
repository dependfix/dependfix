import type { RunResult } from '@dependfix/core'
import { resolveScanRunState } from './scan-run-state'
import { withRepoLock } from './repo-lock'
import { decryptToken, getEncryptionKey } from './credential.service'
import { ContainerExecutor } from './executor/container-executor'
import { SandboxExecutor } from './executor/sandbox-executor'
import { ActionTriggerExecutor } from './executor/action-trigger-executor'
import { ActionResultFetcher } from './executor/action-result-fetcher'
import type { ScanExecutorContext } from './executor/types'
import { Repository } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
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
        if (existing.status === 'completed' || existing.status === 'failed' || existing.status === 'dispatched' || existing.status === 'degraded') {
            throw new Error(`[scan] run ${existing.id} 已处于终态 ${existing.status}，跳过重复执行`)
        }
        existing.status = 'running'
        existing.startedAt = existing.startedAt ?? new Date()
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
        // 降级信号（M11 T1005-C）：sandbox 启动时不可用 → 自动降级 ContainerExecutor → degradedReason 记录原 sandbox_unavailable
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
            // **降级信号契约**（M11 T1005-C，2026-08-20）：
            // - 启动时不可用（isAvailable() false）→ 自动降级回 ContainerExecutor + degradedReason 记录 → degraded 状态
            //   （业务结果完整，UI info 提示，不静默降级）
            // - 运行时偶发故障（execute() 抛 errno）→ 不静默降级，sandbox_unavailable 错误码 → failed 状态
            //   （环境中途变化，UI warn 告警，避免掩盖真实错误）
            // 详见 executor-sandbox.md §7.8
            const sandbox = new SandboxExecutor({
                workRoot: process.env.RUN_WORK_ROOT ?? 'data/runs',
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

        return await runRepo.save(savedRun)
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
