import { rmSync } from 'node:fs'
import type { NormalizedSecurityAlert } from '../alerts'
import type {
    FixAction,
    FixError,
    RunResult,
} from './index'

// ---------------------------------------------------------------------------
// report 测试共享 fixtures / helpers（report.test.ts 与 report-markdown.test.ts 共用）
// ---------------------------------------------------------------------------

export const EMPTY_RUN_RESULT: RunResult = {
    runId: 'test-run-001',
    startedAt: '2026-07-30T10:00:00.000Z',
    finishedAt: '2026-07-30T10:05:00.000Z',
    config: {
        mode: 'report-only',
        severityThreshold: 'high',
        repositories: ['owner/repo'],
        dryRun: false,
        createPullRequest: false,
        maxAlertsPerRepository: 10,
        alertSource: 'github-dependabot',
    },
    summary: {
        repositoriesScanned: 0,
        alertsFound: 0,
        alertsFixable: 0,
        alertsFixed: 0,
        alertsFailed: 0,
        alertsSkipped: 0,
        alertsConverged: 0,
        alertsTruncated: 0,
        lockfileRepairs: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
    },
    repositories: [],
    alerts: [],
    actions: [],
    errors: [],
}

export function makeAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
    return {
        id: 1,
        source: 'dependabot',
        repository: 'owner/repo',
        defaultBranch: 'main',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName: 'lodash',
        manifestPath: 'package.json',
        ruleId: 'CVE-2021-23337',
        summary: 'Command injection in lodash',
        htmlUrl: 'https://github.com/owner/repo/security/dependabot/1',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion: '4.17.21',
        upstreamId: 'dependabot:1',
        ...overrides,
    }
}

export function makeAction(overrides: Partial<FixAction> = {}): FixAction {
    return {
        type: 'dependency-upgrade',
        repository: 'owner/repo',
        target: 'lodash',
        fromVersion: '^4.17.20',
        toVersion: '^4.17.21',
        isMajor: false,
        success: true,
        durationMs: 2300,
        ...overrides,
    }
}

export function makeError(overrides: Partial<FixError> = {}): FixError {
    return {
        repository: 'owner/repo',
        stage: 'fix',
        category: 'RESOLVE_ERROR',
        message: 'No matching version found',
        ...overrides,
    }
}

export function cleanupTemp(dir: string): void {
    try {
        rmSync(dir, { recursive: true, force: true })
    } catch {
        /* ignore */
    }
}
