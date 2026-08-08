import type { RunResult } from '@dependfix/core'
import { resolveScanRunState } from './scan-run-state'
import { withRepoLock } from './repo-lock'
import { decryptToken, getEncryptionKey } from './credential.service'
import { ContainerExecutor } from './executor/container-executor'
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
 * 并发防护：同仓库互斥（进程内锁，M6 单实例够用；M7 T702（见 docs/plan/backlog.md）换 BullMQ 队列承接多实例/优先级）。
 * 同一仓库同一时间只允许一个扫描——防止容器执行器对同一 workDir 的并发写冲突。
 */

export interface ScanRequest {
    /** 扫描模式（report-only / fix / fix-and-pr） */
    mode: 'report-only' | 'fix' | 'fix-and-pr'
    /** 严重级别阈值（critical / high / medium / all） */
    severityThreshold: string
    /** 执行后端（默认 container） */
    executorKind?: 'container' | 'github-action'
}

export const runScanForRepository = async (
    repositoryId: string,
    request: ScanRequest,
): Promise<ScanRun> =>
    // 同仓库互斥：同一仓库同时只允许一个扫描（防止容器执行器并发写同一 workDir）
    withRepoLock(repositoryId, () => runScanInternal(repositoryId, request))


const runScanInternal = async (
    repositoryId: string,
    request: ScanRequest,
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
    const executorKind = request.executorKind ?? (repository.actionWorkflowFile ? 'github-action' : 'container')

    // 预创建 ScanRun（状态 running；失败时更新为 failed——保持一条记录可追溯）
    const run = runRepo.create({
        repositoryId: repository.id,
        mode: request.mode,
        severityThreshold: request.severityThreshold,
        executorKind,
        status: 'running',
        startedAt: new Date(),
    })
    const savedRun = await runRepo.save(run)

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
            const executor = new ContainerExecutor({
                workRoot: process.env.RUN_WORK_ROOT ?? 'data/runs',
            })
            const execResult = await executor.execute(ctx)
            result = execResult.result
            error = execResult.error
        }

        // 落库（状态机决策见 scan-run-state.ts 纯函数）：
        // - A 模式（container）：成功 → completed + results；执行级失败 → failed（不写半截结果）
        // - B 模式（github-action）：结果已拉取 → completed + results；触发已受理但结果未就绪
        //   （result_fetch_failed / run_url_not_resolved：action 已在目标仓库运行）→ dispatched + runUrl + 提示；
        //   仅触发级失败（workflow 未配置/不存在/无权限等，action 未运行）→ failed
        const decision = resolveScanRunState(executorKind, error, result)
        if (decision.status === 'dispatched') {
            savedRun.status = 'dispatched'
            savedRun.runUrl = runUrl
            savedRun.errorJson = decision.errorJson ? JSON.stringify(decision.errorJson) : null
        } else if (decision.status === 'failed') {
            savedRun.status = 'failed'
            savedRun.finishedAt = new Date()
            savedRun.errorJson = error ? JSON.stringify(error) : null
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
