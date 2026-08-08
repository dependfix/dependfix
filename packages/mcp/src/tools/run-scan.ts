import { DependfixApp, type RuntimeConfig } from 'dependfix'
import { isValidRepoIdentifier } from '@dependfix/core'

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
}): Promise<RunScanResult> => {
    const token = process.env.GITHUB_TOKEN
    if (!token) {
        return { ok: false, error: 'GITHUB_TOKEN not set（请配置环境变量）' }
    }

    // repo 格式校验复用 core（与 CLI 同源）
    if (!isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    const [owner, repo] = input.repo.split('/')

    const config: RuntimeConfig = {
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
        alertSource: 'github-dependabot',
        codeScanningEnabled: input.code_scanning ?? false,
        allowMajorUpgrade: input.allow_major_upgrade ?? false,
        maxAlertsPerRepository: input.max_alerts ?? 20,
        maxConcurrency: input.max_concurrency ?? 1,
        maxRetries: 3,
        maxBackoffMs: 30_000,
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
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
