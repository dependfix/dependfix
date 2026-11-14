import type { RunResult } from '@dependfix/core'
import type { DataSource } from 'typeorm'
import { resolveScanRunOutcome, resolveScanRunState } from './scan-run-state'
import { isTerminalScanRunStatus } from './scan-run-status'
import { applyFailureClassification } from './run-failure-classify'
import { withRepoLock } from './repo-lock'
import { decryptToken, getEncryptionKey } from './credential.service'
import { ContainerExecutor } from './executor/container-executor'
import { SandboxExecutor } from './executor/sandbox-executor'
import { ActionTriggerExecutor } from './executor/action-trigger-executor'
import { ActionResultFetcher } from './executor/action-result-fetcher'
import type { ExecutorResourceUsage, ScanExecutorContext } from './executor/types'
import { notifyRunTerminal } from './notification/run-notification.service'
import { reconcileAlerts } from './scan-reconcile'
import { persistPostCompletionOutcome } from './scan-run-post-completion'
import { cleanupFailedSandboxDelivery } from './sandbox-delivery-cleanup'
import { recordEnvAuditEvent } from './env-audit-event'
import { beginScanRunExecution } from './scan-run-start'
import { resolveAiConfig } from './ai-config-resolver'
import { resolveExecutionLimits } from '#server/utils/execution-limits'
import { buildRunSummarySnapshot } from '#server/utils/run-summary-snapshot'
import { Repository, parseSandboxLimits, parseVerifyCommands } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { ScanRun } from '#server/entities/scan-run'
import { Organization } from '#server/entities/organization'
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
 *    sandbox 仅 report-only 真实执行，fix / fix-and-pr 降级 container + degraded）
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


/**
 * 终态写回（条件更新：仅 pending / running 可写）。
 *
 * 动机：`savedRun` 是执行开始时的快照，执行期间清理侧（stale-cleanup 孤儿回收 / 超时判定）
 * 可能已把同一 run 条件更新为 `failed`。若此处用整行 `save`，迟到的 worker 会把终态覆盖回
 * `completed`，导致「已被判失败并通知」的运行事后变绿（口径见
 * [queue-stale-recovery.md](../../../../docs/design/governance/queue-stale-recovery.md)）。
 *
 * 语义：
 * - 只写「终态迁移列」（结果快照 / 失败分类 / 日志 / 资源 / 时间戳），不整行覆盖；
 *   **新增终态列时必须同步追加到下方 `.set()` 清单**——整行 `save` 的影子已消失，
 *   漏列不会被既有断言发现（`prNumber` 等由用例锁定）。
 * - `affected = 0`（库内已非 pending / running）→ 不改库，返回库内现存行 + `written = false`，
 *   并输出结构化告警留审计痕迹（`run_terminal_write_skipped`）；调用方据此跳过终态通知，
 *   避免与清理侧已发出的失败通知重复；
 * - 成功时回读一行，保证返回值与库一致（`updatedAt` 等派生列）。
 *
 * 「留痕走进程日志而非 `audit_event`」：`AuditEvent` 的语义边界明确排除单次 run 结果
 * （见 `entities/audit-event.ts` 顶部说明），终态写回冲突属单次运行的并发事实，故落平台
 * 结构化日志通道。
 */
const persistRunTerminalState = async (
    ds: DataSource,
    run: ScanRun,
): Promise<{ run: ScanRun, written: boolean }> => {
    const runRepo = ds.getRepository(ScanRun)
    const update = await runRepo.createQueryBuilder()
        .update(ScanRun)
        .set({
            status: run.status,
            finishedAt: run.finishedAt ?? null,
            summaryJson: run.summaryJson ?? null,
            errorJson: run.errorJson ?? null,
            runUrl: run.runUrl ?? null,
            exitCode: run.exitCode ?? null,
            environmentalFailureCount: run.environmentalFailureCount ?? null,
            memoryMaxBytes: run.memoryMaxBytes ?? null,
            peakRssBytes: run.peakRssBytes ?? null,
            oomKilled: run.oomKilled ?? null,
            resourceJson: run.resourceJson ?? null,
            failureCode: run.failureCode ?? null,
            failureStage: run.failureStage ?? null,
            failureKind: run.failureKind ?? null,
            logsJson: run.logsJson ?? null,
            prNumber: run.prNumber ?? null,
            updatedAt: new Date(),
        })
        .where('id = :id', { id: run.id })
        .andWhere('status IN (:...statuses)', { statuses: ['pending', 'running'] })
        .execute()
    // affected 缺省（部分驱动）按成功处理——与 stale-cleanup 的既有口径一致
    if ((update.affected ?? 1) === 0) {
        const current = await runRepo.findOne({ where: { id: run.id } })
        logger.warn('[scan] run_terminal_write_skipped', {
            runId: run.id,
            repositoryId: run.repositoryId,
            attemptedStatus: run.status,
            observedStatus: current?.status ?? 'missing',
        })
        // 行已消失（仓库级联删除）时回落内存实体，但不视为已写回
        return current
            ? { run: current, written: false }
            : { run, written: false }
    }
    return { run: (await runRepo.findOne({ where: { id: run.id } })) ?? run, written: true }
}

const notifyTerminalSafe = (run: ScanRun): void => {
    void notifyRunTerminal(run).catch((notifyError) => {
        logger.error('[notification] run terminal notify failed', { error: notifyError })
    })
}


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

    // 仓库级执行预算与超时：仓库值 > env > 内置默认，执行上限受平台封顶约束；
    // 解析在启动执行之前完成，快照随 scan_run 落库（stale-cleanup 据此逐 run 精判）。
    const executionLimits = resolveExecutionLimits(repository, process.env)
    for (const warning of executionLimits.warnings) {
        logger.warn(`[execution-limits] ${repository.owner}/${repository.name}: ${warning}`)
    }

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
        // 起点写回走条件更新（见 scan-run-start.ts）：禁止整行 save 复活已被并发清理的终态
        const observedStatus = existing.status
        const startPatch: Partial<ScanRun> = {
            startedAt: existing.startedAt ?? new Date(),
            buildVersion: buildStamp.buildVersion,
            buildCommit: buildStamp.buildCommit,
            executionTimeoutMs: executionLimits.executionTimeoutMs,
        }
        if (options.reuse) {
            Object.assign(startPatch, {
                finishedAt: null,
                errorJson: null,
                summaryJson: null,
                runUrl: null,
                failureCode: null,
                failureStage: null,
                failureKind: null,
                exitCode: null,
                environmentalFailureCount: null,
                memoryMaxBytes: null,
                peakRssBytes: null,
                oomKilled: null,
                resourceJson: null,
                mode: request.mode,
                severityThreshold: request.severityThreshold,
                executorKind,
                triggeredByUserId: options.triggeredByUserId ?? existing.triggeredByUserId,
                aiConfigSnapshot: aiConfigResolution.snapshot
                    ? JSON.stringify(aiConfigResolution.snapshot)
                    : null,
            })
        }
        const startWrite = await beginScanRunExecution({
            ds,
            runId: existing.id,
            observedStatus,
            allowTerminalReuse: options.reuse === true,
            patch: startPatch,
        })
        if (!startWrite.started || !startWrite.run) {
            throw new Error(
                `[scan] run ${existing.id} 起点状态已变化（${observedStatus} → ${startWrite.currentStatus ?? 'unknown'}），跳过重复执行`,
            )
        }
        savedRun = startWrite.run
    } else {
        const run = runRepo.create({
            repositoryId: repository.id,
            mode: request.mode,
            severityThreshold: request.severityThreshold,
            executorKind,
            status: 'running',
            startedAt: new Date(),
            executionTimeoutMs: executionLimits.executionTimeoutMs,
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
            // 仓库级跨大版本授权（默认关闭）：关闭时跨 major 告警记 cross-major 跳过
            allowMajorUpgrade: repository.allowMajorUpgrade,
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
    // 执行日志（container 由 MemoryLogger 输出 / sandbox 由 stdout+stderr 尾部回传）：声明在 try 外，
    // 使 catch-all（reconcile / 落库抛错）也能把已采集的日志落库
    let logsJson: string | undefined | null
    let decision: ReturnType<typeof resolveScanRunState> | undefined
    let decidedResult: RunResult | undefined
    let decidedRunUrl: string | null = null
    let degradedReason: { code: string, message: string } | undefined
    try {
        // 执行器路由
        let result: RunResult | undefined
        let error: { code: string, message: string } | undefined
        let runUrl: string | null = null
        // DependfixApp.run() 返回的进程级 exit code（0 / 1 / 2）。透传给状态机作为
        // 引擎交付类 category 识别之外的进程级兜底（exitCode=2 + result 存在 → 标记 failed）。
        // B 模式（github-action）executor 不会透传 exitCode，保持 undefined。
        let exitCode: number | undefined
        if (executorKind === 'github-action') {
            const executor = new ActionTriggerExecutor(token ?? '')
            const execResult = await executor.execute(ctx)
            result = execResult.result
            error = execResult.error
            runUrl = execResult.runUrl ?? null
            resource = execResult.resource

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
            // sandbox 路由：report-only 与 fix / fix-and-pr 都在容器内执行（fix 由容器内 CLI 的
            // 运行级审计代理约束出站）；daemon 不可用时仍降级 container 并留 `sandbox_unavailable`。
            let sandboxHandled = false
            if (executorKind === 'sandbox') {
                const sandbox = new SandboxExecutor({
                    // 仓库级镜像 > SANDBOX_IMAGE > 三源候选（平台 registry → Docker Hub → ghcr → ACR）
                    ...(repository.sandboxImage?.trim() ? { image: repository.sandboxImage.trim() } : {}),
                    sandboxLimits: parseSandboxLimits(repository.sandboxLimits),
                    timeoutMs: executionLimits.executionTimeoutMs,
                })
                if (await sandbox.isAvailable()) {
                    const execResult = await sandbox.execute(ctx)
                    result = execResult.result
                    error = execResult.error
                    exitCode = execResult.exitCode
                    logsJson = execResult.logsJson ?? null
                    // 沙箱内自包含交付：runUrl / PR 编号来自结果契约（fix 直推为分支页，fix-and-pr 为 PR 地址）
                    runUrl = execResult.runUrl ?? null
                    savedRun.prNumber = execResult.prNumber ?? null
                    resource = execResult.resource
                    sandboxHandled = true
                } else {
                    degradedReason = {
                        code: 'sandbox_unavailable',
                        message: `沙箱执行器启动时不可用（无 rootless daemon / user namespace 受限），已自动降级到平台容器（${repository.owner}/${repository.name}）`,
                    }
                }
            }
            if (!sandboxHandled) {
                const executor = new ContainerExecutor({
                    workRoot: process.env.RUN_WORK_ROOT ?? 'data/runs',
                    // 有效执行上限 / 验证命令 / 安装 / clone 超时：仓库值 > env > 默认，且已按封顶夹取
                    timeoutMs: executionLimits.executionTimeoutMs,
                    verifyCommandTimeoutMs: executionLimits.verifyCommandTimeoutMs,
                    installTimeoutMs: executionLimits.installTimeoutMs,
                    cloneTimeoutMs: executionLimits.cloneTimeoutMs,
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
        }

        // 落库（状态机决策见 scan-run-state.ts 纯函数）：
        // - A 模式（container）：成功 → completed + results；执行级失败 → failed（不写半截结果）
        // - B 模式（github-action）：结果已拉取 → completed + results；触发已受理但结果未就绪
        //   （result_fetch_failed / run_url_not_resolved：action 已在目标仓库运行）→ dispatched + runUrl + 提示；
        //   仅触发级失败（workflow 未配置/不存在/无权限等，action 未运行）→ failed
        // - sandbox 启动时降级（A 场景，详见 executor-sandbox-implementation.md §7.8）：degraded + summaryJson + runUrl + errorJson
        //   （业务结果完整，路径偏离；errorJson 保留 sandbox_unavailable 错误码便于审计）
        decision = resolveScanRunState(executorKind, error, result, degradedReason, exitCode)
        decidedResult = result
        decidedRunUrl = runUrl
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
            resourceNote = 'sandbox 执行未产出资源读数（执行前拒绝 / 采样不可用）'
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
        // 沙箱交付失败 / 取消：清理结果声明的远端 dependfix/ 分支（默认分支不在范围）
        if (executorKind === 'sandbox' && decision.status === 'failed') {
            await cleanupFailedSandboxDelivery(repository, savedRun, result, token)
        }
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
                    ...buildRunSummarySnapshot(result),
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
                savedRun.summaryJson = JSON.stringify(buildRunSummarySnapshot(result))
                savedRun.runUrl = runUrl
                await reconcileRunResult(repository, savedRun.id, result as RunResult)
            }
        } else if (result) {
            savedRun.status = 'completed'
            savedRun.finishedAt = new Date()
            savedRun.summaryJson = JSON.stringify(buildRunSummarySnapshot(result))
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

        // 终态写回走条件更新：清理侧已置终态时不得被迟到 worker 覆盖（见 persistRunTerminalState）
        const { run: persistedRun, written } = await persistRunTerminalState(ds, savedRun)

        // 环境事件审计（fire-and-forget）：
        // - A 场景 sandbox 启动降级 → sandbox_degraded 事件
        // - B 场景 sandbox 运行时失败 → sandbox_unavailable 事件
        // 不阻塞扫描主流程：失败仅日志 + audit_event 落库
        await recordEnvAuditEvent(persistedRun, decision, degradedReason, error)

        // 业务通知 fire-and-forget：批次内 run 由批次终态合并；失败不阻断扫描。
        // 未写回（清理侧已置终态）时跳过——清理侧已就同一 run 发过失败通知，避免重复投递。
        if (written) {
            notifyTerminalSafe(persistedRun)
        }

        return persistedRun
    } catch (error) {
        if (decision && (decision.status === 'completed' || decision.status === 'degraded') && decidedResult) {
            const completed = decision
            return await persistPostCompletionOutcome({
                ds, run: savedRun, status: completed.status === 'degraded' ? 'degraded' : 'completed',
                result: decidedResult, runUrl: decidedRunUrl,
                resource, logsJson, error,
                errorJson: completed.status === 'degraded' ? (completed.errorJson ?? null) : null,
                persist: persistRunTerminalState, notify: notifyTerminalSafe, logger,
                onPersisted: async (persisted) => {
                    await recordEnvAuditEvent(persisted, completed, degradedReason, undefined)
                    repository.lastScanAt = new Date()
                    await repoRepo.save(repository)
                },
            })
        }
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
        // 编排 catch-all 同样走条件更新：与正常终态写回同一守卫
        const { run: persisted, written } = await persistRunTerminalState(ds, savedRun)
        if (written) {
            notifyTerminalSafe(persisted)
        }
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
