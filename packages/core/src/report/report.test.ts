import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import type { NormalizedSecurityAlert } from '../alerts'
import { EMPTY_RUN_RESULT, cleanupTemp, makeAction, makeAlert } from './report.test-helpers'
import {
    generateMarkdownReport,
    generateJsonReport,
    writeReport,
    type RunResult,
    type RepositoryResult,
    type FixAction,
    aggregateSeverity,
    groupByRepository,
    alertKey,
    formatDuration,
    actionTypeLabel,
    isAlertFixedByActions,
    parseRangeTargets,
    statusIcon,
    collectCodeScanningSuggestions,
    collectCodeQualityFindings,
    createEmptyRunSummary,
} from './index'

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

    it('does NOT mark fixed when only a different-major target exists', () => {
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

    it('never marks code-quality alerts as fixed by dependency upgrades (package-name overlap)', () => {
        // Code Quality 不可自动修复；同名 packageName 与 Dependabot 重叠时不走依赖升级路径
        const cqAlert = makeAlert({
            source: 'code-quality',
            packageName: 'lodash', // 与某 Dependabot 告警同名
            ruleId: 'js/complex-method',
            recommendedVersion: '',
        })
        const upgradeAction: FixAction = {
            type: 'dependency-upgrade',
            repository: 'owner/repo',
            target: 'lodash',
            toVersion: '^4.17.21',
            success: true,
        }
        expect(isAlertFixedByActions(cqAlert, [upgradeAction])).toBe(false)
        // 即便多源 action 并存，code-quality 仍 false
        expect(isAlertFixedByActions(cqAlert, [upgradeAction, { ...upgradeAction, type: 'code-scanning-fix' }])).toBe(false)
        expect(isAlertFixedByActions(cqAlert, [])).toBe(false)
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

    it('includes aiUsage when present', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            aiUsage: { calls: 2, inputTokens: 800, outputTokens: 200, totalTokens: 1000, estimatedCostUsd: 0.0002 },
        }
        const parsed = JSON.parse(generateJsonReport(result)) as RunResult
        expect(parsed.aiUsage).toEqual(result.aiUsage)
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
// collectCodeScanningSuggestions（建议型输出）
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
// collectCodeQualityFindings（Code Quality 报告段）
// ---------------------------------------------------------------------------

describe('collectCodeQualityFindings', () => {
    it('returns empty for results without code-quality alerts', () => {
        const result: RunResult = {
            ...EMPTY_RUN_RESULT,
            alerts: [
                makeAlert({ id: 1, source: 'dependabot', packageName: 'lodash' }),
            ],
        }
        expect(collectCodeQualityFindings(result)).toEqual([])
    })

    it('extracts rule/title/location/summary/suggestion from code-quality alerts', () => {
        const result: RunResult = {
            ...EMPTY_RUN_RESULT,
            alerts: [
                {
                    id: 42,
                    source: 'code-quality',
                    repository: 'owner/repo',
                    defaultBranch: 'main',
                    severity: 'medium',
                    packageEcosystem: 'code-quality',
                    packageName: 'Useless null check',
                    manifestPath: 'src/UselessNullCheck.java',
                    ruleId: 'java/useless-null-check',
                    summary: 'This check is useless.',
                    htmlUrl: 'https://github.com/owner/repo/code-quality/findings/42',
                    fixable: false,
                    fixStrategy: null,
                    recommendedVersion: '',
                    startLine: 9,
                    endLine: 18,
                    suggestion: 'Checking whether an expression is null...',
                },
            ],
        }

        const rows = collectCodeQualityFindings(result)

        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            repository: 'owner/repo',
            ruleId: 'java/useless-null-check',
            ruleTitle: 'Useless null check',
            location: 'src/UselessNullCheck.java:9',
            severity: 'medium',
            summary: 'This check is useless.',
            suggestion: 'Checking whether an expression is null...',
        })
    })

    it('omits location line suffix when startLine is absent', () => {
        const result: RunResult = {
            ...EMPTY_RUN_RESULT,
            alerts: [
                makeAlert({
                    id: 1,
                    source: 'code-quality',
                    packageName: 'NoLine',
                    manifestPath: 'src/x.ts',
                    ruleId: 'rule/x',
                }),
            ],
        }

        const rows = collectCodeQualityFindings(result)

        expect(rows[0].location).toBe('src/x.ts')
    })

    it('falls back to generic suggestion when alert.suggestion is missing', () => {
        const cqAlert: NormalizedSecurityAlert = {
            ...makeAlert({ id: 1, source: 'code-quality', packageName: 'X', ruleId: 'rule/x' }),
            suggestion: undefined,
        }
        const result: RunResult = {
            ...EMPTY_RUN_RESULT,
            alerts: [cqAlert],
        }

        const rows = collectCodeQualityFindings(result)

        expect(rows[0].suggestion).toContain('人工审查')
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

