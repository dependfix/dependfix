// sandbox-test-fixtures.ts — 沙箱执行器测试共用的最小上下文（不计入产品代码）。
import type { ScanExecutorContext } from './types'

export const defaultRuntimeConfig = {
    mode: 'report-only' as const,
    severityThreshold: 'high' as const,
    repositories: ['owner-a/repo-b'],
    dryRun: false,
    createPullRequest: false,
    commit: false,
    cleanupBranches: false,
    cleanupBranchesAuto: false,
    githubToken: 'ghp_test',
    alertSource: 'github-dependabot' as const,
    codeScanningEnabled: false,
    codeQualityEnabled: false,
    allowMajorUpgrade: false,
    maxAlertsPerRepository: 20,
    maxConcurrency: 1,
    maxRetries: 3,
    maxBackoffMs: 30_000,
    maxRepos: 100,
}

export const makeCtx = (overrides: Partial<ScanExecutorContext> = {}): ScanExecutorContext => ({
    runId: 'run-sandbox-1',
    repository: {
        owner: 'owner-a',
        name: 'repo-b',
        defaultBranch: 'main',
    },
    config: defaultRuntimeConfig,
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-sandbox-1',
    ...overrides,
})
