import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import {
    generateMarkdownReport,
    generateJsonReport,
    writeReport,
    type RunResult,
    type RepositoryResult,
    type FixAction,
    type FixError,
    type NormalizedSecurityAlert,
    aggregateSeverity,
    groupByRepository,
    alertKey,
    formatDuration,
    actionTypeLabel,
    statusIcon,
    createEmptyRunSummary,
} from './index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_RUN_RESULT: RunResult = {
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
        lockfileRepairs: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
    },
    repositories: [],
    alerts: [],
    actions: [],
    errors: [],
}

function makeAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
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
        ...overrides,
    }
}

function makeAction(overrides: Partial<FixAction> = {}): FixAction {
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

function makeError(overrides: Partial<FixError> = {}): FixError {
    return {
        repository: 'owner/repo',
        stage: 'fix',
        category: 'RESOLVE_ERROR',
        message: 'No matching version found',
        ...overrides,
    }
}

function cleanupTemp(dir: string): void {
    try {
        rmSync(dir, { recursive: true, force: true })
    } catch {
        /* ignore */
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
    it('< 1s for < 1000ms', () => {
        expect(formatDuration(0)).toBe('< 1s')
        expect(formatDuration(999)).toBe('< 1s')
    })

    it('seconds', () => {
        expect(formatDuration(1000)).toBe('1s')
        expect(formatDuration(5500)).toBe('6s')
        expect(formatDuration(59_000)).toBe('59s')
    })

    it('minutes', () => {
        expect(formatDuration(60_000)).toBe('1m')
        expect(formatDuration(120_000)).toBe('2m')
        expect(formatDuration(90_000)).toBe('1m 30s')
        expect(formatDuration(3_540_000)).toBe('59m')
    })

    it('hours', () => {
        expect(formatDuration(3_600_000)).toBe('1h')
        expect(formatDuration(7_200_000)).toBe('2h')
    })
})

describe('statusIcon', () => {
    it('✅ for success', () => {
        expect(statusIcon(true)).toBe('✅')
    })

    it('❌ for failure', () => {
        expect(statusIcon(false)).toBe('❌')
    })
})

describe('actionTypeLabel', () => {
    it('returns type string', () => {
        expect(actionTypeLabel('dependency-upgrade')).toBe('dependency-upgrade')
        expect(actionTypeLabel('lockfile-repair')).toBe('lockfile-repair')
        expect(actionTypeLabel('verification')).toBe('verification')
        expect(actionTypeLabel('branch-cleanup')).toBe('branch-cleanup')
    })
})

describe('alertKey', () => {
    it('generates unique key', () => {
        const alert = makeAlert({ repository: 'owner/repo', packageName: 'lodash', recommendedVersion: '4.17.21' })
        expect(alertKey(alert)).toBe('owner/repo/lodash@4.17.21')
    })
})

describe('aggregateSeverity', () => {
    it('aggregates alerts by severity', () => {
        const alerts = [
            makeAlert({ severity: 'critical', fixable: true }),
            makeAlert({ severity: 'high', fixable: true }),
            makeAlert({ severity: 'medium', fixable: false }),
        ]
        const breakdown = aggregateSeverity(alerts, new Set())
        expect(breakdown.critical.found).toBe(1)
        expect(breakdown.critical.fixable).toBe(1)
        expect(breakdown.high.found).toBe(1)
        expect(breakdown.medium.found).toBe(1)
        expect(breakdown.medium.fixable).toBe(0)
        expect(breakdown.low.found).toBe(0)
    })

    it('tracks fixed alerts', () => {
        const alert = makeAlert({ severity: 'high', fixable: true })
        const key = alertKey(alert)
        const breakdown = aggregateSeverity([alert], new Set([key]))
        expect(breakdown.high.fixed).toBe(1)
    })
})

describe('groupByRepository', () => {
    it('groups alerts and actions by repository', () => {
        const alerts = [
            makeAlert({ repository: 'a/b' }),
            makeAlert({ repository: 'a/b', packageName: 'express' }),
        ]
        const actions: FixAction[] = [makeAction({ repository: 'a/b' })]
        const repoResults: RepositoryResult[] = [
            { repository: 'a/b', defaultBranch: 'main', alertsCount: 2, fixable: 2, fixed: 1, failed: 0, lockfileRepaired: false, durationMs: 1000 },
        ]
        const grouped = groupByRepository(alerts, actions, repoResults)
        expect(grouped).toHaveLength(1)
        expect(grouped[0].alerts).toHaveLength(2)
        expect(grouped[0].actions).toHaveLength(1)
    })
})

describe('createEmptyRunSummary', () => {
    it('returns all zeros', () => {
        const s = createEmptyRunSummary()
        expect(s.repositoriesScanned).toBe(0)
        expect(s.alertsFixed).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// generateMarkdownReport
// ---------------------------------------------------------------------------

describe('generateMarkdownReport', () => {
    it('renders header with runId and mode', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).toContain('# dependfix Report')
        expect(md).toContain('test-run-001')
        expect(md).toContain('report-only')
        expect(md).toContain('Severity ≥ high')
    })

    it('renders local workspace label for pnpm-audit fallback repository', () => {
        const repoResult: RepositoryResult = {
            repository: 'local', defaultBranch: '', alertsCount: 1,
            fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 500,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            config: { ...EMPTY_RUN_RESULT.config, alertSource: 'pnpm-audit' as const },
            repositories: [repoResult],
            alerts: [makeAlert({ source: 'pnpm-audit', repository: 'local', defaultBranch: '', ruleId: 'https://github.com/advisories/GHSA-x', htmlUrl: '' })],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('### Local workspace')
        expect(md).not.toContain('### local')
    })

    it('renders alert source in header (github-dependabot default)', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).toContain('GitHub Dependabot API')
    })

    it('renders pnpm-audit alert source in header', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            config: { ...EMPTY_RUN_RESULT.config, alertSource: 'pnpm-audit' as const },
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('Alert Source')
        expect(md).toContain('pnpm-audit (local workspace)')
    })

    it('renders summary table with all metrics', () => {
        const result = { ...EMPTY_RUN_RESULT, summary: { ...EMPTY_RUN_RESULT.summary, alertsFound: 42, alertsFixed: 10 } }
        const md = generateMarkdownReport(result)
        expect(md).toContain('Alerts found')
        expect(md).toContain('42')
        expect(md).toContain('10')
    })

    it('renders severity breakdown when alerts exist', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            alerts: [makeAlert({ severity: 'critical' }), makeAlert({ severity: 'high' })],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## Alerts by Severity')
        expect(md).toContain('Critical')
        expect(md).toContain('High')
    })

    it('skips severity section when no alerts', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Alerts by Severity')
    })

    it('renders repository section', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1,
            fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [makeAlert()],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## Repositories')
        expect(md).toContain('### owner/repo')
        expect(md).toContain('lodash')
    })

    it('shows fix actions table', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [makeAction()],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## Fix Actions')
        expect(md).toContain('dependency-upgrade')
        expect(md).toContain('✅')
    })

    it('shows no fix actions message when empty', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).toContain('_No fix actions performed._')
    })

    it('renders errors section when errors exist', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            errors: [makeError()],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## Errors')
        expect(md).toContain('RESOLVE_ERROR')
    })

    it('hides errors section when no errors', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Errors')
    })

    it('marks major upgrade in actions', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [makeAction({ isMajor: true, fromVersion: '^1.0.0', toVersion: '^2.0.0' })],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('^1.0.0 → ^2.0.0')
    })

    it('shows lockfile repair action with strategy', () => {
        const action: FixAction = {
            type: 'lockfile-repair',
            repository: 'owner/repo',
            target: 'pnpm-lock.yaml',
            strategy: 'REGENERATE',
            diff: '+5/-3 lines, 2 packages changed',
            success: true,
            durationMs: 1100,
        }
        const md = generateMarkdownReport({
            ...EMPTY_RUN_RESULT,
            actions: [action],
        })
        expect(md).toContain('lockfile-repair')
        expect(md).toContain('REGENERATE')
    })

    it('handles repository with no alerts', () => {
        const repoResult: RepositoryResult = {
            repository: 'empty/repo', defaultBranch: 'dev', alertsCount: 0,
            fixable: 0, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 500,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('### empty/repo')
        expect(md).toContain('_No alerts')
    })

    it('renders GHSA column per alert (audit granularity for duplicate packages)', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 2,
            fixable: 2, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            // 同一包两条告警（fast-uri 场景）：逐条保留，GHSA 列区分
            alerts: [
                makeAlert({ packageName: 'fast-uri', ruleId: 'GHSA-aaaa', recommendedVersion: '3.1.5' }),
                makeAlert({ packageName: 'fast-uri', ruleId: 'GHSA-bbbb', recommendedVersion: '3.1.5' }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('| Package | GHSA | Severity | From | To | Major | Status |')
        expect(md.match(/\| `fast-uri` \|/g)).toHaveLength(2)
        expect(md).toContain('GHSA-aaaa')
        expect(md).toContain('GHSA-bbbb')
    })

    it('renders skipped alerts with target version and dash from (no misleading from/to)', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1,
            fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [makeAlert({ recommendedVersion: '4.17.21' })],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('| `lodash` | CVE-2021-23337 | HIGH | — | 4.17.21 | — | ⏭️ Skipped |')
    })

    it('renders failed action error in Fix Actions table with escaping', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [
                makeAction({
                    success: false,
                    fromVersion: '^1.0.0',
                    toVersion: '^2.0.0',
                    error: 'resolution failed\nfailed | to parse',
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('⚠️ resolution failed failed \\| to parse')
        expect(md).not.toContain('\nfailed | to parse')
    })

    it('renders verification failure error in Fix Actions table', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [
                makeAction({
                    type: 'verification',
                    target: 'pnpm lint',
                    success: false,
                    error: 'exit code 1',
                    durationMs: 500,
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('pnpm lint')
        expect(md).toContain('⚠️ exit code 1')
    })
})

// ---------------------------------------------------------------------------
// generateJsonReport
// ---------------------------------------------------------------------------

describe('generateJsonReport', () => {
    it('produces valid JSON', () => {
        const json = generateJsonReport(EMPTY_RUN_RESULT)
        const parsed = JSON.parse(json) as RunResult
        expect(parsed.runId).toBe('test-run-001')
    })

    it('includes all top-level keys', () => {
        const json = generateJsonReport(EMPTY_RUN_RESULT)
        const parsed = JSON.parse(json) as RunResult
        expect(parsed).toHaveProperty('runId')
        expect(parsed).toHaveProperty('startedAt')
        expect(parsed).toHaveProperty('finishedAt')
        expect(parsed).toHaveProperty('config')
        expect(parsed).toHaveProperty('summary')
        expect(parsed).toHaveProperty('repositories')
        expect(parsed).toHaveProperty('alerts')
        expect(parsed).toHaveProperty('actions')
        expect(parsed).toHaveProperty('errors')
    })

    it('arrays are present even when empty', () => {
        const json = generateJsonReport(EMPTY_RUN_RESULT)
        const parsed = JSON.parse(json) as RunResult
        expect(Array.isArray(parsed.repositories)).toBe(true)
        expect(Array.isArray(parsed.alerts)).toBe(true)
        expect(Array.isArray(parsed.actions)).toBe(true)
        expect(Array.isArray(parsed.errors)).toBe(true)
    })

    it('does not contain token keys', () => {
        const json = generateJsonReport(EMPTY_RUN_RESULT)
        expect(json).not.toContain('githubToken')
        expect(json).not.toContain('GITHUB_TOKEN')
    })
})

// ---------------------------------------------------------------------------
// writeReport
// ---------------------------------------------------------------------------

describe('writeReport', () => {
    const testDir = join(tmpdir(), 'dependfix-report-test')

    afterEach(() => {
        cleanupTemp(testDir)
        cleanupTemp('./dependfix-reports')
    })

    it('writes .md and .json files', () => {
        const artifacts = writeReport('# Test', '{}', '2026-07-30T10:00:00.000Z', 'run12345678', testDir)
        expect(artifacts).toHaveLength(2)

        const mdArtifact = artifacts.find((a) => a.format === 'markdown')
        const jsonArtifact = artifacts.find((a) => a.format === 'json')
        expect(mdArtifact).toBeDefined()
        expect(jsonArtifact).toBeDefined()

        expect(existsSync(mdArtifact.path)).toBe(true)
        expect(existsSync(jsonArtifact.path)).toBe(true)
        expect(readFileSync(mdArtifact.path, 'utf-8')).toBe('# Test')
        expect(readFileSync(jsonArtifact.path, 'utf-8')).toBe('{}')
    })

    it('creates output directory if missing', () => {
        const subdir = join(testDir, 'nested', 'reports')
        const artifacts = writeReport('# Nested', '{}', '2026-07-30T00:00:00.000Z', 'abc', subdir)
        expect(artifacts).toHaveLength(2)
        expect(existsSync(subdir)).toBe(true)
    })

    it('uses last runId segment as filename suffix', () => {
        const artifacts = writeReport('# test', '{}', '2026-07-30T10:20:30.000Z', 'dependfix-m2k3x5a-7xk9q0', testDir)
        expect(artifacts[0].path).toContain('dependfix-report-20260730-102030-7xk9q0.md')
        expect(artifacts[1].path).toContain('dependfix-report-20260730-102030-7xk9q0.json')
    })

    it('truncates fallback suffix to 8 chars when runId has no dash', () => {
        const artifacts = writeReport('# test', '{}', '2026-07-30T00:00:00.000Z', 'abcdefghijkl', testDir)
        expect(artifacts[0].path).toContain('abcdefgh')
        expect(artifacts[0].path).not.toContain('abcdefghijkl')
    })

    it('falls back to full runId when trailing dash yields empty segment', () => {
        const artifacts = writeReport('# test', '{}', '2026-07-30T00:00:00.000Z', 'abc-', testDir)
        expect(artifacts[0].path).toContain('dependfix-report-20260730-000000-abc-.md')
    })

    it('extracts date from ISO string', () => {
        const artifacts = writeReport('# test', '{}', '2026-01-15T12:00:00.000Z', 'run1', testDir)
        expect(artifacts[0].path).toContain('20260115')
    })

    it('extracts time from ISO string', () => {
        const artifacts = writeReport('# test', '{}', '2026-01-15T12:34:56.000Z', 'run1', testDir)
        expect(artifacts[0].path).toContain('dependfix-report-20260115-123456-run1.md')
    })

    it('uses default output dir', () => {
        const artifacts = writeReport('# t', '{}', '2026-07-30T00:00:00.000Z', 'r1')
        expect(artifacts).toHaveLength(2)
        expect(artifacts[0].path).toContain('dependfix-reports')
        cleanupTemp('./dependfix-reports')
    })
})
