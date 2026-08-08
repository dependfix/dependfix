import { Octokit } from '@octokit/rest'
import { createEmptyRunSummary } from '@dependfix/core'
import type { ScanExecutor, ScanExecutorContext, ScanExecutorResult } from './types'

/**
 * B 模式执行器：对已配置 action 的仓库触发 `workflow_dispatch`。
 *
 * 设计要点（见 executor-sandbox.md §4）：
 * - 凭据复用仓库关联 Credential（由平台 credential service 解密后传入，仅内存持有）
 * - 需 `actions: write` 权限（classic PAT `workflow` scope / fine-grained PAT `Actions: write`）
 * - GitHub dispatches API 204 受理但不返回 run id → 触发后短轮询 runs 定位 runUrl（失败不视为扫描失败）
 * - 结果回填为已知边界（见 docs/plan/backlog.md「C25」）：平台只返回"已触发"状态
 */
export class ActionTriggerExecutor implements ScanExecutor {
    readonly kind = 'github-action' as const

    private readonly client: Octokit
    private readonly pollDelayMs: number
    private readonly pollAttempts: number

    constructor(token: string, options: { pollDelayMs?: number, pollAttempts?: number } = {}) {
        this.client = new Octokit({ auth: token })
        this.pollDelayMs = options.pollDelayMs ?? 5000
        this.pollAttempts = options.pollAttempts ?? 3
    }

    isAvailable(): Promise<boolean> {
        // 前置预检：目标 workflow 文件 + 仓库可访问性（404 视为可用），
        // 真正的校验在 execute 中（需要 ctx.repository 信息），此处仅确认 client 构造成功。
        return Promise.resolve(true)
    }

    async execute(ctx: ScanExecutorContext): Promise<ScanExecutorResult> {
        const startedAt = new Date().toISOString()
        const { owner, name, defaultBranch, actionWorkflowFile } = ctx.repository

        if (!actionWorkflowFile) {
            return {
                exitCode: 2,
                error: {
                    code: 'workflow_not_configured',
                    message: '仓库未配置 actionWorkflowFile，无法触发 workflow_dispatch',
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        try {
            // 预检：workflow 文件存在（避免无谓 404）
            await this.client.rest.actions.getWorkflow({
                owner,
                repo: name,
                workflow_id: actionWorkflowFile,
            })
        } catch (error) {
            // 预检失败分类：403 属凭据权限不足（trigger_forbidden）；其余视为 workflow 不存在
            let code = 'workflow_not_found'
            if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 403) {
                code = 'trigger_forbidden'
            }
            return {
                exitCode: 2,
                error: {
                    code,
                    message: `目标 workflow 预检失败（${actionWorkflowFile}）：${error instanceof Error ? error.message : String(error)}`,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        // 触发 inputs：与 action.yml inputs 对齐（最多 10 个字符串输入）
        const inputs: Record<string, string> = {
            mode: ctx.config.mode === 'report-only' ? 'report-only' : 'fix-and-pr',
            'severity-threshold': ctx.config.severityThreshold,
            repos: `${owner}/${name}`,
            'max-alerts-per-repository': String(ctx.config.maxAlertsPerRepository ?? 20),
        }

        try {
            await this.client.rest.actions.createWorkflowDispatch({
                owner,
                repo: name,
                workflow_id: actionWorkflowFile,
                ref: defaultBranch,
                inputs,
            })
        } catch (error) {
            let code = 'trigger_failed'
            if (error instanceof Error && 'status' in error) {
                const status = (error as { status?: number }).status
                code = status === 403 ? 'trigger_forbidden' : 'trigger_failed'
            }
            return {
                exitCode: 2,
                error: {
                    code,
                    message: `workflow_dispatch 触发失败：${error instanceof Error ? error.message : String(error)}`,
                },
                startedAt,
                finishedAt: new Date().toISOString(),
            }
        }

        // 触发受理成功（204）→ 轮询 runs 定位本次 run（短退避；失败不视为扫描失败）
        const polledRun = await this.pollRun(ctx, startedAt)
        const finishedAt = new Date().toISOString()

        return {
            exitCode: 0,
            startedAt,
            finishedAt,
            result: {
                // 触发类执行无真实扫描业务数据：以最小结构化结果回传（落库 ScanRun 用）
                runId: ctx.runId,
                startedAt,
                finishedAt,
                config: {
                    mode: ctx.config.mode,
                    severityThreshold: ctx.config.severityThreshold,
                    repositories: [`${ctx.repository.owner}/${ctx.repository.name}`],
                    dryRun: ctx.config.dryRun,
                    createPullRequest: ctx.config.createPullRequest,
                    maxAlertsPerRepository: ctx.config.maxAlertsPerRepository ?? 20,
                    alertSource: ctx.config.alertSource,
                },
                summary: createEmptyRunSummary(),
                repositories: [],
                alerts: [],
                actions: [],
                errors: [],
            },
            // runUrl/runId 存在性独立于 error：定位到 run → 均有值；未定位 → error 提示
            runUrl: polledRun?.html_url,
            runId: polledRun?.id,
            error: polledRun
                ? undefined
                : {
                    code: 'run_url_not_resolved',
                    message: '触发受理成功，但未能定位运行详情（可在目标仓库 Actions 页面查看）',
                },
        }
    }

    /** 触发后短轮询定位本次 run（默认 5s × 3，测试可注入更短间隔）。 */
    private async pollRun(ctx: ScanExecutorContext, startedAt: string): Promise<{ id: number, html_url: string } | null> {
        const { owner, name, actionWorkflowFile } = ctx.repository
        for (let i = 0; i < this.pollAttempts; i++) {
            if (i > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.pollDelayMs))
            }
            try {
                const { data } = await this.client.rest.actions.listWorkflowRuns({
                    owner,
                    repo: name,
                    workflow_id: actionWorkflowFile as string,
                    event: 'workflow_dispatch',
                    per_page: 5,
                })
                const run = data.workflow_runs.find((r) => new Date(r.created_at).toISOString() >= startedAt)
                if (run) {
                    return { id: run.id, html_url: run.html_url }
                }
            } catch (pollError) {
                // 轮询失败不阻断（runUrl 缺失可接受）；下一轮重试
                void pollError
            }
        }
        return null
    }
}
