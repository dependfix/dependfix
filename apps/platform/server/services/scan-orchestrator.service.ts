import type { RunResult } from '@dependfix/core'
import { resolveScanRunOutcome, resolveScanRunState } from './scan-run-state'
import { isTerminalScanRunStatus } from './scan-run-status'
import { applyFailureClassification } from './run-failure-classify'
import { withRepoLock } from './repo-lock'
import { decryptToken, getEncryptionKey } from './credential.service'
import { ContainerExecutor } from './executor/container-executor'
import { ActionTriggerExecutor } from './executor/action-trigger-executor'
import { ActionResultFetcher } from './executor/action-result-fetcher'
import type { ExecutorResourceUsage, ScanExecutorContext } from './executor/types'
import { notifyEnvEvent } from './notification'
import { notifyRunTerminal } from './notification/run-notification.service'
import type { NotificationEvent } from './notification/channel'
import { reconcileAlerts } from './scan-reconcile'
import { resolveAiConfig } from './ai-config-resolver'
import { Repository, parseVerifyCommands } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { ScanRun } from '#server/entities/scan-run'
import { Organization } from '#server/entities/organization'
import { AuditEvent, type AuditEventType } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'
import { detectSigkill, unavailableResourceUsage } from '#server/utils/resource-usage'
import { resolveRunBuildStamp } from '#server/utils/run-build-info'
import { logger } from '#server/utils/logger'

/**
 * 扫描编排：触发 → 执行 → 落库（同步执行模型 Q2，请求内完成）。
 *
 * 流程：
 * 1. 读取 Repository + 关联 Credential（解密仅执行时内存）
 * 2. 按 executorKind 选择执行器（container 默认 / github-action 需配置 actionWorkflowFile；
 *    sandbox 入口临时关闭 → 强制 container + degraded）
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
    /**
     * 「受约束重试入口」的来源 run id（同步新建 run 时写入；见 run-failure-taxonomy.md §5.5）。
     * 仅新建路径生效；runId 续用 / reuse 路径不覆写既有 record 的来源字段。
     */
    retriedFromRunId?: string
    /** 手动触发 / 重试操作者；写入 ScanRun.triggeredByUserId 供业务通知定向投递。 */
    triggeredByUserId?: string
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
    options?: { batchRunId?: string, retriedFromRunId?: string, triggeredByUserId?: string },
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
        retriedFromRunId: options?.retriedFromRunId ?? null,
        triggeredByUserId: options?.triggeredByUserId ?? null,
        // 构建版本回执：入队即落库，pending 阶段也能看出「这条 run 由哪个部署产物受理」
        ...resolveRunBuildStamp(),
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
    // 构建版本回执（本次执行者所属部署产物）；见 #server/utils/run-build-info
    const buildStamp = resolveRunBuildStamp()
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
        if (!options.reuse && isTerminalScanRunStatus(existing.status)) {
            throw new Error(`[scan] run ${existing.id} 已处于终态 ${existing.status}，跳过重复执行`)
        }
        existing.status = 'running'
        existing.startedAt = existing.startedAt ?? new Date()
        // 构建版本回执随执行者刷新：队列续跑 / 用户复用都可能跨部署发生，
        // 记录「本次实际执行者」而不是「最初入队者」
        existing.buildVersion = buildStamp.buildVersion
        existing.buildCommit = buildStamp.buildCommit
        // reuse=true 时重置终态字段：让既有 record 复用为新执行的载体（finishedAt / errorJson /
        // summaryJson 来自上一次执行，重置以避免新执行的 summaryJson 与旧 finishedAt 时间戳错位）
        if (options.reuse) {
            // per-alert 模型下不再需要清空该 run 的 ScanResult：reconcile 函数
            // 会按 upstreamId 复用现有行（上游消失时 fixStatus='success' 不被 supersede，决策 1；
            // 告警仍活跃时按本次结论覆盖）；
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
            // 运行结果可信度两列同属「上一次执行」快照，复用为本次执行载体时一并清空
            existing.exitCode = null
            existing.environmentalFailureCount = null
            existing.memoryMaxBytes = null
            existing.peakRssBytes = null
            existing.oomKilled = null
            existing.resourceJson = null
            // 同时更新 mode / severityThreshold 以匹配本次请求（用户从 report-only 切到 fix）
            existing.mode = request.mode
            existing.severityThreshold = request.severityThreshold
            existing.executorKind = executorKind
            // 复用既有 run 作为新执行载体时，触发者更新为本次操作者（未提供则保留历史值）
            existing.triggeredByUserId = options.triggeredByUserId ?? existing.triggeredByUserId
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
            retriedFromRunId: options?.retriedFromRunId ?? null,
            triggeredByUserId: options?.triggeredByUserId ?? null,
            // 构建版本回执（同步新建路径：本次执行者）
            ...buildStamp,
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

    const rollbackGranularityRaw = process.env.DEPENDFIX_ROLLBACK_GRANULARITY?.trim().toLowerCase()
    if (rollbackGranularityRaw && rollbackGranularityRaw !== 'unit' && rollbackGranularityRaw !== 'repo') {
        logger.warn(
            `[engine] invalid DEPENDFIX_ROLLBACK_GRANULARITY="${process.env.DEPENDFIX_ROLLBACK_GRANULARITY}" — fallback to unit`,
        )
    }
    const rollbackGranularity = rollbackGranularityRaw === 'repo' ? 'repo' : 'unit'

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
            // 验证失败回滚粒度（默认 unit）：平台不经过 resolveRuntimeConfig，需在此贯通 env 逃生开关
            rollbackGranularity,
            // 构建版本回执透传给引擎启动日志（`[build]` 行）：与落库两列同源
            ...buildStamp,
            maxAlertsPerRepository: 20,
            maxConcurrency: 1,
            maxRetries: 3,
            maxBackoffMs: 30_000,
            maxRepos: 100,
            // AI 研判配置：runtime 注入，已合并优先级 + 解密 apiKey
            // 见 [resolveAiConfig] 函数注释（AI 合并优先级 + 错误规则）
            ai: resolvedAi,
        },
        credential: token ? { token } : undefined,
        workDir: savedRun.id,
    }

    // 执行窗口资源快照：catch-all 也需保留已采集的真实值（不因后续落库失败清空审计事实）
    let resource: ExecutorResourceUsage | undefined
    // 执行日志（MemoryLogger 输出，仅 container 执行器支持）：声明在 try 外，
    // 使 catch-all（reconcile / 落库抛错）也能把已采集的日志落库
    let logsJson: string | undefined | null
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
        } else {
            if (executorKind === 'sandbox') {
                // 2026-10-27 起 sandbox 入口临时关闭（用户裁定方案 A）：
                // `SandboxExecutor.buildCmd` 仍为最小占位（回显 RunResult，不启动引擎），
                // 直接调用会在 rootless Docker 可用时返回 0 告警假成功。这里强制降级到
                // ContainerExecutor，并记录 degradedReason；真实引擎执行闭环后删除本分支、
                // 恢复 sandbox 路由（docs/plan/backlog.md P1）。
                degradedReason = {
                    code: 'sandbox_entry_disabled',
                    message: `独立沙箱容器暂不可用（真实执行尚未闭环），已自动降级到平台容器（${repository.owner}/${repository.name}）`,
                }
            }
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
            resource = execResult.resource
            // A 模式（container）：fix / fix-and-pr 完成后 executor 端推送修复分支，
            // runUrl 指向 GitHub branch tree 页（参见 container-executor.pushFixBranch 后置）
            runUrl = execResult.runUrl
            // PR 回环反馈的观察态锚点（fix-and-pr 交付时非空，见 pr-feedback-loop.md §3）
            savedRun.prNumber = execResult.prNumber ?? null
            // 捕获执行日志（MemoryLogger 输出）
            logsJson = execResult.logsJson
        }

        // 落库（状态机决策见 scan-run-state.ts 纯函数）：
        // - A 模式（container）：成功 → completed + results；执行级失败 → failed（不写半截结果）
        // - B 模式（github-action）：结果已拉取 → completed + results；触发已受理但结果未就绪
        //   （result_fetch_failed / run_url_not_resolved：action 已在目标仓库运行）→ dispatched + runUrl + 提示；
        //   仅触发级失败（workflow 未配置/不存在/无权限等，action 未运行）→ failed
        // - sandbox 启动时降级（A 场景，详见 executor-sandbox-implementation.md §7.8）：degraded + summaryJson + runUrl + errorJson
        //   （业务结果完整，路径偏离；errorJson 保留 sandbox_unavailable 错误码便于审计）
        const decision = resolveScanRunState(executorKind, error, result, degradedReason, exitCode)
        // 运行结果可信度落库（纯函数映射）：exit_code 独立于终态；环境性失败计数只在有 result 时写，
        // 无 result 的失败保持 null，供 UI 判「结果缺失」而不是显示误导性的「告警 0」。
        const outcome = resolveScanRunOutcome(result, exitCode)
        savedRun.exitCode = outcome.exitCode
        savedRun.environmentalFailureCount = outcome.environmentalFailureCount
        // 资源 / OOM 归因：不可采集一律 NULL + 原因，不伪造 0 / false。
        let resourceNote = `executor does not collect resource usage: ${executorKind}`
        if (executorKind === 'container') {
            resourceNote = 'container executor did not return resource usage'
        } else if (executorKind === 'sandbox') {
            resourceNote = 'container fallback (sandbox entry disabled) did not return resource usage'
        }
        const resourceSnapshot = resource ?? unavailableResourceUsage(resourceNote)
        if (!resourceSnapshot.sigkillDetected) {
            resourceSnapshot.sigkillDetected = detectSigkill([
                ...(result?.errors ?? []).map((item) => item.message),
                error?.message,
            ])
        }
        savedRun.memoryMaxBytes = resourceSnapshot.memoryMaxBytes
        savedRun.peakRssBytes = resourceSnapshot.peakRssBytes
        savedRun.oomKilled = resourceSnapshot.oomKilled
        savedRun.resourceJson = JSON.stringify(resourceSnapshot)
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
            // 失败前引擎已扫到的告警快照：failed 且引擎已产出 result（engine_delivery_failed / exitCode=2）
            // 时落 summaryJson，供运行列表「告警数」展示，避免恒显 0 掩盖失败前扫描结果。
            // alertsFixed 归零：失败 run 未交付，且状态机契约声明 rollback / verification 失败后
            // fixStatus 不可信，避免「已修复 N」误导；alertsFound 如实。仅写快照，不 reconcile 告警明细。
            // 边界：其余字段（alertsFailed / verificationsPassed 等）沿用引擎值——当前消费方仅
            // `/api/scan-history/summary`（alertsFound / alertsFixed 两键）与运行列表（同两键），无暴露；
            // 未来若新增消费者，需复检 rollback / verification 场景下这些字段的可信度。
            if (result) {
                // 失败未交付：已修复数归零，未修复数同步按「发现 − 已收敛」重算；
                // 不能保留引擎在内存中算出的 alertsUnfixed（否则出现「已修复 0 / 未修复 6 / 总数 10」自相矛盾）
                const found = typeof result.summary.alertsFound === 'number' ? result.summary.alertsFound : 0
                const converged = typeof result.summary.alertsConverged === 'number' ? result.summary.alertsConverged : 0
                savedRun.summaryJson = JSON.stringify({
                    ...result.summary,
                    alertsFixed: 0,
                    alertsUnfixed: Math.max(0, found - converged),
                })
            }
        } else if (decision.status === 'degraded') {
            // degraded：业务结果完整 + 路径偏离（与 completed 等价写 summaryJson + runUrl）
            savedRun.status = 'degraded'
            savedRun.finishedAt = new Date()
            savedRun.errorJson = decision.errorJson ? JSON.stringify(decision.errorJson) : null
            if (result) {
                savedRun.summaryJson = JSON.stringify(result.summary)
                savedRun.runUrl = runUrl
                await reconcileRunResult(repository, savedRun.id, result as RunResult)
            }
        } else if (result) {
            savedRun.status = 'completed'
            savedRun.finishedAt = new Date()
            savedRun.summaryJson = JSON.stringify(result.summary)
            savedRun.runUrl = runUrl
            await reconcileRunResult(repository, savedRun.id, result as RunResult)
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

        // 业务通知 fire-and-forget：批次内 run 由批次终态合并；失败不阻断扫描
        void notifyRunTerminal(persistedRun).catch((notifyError) => {
            logger.error('[notification] run terminal notify failed', { error: notifyError })
        })

        return persistedRun
    } catch (error) {
        savedRun.status = 'failed'
        savedRun.finishedAt = new Date()
        const orchestrationFailure = {
            code: 'orchestration_failed',
            message: error instanceof Error ? error.message : String(error),
        }
        savedRun.errorJson = JSON.stringify(orchestrationFailure)
        const resourceSnapshot = resource ?? unavailableResourceUsage('orchestration failed before resource snapshot')
        savedRun.memoryMaxBytes = resourceSnapshot.memoryMaxBytes
        savedRun.peakRssBytes = resourceSnapshot.peakRssBytes
        savedRun.oomKilled = resourceSnapshot.oomKilled
        savedRun.resourceJson = JSON.stringify(resourceSnapshot)
        // 编排 catch-all 也要保留执行日志（logsJson 在 try 外声明并已赋值）：
        // 否则 reconcile / 落库抛错时日志全丢，运行详情只剩「（无执行日志）」
        if (logsJson) {
            savedRun.logsJson = logsJson
        }
        // 编排 catch-all 失败同样落失败分类（与状态机失败路径同源）
        applyFailureClassification(savedRun, { status: 'failed', error: orchestrationFailure })
        const persisted = await runRepo.save(savedRun)
        void notifyRunTerminal(persisted).catch((notifyError) => {
            logger.error('[notification] run terminal notify failed', { error: notifyError })
        })
        return persisted
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
    prNumber: number | undefined
    logsJson: string | null
    resource: ExecutorResourceUsage | undefined
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
            prNumber: undefined,
            logsJson: null,
            resource: undefined,
        }
    }
    const execResult = await executor.execute(ctx)
    return {
        result: execResult.result,
        error: execResult.error,
        exitCode: execResult.exitCode,
        runUrl: execResult.runUrl ?? null,
        prNumber: execResult.prNumber,
        logsJson: execResult.logsJson ?? null,
        resource: execResult.resource,
    }
}

/**
 * 环境事件审计：执行器 / 执行环境异常时落 AuditEvent + fire-and-forget 通知。
 *
 * 触发场景（与「运行失败分类」边界见 audit-event.ts 类型注释）：
 * - A 场景（sandbox 入口关闭 / 启动降级）→ sandbox_degraded / warn（入口关闭期间只落库、不通知）
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

    if (decision.status === 'degraded' && (degradedReason?.code === 'sandbox_unavailable' || degradedReason?.code === 'sandbox_entry_disabled')) {
        // sandbox 入口临时关闭 / 启动时不可用，已自动降级 ContainerExecutor（业务完整）
        eventType = 'sandbox_degraded'
        severity = 'warn'
        payload = {
            degradedReason,
            fallback: 'container',
            // 入口关闭期间的预期配置状态不通知；payload 显式标记，便于 /env-events 筛选区分
            notificationSuppressed: degradedReason?.code === 'sandbox_entry_disabled',
        }
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
        // sandbox_entry_disabled 是入口关闭期间的预期配置状态：只落库、不通知，
        // 避免存量仓库每次扫描都占用共享通知配额、稀释 container_unavailable 等真实环境事故信号。
        // 注意仅对 sandbox_degraded 事件生效；降级目标 container 不可用时仍按 container_unavailable 通知。
        if (eventType === 'sandbox_degraded' && degradedReason?.code === 'sandbox_entry_disabled') {
            return
        }
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
            logger.error(`[scan-orchestrator] notifyEnvEvent fire-and-forget failed for audit ${audit.id}`, { error: e })
        })
    } catch (e) {
        logger.error('[scan-orchestrator] failed to record env audit event', { error: e })
    }
}

/**
 * 落库本次运行的告警明细（reconcile）并回写告警级结果。
 *
 * 单一入口：新增调用点不会漏传 `outcomes` / `dryRun`（口径见 docs/design/modules/data-model.md）。
 * 未匹配条目只在日志披露，不阻断落库——正常流水线结构上恒为 0，非 0 说明报告与告警列表键漂移。
 */
async function reconcileRunResult(
    repository: { id: string, owner: string, name: string },
    newRunId: string,
    result: RunResult,
): Promise<void> {
    const stats = await reconcileAlerts({
        repositoryId: repository.id,
        newRunId,
        newAlerts: result.alerts,
        outcomes: result.alertOutcomes,
        // JSON 外部输入：config 理论上必有，运行时防御性判空
        dryRun: result.config?.dryRun,
    })
    if (stats.outcomesUnmatched > 0) {
        logger.warn(
            `[reconcile] ${repository.owner}/${repository.name}: `
            + `${stats.outcomesUnmatched} alert outcome(s) were not applied (键漂移或状态非法)`,
        )
    }
}
