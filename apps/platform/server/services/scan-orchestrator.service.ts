import type { RunResult } from '@dependfix/core'
import { resolveScanRunState } from './scan-run-state'
import { applyFailureClassification } from './run-failure-classify'
import { withRepoLock } from './repo-lock'
import { decryptToken, getEncryptionKey } from './credential.service'
import { ContainerExecutor } from './executor/container-executor'
import { SandboxExecutor } from './executor/sandbox-executor'
import { ActionTriggerExecutor } from './executor/action-trigger-executor'
import { ActionResultFetcher } from './executor/action-result-fetcher'
import type { ScanExecutorContext } from './executor/types'
import { notifyEnvEvent } from './notification'
import type { NotificationEvent } from './notification/channel'
import { reconcileAlerts } from './scan-reconcile'
import { resolveAiConfig } from './ai-config-resolver'
import { Repository, parseSandboxLimits, parseVerifyCommands } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { ScanRun } from '#server/entities/scan-run'
import { Organization } from '#server/entities/organization'
import { AuditEvent, type AuditEventType } from '#server/entities/audit-event'
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
    /**
     * AI 研判开关（运行时 override 仓库默认；todo.md §M25.2a）
     * 合并优先级：API > Repository.aiEnabled > false
     */
    aiEnabled?: boolean
    /**
     * AI 研判触发范围（运行时 override 仓库默认；todo.md §M25.2a）
     * 合并优先级：API > Repository.aiTrigger > 'both'
     */
    aiTrigger?: 'failure' | 'major' | 'both'
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
    // per-alert 模型下不再需要 resultRepo 直接 INSERT；
    // reconcileAlerts 内部管理 ScanResult 写入（INSERT / UPDATE 活跃 / supersede）

    const repository = await repoRepo.findOne({
        where: { id: repositoryId },
        relations: { credential: true },
    })
    if (!repository) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '仓库不存在' })
    }

    // AI 研判配置合并（todo.md §M25.2a + [platform-ai-integration.md §5.3](../design/governance/platform-ai-integration.md)）：
    // 优先级：API override (request.aiEnabled/aiTrigger) > Repository 默认 > Organization 共享 Key
    // provider / model / apiKey / baseUrl / apiUrl 仅取 Organization 级（仓库级无 override——Key 管理是组织级）
    const orgRepo = ds.getRepository(Organization)
    const organization = repository.organizationId
        ? await orgRepo.findOne({ where: { id: repository.organizationId } })
        : null

    // resolveAiConfig 返回 { ai, error }：error 不为 null 时本次扫描拒绝启动
    const aiConfigResolution = resolveAiConfig(request, repository, organization)
    if (aiConfigResolution.error) {
        throw createError({
            statusCode: aiConfigResolution.error.statusCode,
            statusMessage: 'Not Found',
            message: aiConfigResolution.error.message,
        })
    }
    const resolvedAi = aiConfigResolution.ai

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
            // per-alert 模型下不再需要清空该 run 的 ScanResult：reconcile 函数
            // 会按 upstreamId 复用现有行（保留 fixStatus='success' 的修复记录，决策 1）；
            // 而新出现的告警会 INSERT；上游消失的告警会 supersede。
            // 旧 ScanResult 行无需删除 —— 让 reconcile 自然处理。
            // 注意：per-alert 模型之前 `resultRepo.delete({ scanRunId })` 是为避免"按 scanRunId JOIN
            // 出现旧 + 新并存"——但 per-alert 模型下 ScanResult 不再按 scanRunId JOIN（每行是独立告警），
            // 此删除逻辑已无意义。
            existing.finishedAt = null
            existing.errorJson = null
            existing.summaryJson = null
            existing.runUrl = null
            // 复用既有记录时一并清空上次执行的失败分类（避免旧 stage/kind 残留到新执行）
            existing.failureCode = null
            existing.failureStage = null
            existing.failureKind = null
            // 同时更新 mode / severityThreshold 以匹配本次请求（用户从 report-only 切到 fix）
            existing.mode = request.mode
            existing.severityThreshold = request.severityThreshold
            existing.executorKind = executorKind
            // reuse 时也刷新 AI 配置快照（apiKey 不写入快照；hasApiKey 标记替代）
            existing.aiConfigSnapshot = aiConfigResolution.snapshot
                ? JSON.stringify(aiConfigResolution.snapshot)
                : null
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
            // AI 配置快照（apiKey 不写入；hasApiKey 标记替代）；见 resolveAiConfig
            aiConfigSnapshot: aiConfigResolution.snapshot
                ? JSON.stringify(aiConfigResolution.snapshot)
                : null,
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
            // 仓库级自定义验证命令（JSON 数组列 → 命令数组；缺省空数组 → 引擎默认链；见 docs/standards/platform.md §3.8）
            verifyCommands: parseVerifyCommands(repository.verifyCommands),
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
            maxRepos: 100,
            // AI 研判配置（M25.2a）：runtime 注入，已合并优先级 + 解密 apiKey
            // 见 [resolveAiConfig] 函数注释（AI 合并优先级 + 错误规则）
            ai: resolvedAi,
        },
        credential: token ? { token } : undefined,
        workDir: savedRun.id,
    }

    try {
        // 执行器路由
        let result: RunResult | undefined
        let error: { code: string, message: string } | undefined
        let runUrl: string | null = null
        // DependfixApp.run() 返回的进程级 exit code（0 / 1 / 2）。透传给状态机作为
        // 引擎交付类 category 识别之外的进程级兜底（exitCode=2 + result 存在 → 标记 failed）。
        // B 模式（github-action）executor 不会透传 exitCode，保持 undefined。
        let exitCode: number | undefined
        // 降级信号（todo.md §M11 T1005-C）：sandbox 启动时不可用 → 自动降级 ContainerExecutor → degradedReason 记录原 sandbox_unavailable
        // 范围：try 块顶层，确保 decision 处理块可见（degraded 状态机决策的输入）
        let degradedReason: { code: string, message: string } | undefined
        // 执行日志（MemoryLogger 输出，仅 container 执行器支持）
        let logsJson: string | undefined | null

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
                exitCode = execResult.exitCode
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
                // 降级目标（container）同样先探测环境可用性：二者皆不可用 → container_unavailable
                // 环境事件（与 container 路由同口径，避免以 orchestration_failed 掩盖环境根因）
                const execResult = await runContainerExecutor(executor, ctx)
                result = execResult.result
                error = execResult.error
                exitCode = execResult.exitCode
                runUrl = execResult.runUrl
            }
        } else {
            const executor = new ContainerExecutor({
                workRoot: process.env.RUN_WORK_ROOT ?? 'data/runs',
            })
            // 执行环境健康探测：container 无更底层回退，工作根不可写（磁盘满 / 只读 FS）
            // 属「环境不可用」而非单次运行结果 → 记 container_unavailable 环境事件（recordEnvAuditEvent）
            // 并让该 run failed（不进入 execute，避免以 execution_failed 掩盖环境根因）。
            const execResult = await runContainerExecutor(executor, ctx)
            result = execResult.result
            error = execResult.error
            exitCode = execResult.exitCode
            // A 模式（container）：fix / fix-and-pr 完成后 executor 端推送修复分支，
            // runUrl 指向 GitHub branch tree 页（参见 container-executor.pushFixBranch 后置）
            runUrl = execResult.runUrl
            // 捕获执行日志（MemoryLogger 输出）
            logsJson = execResult.logsJson
        }

        // 落库（状态机决策见 scan-run-state.ts 纯函数）：
        // - A 模式（container）：成功 → completed + results；执行级失败 → failed（不写半截结果）
        // - B 模式（github-action）：结果已拉取 → completed + results；触发已受理但结果未就绪
        //   （result_fetch_failed / run_url_not_resolved：action 已在目标仓库运行）→ dispatched + runUrl + 提示；
        //   仅触发级失败（workflow 未配置/不存在/无权限等，action 未运行）→ failed
        // - sandbox 启动时降级（A 场景，详见 executor-sandbox.md §7.8）：degraded + summaryJson + runUrl + errorJson
        //   （业务结果完整，路径偏离；errorJson 保留 sandbox_unavailable 错误码便于审计）
        const decision = resolveScanRunState(executorKind, error, result, degradedReason, exitCode)
        // 失败分类落库（单一事实源 run-failure-classify）：failed / dispatched 写三列，其余清空。
        // errorJson 口径与下方落库一致（优先状态机决策的 errorJson，回退执行器 error）；
        // engineCategories 供「errorJson 缺失但引擎已产出 result.errors」时回退细分。
        applyFailureClassification(savedRun, {
            status: decision.status,
            error: decision.errorJson ?? error ?? null,
            engineCategories: result?.errors?.map((engineError) => engineError.category),
        })
        if (decision.status === 'dispatched') {
            savedRun.status = 'dispatched'
            savedRun.runUrl = runUrl
            savedRun.errorJson = decision.errorJson ? JSON.stringify(decision.errorJson) : null
        } else if (decision.status === 'failed') {
            savedRun.status = 'failed'
            savedRun.finishedAt = new Date()
            // 优先用决策函数生成的 errorJson（含 engine_delivery_failed / engine_exit_2 等结构化代码）
            // fallback 才用 executor 报的 error——避免吞掉状态机产生的更精确分类
            if (decision.errorJson) {
                savedRun.errorJson = JSON.stringify(decision.errorJson)
            } else if (error) {
                savedRun.errorJson = JSON.stringify(error)
            } else {
                savedRun.errorJson = null
            }
        } else if (decision.status === 'degraded') {
            // degraded：业务结果完整 + 路径偏离（与 completed 等价写 summaryJson + runUrl）
            savedRun.status = 'degraded'
            savedRun.finishedAt = new Date()
            savedRun.errorJson = decision.errorJson ? JSON.stringify(decision.errorJson) : null
            if (result) {
                savedRun.summaryJson = JSON.stringify(result.summary)
                savedRun.runUrl = runUrl
                // reconcile 写结果明细（todo.md §M20.3 决策 1-4）：
                // 新告警 → INSERT；已存在 + 上游还有 → UPDATE 活跃；上游消失 + fixStatus≠success → supersede
                await reconcileAlerts({
                    repositoryId: repository.id,
                    newRunId: savedRun.id,
                    newAlerts: (result as RunResult).alerts,
                })
            }
        } else if (result) {
            savedRun.status = 'completed'
            savedRun.finishedAt = new Date()
            savedRun.summaryJson = JSON.stringify(result.summary)
            savedRun.runUrl = runUrl
            // reconcile 写结果明细（todo.md §M20.3 决策 1-4）：
            // 新告警 → INSERT；已存在 + 上游还有 → UPDATE 活跃；上游消失 + fixStatus≠success → supersede
            await reconcileAlerts({
                repositoryId: repository.id,
                newRunId: savedRun.id,
                newAlerts: (result as RunResult).alerts,
            })
        }

        // 回填仓库最近扫描时间
        repository.lastScanAt = new Date()
        await repoRepo.save(repository)

        // 保存执行日志（MemoryLogger 输出）
        if (logsJson) {
            savedRun.logsJson = logsJson
        }

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
        const orchestrationFailure = {
            code: 'orchestration_failed',
            message: error instanceof Error ? error.message : String(error),
        }
        savedRun.errorJson = JSON.stringify(orchestrationFailure)
        // 编排 catch-all 失败同样落失败分类（与状态机失败路径同源）
        applyFailureClassification(savedRun, { status: 'failed', error: orchestrationFailure })
        return await runRepo.save(savedRun)
    }
}

/**
 * 探测 container 执行器环境可用性并执行。
 *
 * container 是最底层执行器（无回退空间）：工作根不可写（磁盘满 / 只读 FS）属「执行环境不可用」，
 * 返回结构化 `container_unavailable` 错误而不进入 `execute`（避免以 execution_failed 掩盖环境根因）。
 * container 路由与 sandbox 降级回退点共用本 helper，保证两处的环境事件口径一致。
 */
async function runContainerExecutor(
    executor: ContainerExecutor,
    ctx: ScanExecutorContext,
): Promise<{
    result: RunResult | undefined
    error: { code: string, message: string } | undefined
    exitCode: number | undefined
    runUrl: string | null
    logsJson: string | null
}> {
    if (!(await executor.isAvailable())) {
        return {
            result: undefined,
            error: {
                code: 'container_unavailable',
                message: '容器执行器环境不可用（工作根目录不可写），无法执行扫描',
            },
            exitCode: undefined,
            runUrl: null,
            logsJson: null,
        }
    }
    const execResult = await executor.execute(ctx)
    return {
        result: execResult.result,
        error: execResult.error,
        exitCode: execResult.exitCode,
        runUrl: execResult.runUrl ?? null,
        logsJson: execResult.logsJson ?? null,
    }
}

/**
 * 环境事件审计：执行器 / 执行环境异常时落 AuditEvent + fire-and-forget 通知。
 *
 * 触发场景（与「运行失败分类」边界见 audit-event.ts 类型注释）：
 * - A 场景（sandbox 启动降级）→ sandbox_degraded / warn
 * - B 场景（sandbox 运行时失败）→ sandbox_unavailable / error
 * - C 场景（container 执行器环境不可用）→ container_unavailable / error
 *
 * 单次运行结果类错误（execution_timeout / clone_timeout / execution_failed 等）
 * 不在此落事件——它们由 failure_code / failure_stage / failure_kind 承载。
 *
 * 设计要点：
 * - 不抛错（fail-closed）：审计失败仅日志，不影响扫描主流程
 * - 通知 fire-and-forget：notifyEnvEvent 内部已捕获 channel 异常 + 按类型策略判定（policy.ts）
 * - A 场景沙箱降级但业务结果完整（degraded），B / C 场景环境不可用（failed）
 */
async function recordEnvAuditEvent(
    persistedRun: ScanRun,
    decision: ReturnType<typeof resolveScanRunState>,
    degradedReason: { code: string, message: string } | undefined,
    error: { code: string, message: string } | undefined,
): Promise<void> {
    let eventType: AuditEventType | null = null
    let severity: 'info' | 'warn' | 'error' | 'critical' = 'warn'
    let payload: Record<string, unknown> = {}

    if (decision.status === 'degraded' && degradedReason?.code === 'sandbox_unavailable') {
        // A 场景：sandbox 启动时不可用，已自动降级 ContainerExecutor（业务完整）
        eventType = 'sandbox_degraded'
        severity = 'warn'
        payload = { degradedReason, fallback: 'container' }
    } else if (decision.status === 'failed' && error?.code === 'container_unavailable') {
        // C 场景：container 执行器环境不可用（工作根不可写 / 磁盘满 / 只读 FS）——默认部署下的环境健康信号
        eventType = 'container_unavailable'
        severity = 'error'
        payload = { code: error.code, executor: 'container', message: error.message }
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
