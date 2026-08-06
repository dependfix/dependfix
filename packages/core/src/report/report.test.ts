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
    isAlertFixedByActions,
    parseRangeTargets,
    statusIcon,
    collectCodeScanningSuggestions,
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
        alertsConverged: 0,
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
        const breakdown = aggregateSeverity(alerts, [])
        expect(breakdown.critical.found).toBe(1)
        expect(breakdown.critical.fixable).toBe(1)
        expect(breakdown.high.found).toBe(1)
        expect(breakdown.medium.found).toBe(1)
        expect(breakdown.medium.fixable).toBe(0)
        expect(breakdown.low.found).toBe(0)
    })

    it('tracks fixed alerts by version satisfaction (isAlertFixedByActions)', () => {
        const alert = makeAlert({ severity: 'high', fixable: true, recommendedVersion: '4.17.21' })
        const actions: FixAction[] = [{
            type: 'dependency-upgrade',
            repository: 'owner/repo',
            target: 'lodash',
            toVersion: '^4.17.21',
            success: true,
        }]
        const breakdown = aggregateSeverity([alert], actions)
        expect(breakdown.high.fixed).toBe(1)
    })

    it('does not mark cross-major alerts as fixed when target not reached (PR #28 regression)', () => {
        // 告警推荐 6.4.3，实际只升到 5.4.21（跨线未修复）→ 不标 fixed
        const alert = makeAlert({ severity: 'high', fixable: true, recommendedVersion: '6.4.3' })
        const actions: FixAction[] = [{
            type: 'dependency-upgrade',
            repository: 'owner/repo',
            target: 'vite',
            toVersion: '^5.4.21',
            success: true,
        }]
        const breakdown = aggregateSeverity([alert], actions)
        expect(breakdown.high.fixed).toBe(0)
    })
})

describe('isAlertFixedByActions', () => {
    function depAction(toVersion: string | undefined, overrides: Partial<FixAction> = {}): FixAction {
        return {
            type: 'dependency-upgrade',
            repository: 'owner/repo',
            target: 'lodash', // 与 makeAlert 默认 packageName 一致
            toVersion,
            success: true,
            ...overrides,
        }
    }

    it('marks fixed when same-major target reaches recommended version', () => {
        const alert = makeAlert({ recommendedVersion: '5.4.21' })
        expect(isAlertFixedByActions(alert, [depAction('^5.4.21')])).toBe(true)
        expect(isAlertFixedByActions(alert, [depAction('5.4.21, 6.4.3')])).toBe(true)
    })

    it('does NOT mark fixed when only a different-major target exists (P1-2 mixed scenario)', () => {
        // 跨线告警 X（推荐 6.4.3）+ 同包线内 action（目标 ^8.2.1）→ 8.x 目标不满足 6.x 告警
        const alert = makeAlert({ recommendedVersion: '6.4.3' })
        expect(isAlertFixedByActions(alert, [depAction('^8.2.1')])).toBe(false)
    })

    it('does NOT mark fixed when target is lower than recommended (same major)', () => {
        const alert = makeAlert({ recommendedVersion: '5.4.21' })
        expect(isAlertFixedByActions(alert, [depAction('^5.4.14')])).toBe(false)
    })

    it('falls back to package-level match when recommendedVersion is empty', () => {
        const alert = makeAlert({ recommendedVersion: '' })
        expect(isAlertFixedByActions(alert, [depAction('^4.17.21')])).toBe(true)
        expect(isAlertFixedByActions(alert, [])).toBe(false)
    })

    it('treats noOp / failed / wrong-package actions as not fixing', () => {
        const alert = makeAlert({ recommendedVersion: '5.4.21' })
        expect(isAlertFixedByActions(alert, [depAction('^5.4.21', { noOp: true })])).toBe(false)
        expect(isAlertFixedByActions(alert, [depAction('^5.4.21', { success: false })])).toBe(false)
        expect(isAlertFixedByActions(alert, [depAction('^5.4.21', { target: 'other' })])).toBe(false)
        expect(isAlertFixedByActions(alert, [depAction('^5.4.21', { repository: 'other/repo' })])).toBe(false)
    })

    it('handles code-scanning alerts by ruleId@filePath', () => {
        const csAlert = makeAlert({
            source: 'code-scanning',
            packageName: 'eol-last',
            ruleId: 'eol-last',
            manifestPath: 'src/foo.ts',
            recommendedVersion: '',
        })
        const csAction: FixAction = {
            type: 'code-scanning-fix',
            repository: 'owner/repo',
            target: 'eol-last',
            filePath: 'src/foo.ts',
            success: true,
        }
        expect(isAlertFixedByActions(csAlert, [csAction])).toBe(true)
        expect(isAlertFixedByActions(csAlert, [{ ...csAction, filePath: 'src/other.ts' }])).toBe(false)
        expect(isAlertFixedByActions(csAlert, [{ ...csAction, noOp: true }])).toBe(false)
    })

    it('ignores unparseable toVersion values', () => {
        const alert = makeAlert({ recommendedVersion: '5.4.21' })
        expect(isAlertFixedByActions(alert, [depAction('unknown')])).toBe(false)
        expect(isAlertFixedByActions(alert, [depAction(undefined)])).toBe(false)
    })
})

describe('parseRangeTargets', () => {
    it('extracts versions from caret/tilde/geq prefixes', () => {
        expect(parseRangeTargets(['^5.4.21'])).toEqual(['5.4.21'])
        expect(parseRangeTargets(['~5.4.21'])).toEqual(['5.4.21'])
        expect(parseRangeTargets(['>=5.4.21'])).toEqual(['5.4.21'])
        expect(parseRangeTargets(['5.4.21'])).toEqual(['5.4.21'])
    })

    it('extracts all targets from comma-separated lists', () => {
        expect(parseRangeTargets(['5.4.21, 6.4.3'])).toEqual(['5.4.21', '6.4.3'])
    })

    it('returns empty for unparseable input', () => {
        expect(parseRangeTargets([])).toEqual([])
        expect(parseRangeTargets([undefined])).toEqual([])
        expect(parseRangeTargets(['unknown'])).toEqual([])
        expect(parseRangeTargets(['not-a-version'])).toEqual([])
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

    it('renders Rule/Advisory column per alert (audit granularity for duplicate packages)', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 2,
            fixable: 2, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            // 同一包两条告警（fast-uri 场景）：逐条保留，Rule/Advisory 列区分
            alerts: [
                makeAlert({ packageName: 'fast-uri', ruleId: 'GHSA-aaaa', recommendedVersion: '3.1.5' }),
                makeAlert({ packageName: 'fast-uri', ruleId: 'GHSA-bbbb', recommendedVersion: '3.1.5' }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('| Package | Rule/Advisory | Class | Severity | From | To | Major | Status |')
        expect(md.match(/\| `fast-uri` \|/g)).toHaveLength(2)
        expect(md).toContain('GHSA-aaaa')
        expect(md).toContain('GHSA-bbbb')
    })

    it('renders code-scanning alerts with rule id and class in their columns', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 3,
            fixable: 0, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            // Code Scanning 告警：packageName 显示规则名，Rule/Advisory 列显示 rule id，Class 列显示 A/B/C 分层
            alerts: [
                makeAlert({
                    source: 'code-scanning',
                    packageName: 'SQL injection',
                    ruleId: 'js/sql-injection',
                    severity: 'high',
                    recommendedVersion: '',
                    alertClass: 'suggested',
                }),
                makeAlert({
                    source: 'code-scanning',
                    packageName: 'Alignment',
                    ruleId: 'jsdoc/check-alignment',
                    severity: 'low',
                    recommendedVersion: '',
                    alertClass: 'auto-fixable',
                }),
                makeAlert({
                    source: 'code-scanning',
                    packageName: 'Exotic rule',
                    ruleId: 'js/exotic',
                    severity: 'medium',
                    recommendedVersion: '',
                    alertClass: 'report-only',
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('| `SQL injection` | js/sql-injection | B 建议 | HIGH | — | — | — | ⏭️ Skipped |')
        expect(md).toContain('| `Alignment` | jsdoc/check-alignment | A 自动修复 | LOW | — | — | — | ⏭️ Skipped |')
        expect(md).toContain('| `Exotic rule` | js/exotic | C 仅报告 | MEDIUM | — | — | — | ⏭️ Skipped |')
    })

    it('renders dash class for non-code-scanning sources', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1,
            fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                makeAlert({ packageName: 'fast-uri', ruleId: 'GHSA-cccc', recommendedVersion: '3.1.5' }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('| `fast-uri` | GHSA-cccc | — | HIGH |')
    })

    it('renders code-scanning fix as Fixed (not Skipped) in repository detail and severity rows', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1,
            fixable: 0, fixed: 1, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                makeAlert({
                    source: 'code-scanning',
                    packageName: 'End of line',
                    ruleId: 'eol-last',
                    severity: 'low',
                    recommendedVersion: '',
                    alertClass: 'auto-fixable',
                    fixable: false,
                    fixStrategy: null,
                    manifestPath: 'src/foo.ts',
                }),
            ],
            actions: [{
                type: 'code-scanning-fix',
                repository: 'owner/repo',
                target: 'eol-last',
                filePath: 'src/foo.ts',
                success: true,
                diff: 'appended trailing newline to src/foo.ts',
                durationMs: 10,
            }],
        }
        const md = generateMarkdownReport(result)

        // 明细表：按 ruleId + 文件路径关联 code-scanning-fix action → Fixed，而非 Skipped
        expect(md).toContain('| `End of line` | eol-last | A 自动修复 | LOW | — | — | — | ✅ Fixed |')
        // Severity 表：low 行 fixed 计数 1（code-scanning 键 repo/ruleId@filePath 匹配）
        expect(md).toMatch(/\| Low \| 1 \| 0 \| 1 \| 0 \|/)
    })

    it('renders cross-major alerts as Skipped with recommended version, not Fixed (PR #28)', () => {
        // 跨线告警（推荐 6.4.3，无 6.x 目标）+ 同包线内成功 action（^5.4.21）
        // → Repo 表显示 ⏭️ Skipped + To=6.4.3；Severity 表 fixed 计数 0
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1,
            fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                makeAlert({
                    packageName: 'vite',
                    ruleId: 'GHSA-fx2h',
                    severity: 'high',
                    recommendedVersion: '6.4.3',
                }),
            ],
            actions: [{
                type: 'dependency-upgrade',
                repository: 'owner/repo',
                target: 'vite',
                fromVersion: '5.4.14',
                toVersion: '^5.4.21',
                isMajor: false,
                success: true,
            }],
        }
        const md = generateMarkdownReport(result)

        // 跨线行：Skipped + To 显示推荐版本（不因同包 action 误标 Fixed）
        expect(md).toContain('| `vite` | GHSA-fx2h | — | HIGH | — | 6.4.3 | — | ⏭️ Skipped |')
        // Severity 表：high 行 fixed 0
        expect(md).toMatch(/\| High \| 1 \| 1 \| 0 \| 0 \|/)
    })

    it('excludes no-op fixes from fixed counts and renders them as skipped', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1,
            fixable: 0, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: { ...EMPTY_RUN_RESULT.summary, alertsFixed: 0 },
            repositories: [repoResult],
            alerts: [
                makeAlert({
                    source: 'code-scanning',
                    packageName: 'End of line',
                    ruleId: 'eol-last',
                    severity: 'low',
                    recommendedVersion: '',
                    alertClass: 'auto-fixable',
                    fixable: false,
                    fixStrategy: null,
                }),
            ],
            actions: [{
                type: 'code-scanning-fix',
                repository: 'owner/repo',
                target: 'eol-last',
                filePath: 'src/foo.ts',
                success: true,
                noOp: true,
                diff: 'no-op: src/foo.ts already ends with newline',
                durationMs: 10,
            }],
        }
        const md = generateMarkdownReport(result)

        // no-op 不算修复：明细显示 Skipped，severity 表 fixed 为 0
        expect(md).toContain('| `End of line` | eol-last | A 自动修复 | LOW | — | — | — | ⏭️ Skipped |')
        expect(md).toMatch(/\| Low \| 1 \| 0 \| 0 \| 0 \|/)
    })

    it('distinguishes multi-instance fixes by file path (same rule, different files)', () => {
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 2,
            fixable: 0, fixed: 1, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                makeAlert({
                    source: 'code-scanning',
                    packageName: 'End of line',
                    ruleId: 'eol-last',
                    severity: 'low',
                    recommendedVersion: '',
                    alertClass: 'auto-fixable',
                    fixable: false,
                    fixStrategy: null,
                    manifestPath: 'src/a.ts',
                }),
                makeAlert({
                    source: 'code-scanning',
                    packageName: 'End of line',
                    ruleId: 'eol-last',
                    severity: 'low',
                    recommendedVersion: '',
                    alertClass: 'auto-fixable',
                    fixable: false,
                    fixStrategy: null,
                    manifestPath: 'src/b.ts',
                }),
            ],
            actions: [{
                type: 'code-scanning-fix',
                repository: 'owner/repo',
                target: 'eol-last',
                filePath: 'src/a.ts',
                success: true,
                diff: 'appended trailing newline to src/a.ts',
                durationMs: 10,
            }],
        }
        const md = generateMarkdownReport(result)

        // 同规则多实例：仅修复的文件显示 Fixed，未修复的显示 Skipped；severity 表 fixed=1
        expect(md).toContain('| `End of line` | eol-last | A 自动修复 | LOW | — | — | — | ✅ Fixed |')
        expect(md).toContain('| `End of line` | eol-last | A 自动修复 | LOW | — | — | — | ⏭️ Skipped |')
        expect(md).toMatch(/\| Low \| 2 \| 0 \| 1 \| 0 \|/)
    })

    it('counts dependency-upgrade fixes in severity table (package-level fixed key)', () => {
        // 端到端：action toVersion 带前缀（^4.17.21），包级匹配不再依赖版本精确对齐
        const repoResult: RepositoryResult = {
            repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1,
            fixable: 1, fixed: 1, failed: 0, lockfileRepaired: false, durationMs: 1000,
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [makeAlert({ recommendedVersion: '4.17.21' })],
            actions: [makeAction({ toVersion: '^4.17.21', success: true })],
        }
        const md = generateMarkdownReport(result)

        expect(md).toMatch(/\| High \| 1 \| 1 \| 1 \| 0 \|/)
        expect(md).toContain('| `lodash` | CVE-2021-23337 | — | HIGH | ^4.17.20 | ^4.17.21 | No | ✅ Fixed |')
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

        expect(md).toContain('| `lodash` | CVE-2021-23337 | — | HIGH | — | 4.17.21 | — | ⏭️ Skipped |')
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
// collectCodeScanningSuggestions（T304 建议型输出）
// ---------------------------------------------------------------------------

describe('collectCodeScanningSuggestions', () => {
    const repoResult: RepositoryResult = {
        repository: 'owner/repo', defaultBranch: 'main', alertsCount: 3,
        fixable: 0, fixed: 1, failed: 0, lockfileRepaired: false, durationMs: 1000,
    }

    function csAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
        return makeAlert({
            source: 'code-scanning',
            packageName: 'Rule name',
            fixable: false,
            fixStrategy: null,
            recommendedVersion: '',
            ...overrides,
        })
    }

    it('collects B/C class alerts with location, reason and suggestion', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                csAlert({
                    ruleId: 'js/sql-injection',
                    alertClass: 'suggested',
                    severity: 'high',
                    manifestPath: 'src/db.ts',
                    startLine: 42,
                    summary: 'This query depends on a user-provided value.',
                    suggestion: '使用参数化查询',
                }),
                csAlert({
                    ruleId: 'js/exotic',
                    alertClass: 'report-only',
                    severity: 'medium',
                    manifestPath: 'src/x.ts',
                    startLine: 7,
                    summary: 'Exotic rule fired',
                }),
            ],
        }
        const rows = collectCodeScanningSuggestions(result, 'fix')

        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({
            ruleId: 'js/sql-injection',
            location: 'src/db.ts:42',
            severity: 'high',
            reason: 'B 类建议规则（需人工判断）',
            suggestion: '使用参数化查询',
        })
        expect(rows[1].reason).toBe('C 类仅报告（未列入自动修复/建议列表）')
        expect(rows[1].suggestion).toBe('人工审查该 Code Scanning 告警')
    })

    it('excludes auto-fixed alerts and uses noOp action error as reason', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                csAlert({
                    ruleId: 'eol-last',
                    alertClass: 'auto-fixable',
                    severity: 'low',
                    manifestPath: 'src/a.ts',
                    startLine: 1,
                }),
                csAlert({
                    ruleId: 'eol-last',
                    alertClass: 'auto-fixable',
                    severity: 'low',
                    manifestPath: 'src/b.ts',
                    startLine: 1,
                }),
            ],
            actions: [
                {
                    type: 'code-scanning-fix',
                    repository: 'owner/repo',
                    target: 'eol-last',
                    filePath: 'src/a.ts',
                    success: true,
                    diff: 'appended trailing newline',
                    durationMs: 10,
                },
                {
                    type: 'code-scanning-fix',
                    repository: 'owner/repo',
                    target: 'eol-last',
                    filePath: 'src/b.ts',
                    success: true,
                    noOp: true,
                    error: 'cannot read src/b.ts (stale alert?)',
                    durationMs: 10,
                },
            ],
        }
        const rows = collectCodeScanningSuggestions(result, 'fix')

        // a.ts 已修复 → 不出现；b.ts noOp → 出现且 reason 为 action error
        expect(rows).toHaveLength(1)
        expect(rows[0].location).toBe('src/b.ts:1')
        expect(rows[0].reason).toContain('stale alert')
    })

    it('uses failed action error as reason with priority over class label', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                csAlert({
                    ruleId: 'js/sql-injection',
                    alertClass: 'suggested',
                    severity: 'high',
                    manifestPath: 'src/db.ts',
                    startLine: 42,
                }),
            ],
            actions: [{
                type: 'code-scanning-fix',
                repository: 'owner/repo',
                target: 'js/sql-injection',
                filePath: 'src/db.ts',
                success: false,
                error: 'cannot write src/db.ts',
                durationMs: 10,
            }],
        }
        const rows = collectCodeScanningSuggestions(result, 'fix')

        // 修复失败 reason 优先于 B 类标签
        expect(rows).toHaveLength(1)
        expect(rows[0].reason).toBe('修复失败：cannot write src/db.ts')
    })

    it('flags A-class alert without action as abnormal path', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                csAlert({
                    ruleId: 'eol-last',
                    alertClass: 'auto-fixable',
                    severity: 'low',
                    manifestPath: 'src/c.ts',
                    startLine: 1,
                }),
            ],
        }
        const rows = collectCodeScanningSuggestions(result, 'fix')

        expect(rows).toHaveLength(1)
        expect(rows[0].reason).toBe('A 类规则未产生修复动作（异常路径，请人工检查）')
    })

    it('uses report-only wording for A-class alerts when mode is report-only', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                csAlert({
                    ruleId: 'eol-last',
                    alertClass: 'auto-fixable',
                    severity: 'low',
                    manifestPath: 'src/c.ts',
                    startLine: 1,
                }),
            ],
        }
        const rows = collectCodeScanningSuggestions(result, 'report-only')

        expect(rows).toHaveLength(1)
        // report-only 不执行修复是设计行为，不得显示"异常路径"
        expect(rows[0].reason).toBe('A 类自动修复规则（report-only 模式不执行修复）')
    })

    it('renders suggestions section in markdown report', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [repoResult],
            alerts: [
                csAlert({
                    ruleId: 'js/sql-injection',
                    alertClass: 'suggested',
                    severity: 'high',
                    manifestPath: 'src/db.ts',
                    startLine: 42,
                    summary: 'x',
                    suggestion: '使用参数化查询',
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('## Code Scanning Suggestions')
        expect(md).toContain('| Repository | Rule | Location | Severity | Reason | Suggestion |')
        expect(md).toContain('| `js/sql-injection` | `src/db.ts:42` | HIGH | B 类建议规则（需人工判断） | 使用参数化查询 |')
    })

    it('omits suggestions section when no unfixed code-scanning alerts exist', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('Code Scanning Suggestions')
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

