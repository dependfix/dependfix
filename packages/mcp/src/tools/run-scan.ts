import { DependfixApp, DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from '@dependfix/engine'
import { isValidRepoIdentifier } from '@dependfix/core'
import { requireToken, toToolError } from './errors'

/** `run_scan` 返回结构 */
export type RunScanResult =
    | {
        ok: true
        exitCode: number
        runId: string
        summary: import('@dependfix/core').RunSummary
        repositories: Array<Record<string, unknown>>
        errors: Array<Record<string, unknown>>
    }
    | { ok: false, error: string }

/**
 * `run_scan`：对目标仓库执行 dependfix 扫描并修复。
 * 凭据从 GITHUB_TOKEN 环境变量读取；repo 为 GitHub 远程仓库（report-only 无需 clone）。
 */
export const runScan = async (input: {
    repo: string
    mode: 'report-only' | 'fix' | 'fix-and-pr'
    severity: string
    code_scanning?: boolean
    max_alerts?: number
    max_concurrency?: number
    dry_run?: boolean
    allow_major_upgrade?: boolean
    ai_enabled?: boolean
    ai_provider?: 'openai-compatible' | 'anthropic'
    ai_model?: string
    ai_trigger?: 'failure' | 'major' | 'both'
}): Promise<RunScanResult> => {
    const token = requireToken()
    if (typeof token !== 'string') {
        return token
    }

    // repo 格式校验复用 core（与 CLI 同源）
    if (!isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    const [owner, repo] = input.repo.split('/')

    // 展开 cli 默认配置（maxAlerts/maxConcurrency/maxRetries/maxBackoff/alertSource/ai 默认等
    // 与 CLI 单一事实源对齐，避免手写默认值漂移），仅覆盖 tool 参数可控制字段。
    const defaultAi = DEFAULT_RUNTIME_CONFIG.ai
    const config: RuntimeConfig = {
        ...DEFAULT_RUNTIME_CONFIG,
        mode: input.mode,
        severityThreshold: input.severity as 'critical' | 'high' | 'medium' | 'all',
        repositories: [`${owner}/${repo}`],
        // dry-run 显式参数优先，缺省按 mode 推断（report-only 即只读）
        dryRun: input.dry_run ?? (input.mode === 'report-only'),
        createPullRequest: input.mode === 'fix-and-pr',
        commit: input.mode === 'fix',
        cleanupBranches: false,
        cleanupBranchesAuto: false,
        githubToken: token,
        codeScanningEnabled: input.code_scanning ?? DEFAULT_RUNTIME_CONFIG.codeScanningEnabled,
        allowMajorUpgrade: input.allow_major_upgrade ?? DEFAULT_RUNTIME_CONFIG.allowMajorUpgrade,
        maxAlertsPerRepository: input.max_alerts ?? DEFAULT_RUNTIME_CONFIG.maxAlertsPerRepository,
        maxConcurrency: input.max_concurrency ?? DEFAULT_RUNTIME_CONFIG.maxConcurrency,
        // AI 研判：展开 cli 默认（provider/model/baseUrl/trigger 与 CLI 对齐），
        // 仅覆盖开关与显式参数；apiKey 只从 env 读取（DEPENDFIX_AI_API_KEY），
        // 禁止经 tool 参数传入（防客户端日志泄露）。
        // defaultAi 收窄：默认配置缺失时视为未开启（与类型声明一致，运行时恒有值）
        ai: input.ai_enabled && defaultAi
            ? {
                ...defaultAi,
                enabled: true,
                provider: input.ai_provider ?? defaultAi.provider,
                model: input.ai_model ?? defaultAi.model,
                trigger: input.ai_trigger ?? defaultAi.trigger,
                apiKey: process.env.DEPENDFIX_AI_API_KEY,
            }
            : undefined,
    }

    try {
        const app = new DependfixApp({
            config,
            workDir: process.cwd(),
            reportOutputDir: process.env.DEPENDFIX_MCP_REPORT_DIR ?? './dependfix-reports',
        })
        const { result, exitCode } = await app.run()

        return {
            ok: true,
            exitCode,
            runId: result.runId,
            summary: result.summary,
            repositories: result.repositories.map((r) => ({
                repository: r.repository,
                alertsCount: r.alertsCount,
                fixable: r.fixable,
                fixed: r.fixed,
                failed: r.failed,
                lockfileRepaired: r.lockfileRepaired,
                verificationPassed: r.verificationPassed ?? undefined,
                durationMs: r.durationMs,
            })),
            errors: result.errors.map((e) => ({
                repository: e.repository,
                stage: e.stage,
                category: e.category,
                message: e.message,
            })),
        }
    } catch (error) {
        return toToolError(error)
    }
}
