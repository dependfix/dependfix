import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_RESULT, makeAction, makeAlert, makeError } from './report.test-helpers'
import {
    generateJsonReport,
    generateMarkdownReport,
    type FixAction,
    type PrCheckWatchReport,
    type RepositoryResult,
} from './index'

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

    it('renders Check Attribution section from prCheckWatch attempts', () => {
        const prCheckWatch: PrCheckWatchReport = {
            attempts: [
                {
                    pr: { number: 7, htmlUrl: 'https://github.com/foo/bar/pull/7' },
                    state: 'failed',
                    attribution: 'self_caused',
                    closed: false,
                    commented: true,
                    polls: 2,
                    durationMs: 1500,
                    failedChecks: [
                        { name: 'Test', url: 'https://ci.example/test', attribution: 'self_caused' },
                        { name: 'Coverage | unit', attribution: 'self_caused' },
                        { name: 'A`b', attribution: 'unknown' },
                    ],
                },
                {
                    pr: { number: 8, htmlUrl: 'https://github.com/foo/bar/pull/8' },
                    state: 'timeout',
                    closed: false,
                    commented: true,
                    polls: 3,
                    durationMs: 900_000,
                },
            ],
            runBudgetExhausted: true,
        }
        const md = generateMarkdownReport({ ...EMPTY_RUN_RESULT, prCheckWatch })

        expect(md).toContain('## Check Attribution')
        expect(md).toContain('归因计数：`self_caused` 2')
        expect(md).toContain('| #7 | `failed` | `self_caused` |')
        expect(md).toContain('`Test` (self_caused)')
        // 作业名中的 `|` 必须转义、反引号必须替换，不能破坏表格 / 代码段
        expect(md).toContain('`Coverage \\| unit` (self_caused)')
        expect(md).toContain('`Ab` (unknown)')
        expect(md).toContain('| #8 | `timeout` | — | — |')
        expect(md).toContain('check 等待总预算已耗尽')
    })

    it('omits Check Attribution section when no watch attempts', () => {
        expect(generateMarkdownReport(EMPTY_RUN_RESULT)).not.toContain('Check Attribution')
    })

    it('omits Check Attribution section when every attempt passed', () => {
        const md = generateMarkdownReport({
            ...EMPTY_RUN_RESULT,
            prCheckWatch: {
                attempts: [{
                    pr: { number: 7, htmlUrl: 'https://github.com/foo/bar/pull/7' },
                    state: 'passed',
                    closed: false,
                    commented: false,
                    polls: 1,
                    durationMs: 10,
                }],
                runBudgetExhausted: false,
            },
        })
        expect(md).not.toContain('Check Attribution')
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

    it('renders skipped/truncated breakdown and unfixed total', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: {
                ...EMPTY_RUN_RESULT.summary,
                alertsFound: 20,
                alertsFixed: 0,
                alertsUnfixed: 20,
                alertsConverged: 0,
                alertsSkipped: 4,
                alertsSkippedByReason: { 'cross-major': 4 },
                alertsTruncated: 6,
                alertsTruncatedBySeverity: { critical: 2, high: 4 },
            },
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('## Skipped & Truncated')
        expect(md).toContain('**Unfixed**: 20 / 20 evaluated alerts; 6 truncated before analysis (not evaluated).')
        expect(md).toContain('| Truncated: Critical | 2 |')
        expect(md).toContain('| Truncated: High | 4 |')
        expect(md).toContain('| Skipped: Cross-major / manual review | 4 |')
        expect(md).toContain('| Failed / other not fixed | 16 |')
    })

    it('renders repeated failure attempts with status labels', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            attemptTracking: [
                { repository: 'owner/repo', packageName: 'lodash', key: 'aaaaaaaaaaaaaaaa', attempt: 1, status: 'attempt' as const },
                { repository: 'owner/repo', packageName: 'express', key: 'bbbbbbbbbbbbbbbb', attempt: 3, status: 'skipped' as const },
                { repository: 'owner/repo', packageName: 'vite', key: 'cccccccccccccccc', attempt: 3, status: 'forced' as const },
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('## Repeated Failure Attempts')
        expect(md).toContain('| owner/repo | `lodash` | `aaaaaaaaaaaaaaaa` | 1 | attempt |')
        expect(md).toContain('| owner/repo | `express` | `bbbbbbbbbbbbbbbb` | 3 | skipped (attempt limit) |')
        expect(md).toContain('| owner/repo | `vite` | `cccccccccccccccc` | 3 | forced (manual retry) |')
    })

    it('omits the attempts section when no records exist', () => {
        expect(generateMarkdownReport(EMPTY_RUN_RESULT)).not.toContain('Repeated Failure Attempts')
    })

    it('json report carries attemptTracking verbatim', () => {
        const records = [
            { repository: 'owner/repo', packageName: 'lodash', key: 'aaaaaaaaaaaaaaaa', attempt: 3, status: 'skipped' as const },
        ]
        const json = JSON.parse(generateJsonReport({ ...EMPTY_RUN_RESULT, attemptTracking: records }))
        expect(json.attemptTracking).toEqual(records)
        // 旧结果（无该字段）序列化时不出现多余键
        expect(JSON.parse(generateJsonReport(EMPTY_RUN_RESULT))).not.toHaveProperty('attemptTracking')
    })

    it('falls back to other for old summary without grouped fields', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: {
                ...EMPTY_RUN_RESULT.summary,
                alertsFound: 3,
                alertsSkipped: 2,
                alertsTruncated: 1,
                alertsSkippedByReason: {},
                alertsTruncatedBySeverity: {},
            },
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('| Skipped: Other / unclassified | 2 |')
        expect(md).toContain('| Truncated: Other / unclassified | 1 |')
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

    it('renders AI Usage section when aiUsage present', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            aiUsage: { calls: 3, inputTokens: 1200, outputTokens: 340, totalTokens: 1540, estimatedCostUsd: 0.000312 },
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## AI Usage')
        expect(md).toContain('3')
        expect(md).toContain('1,200')
        expect(md).toContain('340')
        expect(md).toContain('$0.0003')
    })

    it('omits AI Usage section when aiUsage absent', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## AI Usage')
    })

    it('renders AI Usage without cost when model has no price data', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            aiUsage: { calls: 1, inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: undefined },
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## AI Usage')
        expect(md).toContain('成本未估算')
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

    it('renders placeholder for empty from version in key actions', () => {
        // 版本化 override 的历史动作 fromVersion 可能为空串：渲染为 — 而非空白（`??` 不处理空串）
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [makeAction({ fromVersion: '', toVersion: '^5.4.21', strategy: 'versioned-override' })],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('— → ^5.4.21')
    })

    it('shows member upgrade manifest path in action details', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [makeAction({
                fromVersion: '^5.4.0',
                toVersion: '^5.4.20',
                strategy: 'member-upgrade',
                filePath: 'packages/web/package.json',
            })],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('^5.4.0 → ^5.4.20 (packages/web/package.json)')
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
        // 反向断言：非既有失败不得被标注为「既有失败」（保证「显式区分」两侧都锁住）
        expect(md).not.toContain('既有失败（修复前即红，未归因本次改动）')
    })

    it('verification action 标记 preExisting（既有失败）→ 报告显式区分「本次引入」与「基线已存在」', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [
                makeAction({
                    type: 'verification',
                    target: 'pnpm test',
                    success: false,
                    error: 'exit code 1',
                    preExisting: true,
                    durationMs: 500,
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('既有失败（修复前即红，未归因本次改动）')
    })

    it('verification action 逐条标注命令来源（source=default / repo-config / ci-mirror）', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [
                makeAction({ type: 'verification', target: 'pnpm lint', success: true, commandSource: 'default' }),
                makeAction({ type: 'verification', target: 'pnpm test', success: true, commandSource: 'repo-config' }),
                makeAction({ type: 'verification', target: 'pnpm run coverage', success: true, commandSource: 'ci-mirror' }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('source=default')
        expect(md).toContain('source=repo-config')
        expect(md).toContain('source=ci-mirror')
    })
})

describe('generateMarkdownReport supply chain warnings', () => {
    it('renders warning section with package name and script types', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            supplyChainWarnings: [
                { repository: 'owner/repo', packageName: 'esbuild', version: '0.25.12', scriptTypes: ['postinstall'] },
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('## ⚠️ Supply Chain Warnings')
        expect(md).toContain('`esbuild`')
        expect(md).toContain('`0.25.12`')
        expect(md).toContain('`postinstall`')
        expect(md).toContain('owner/repo')
    })

    it('renders multiple script types comma separated', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            supplyChainWarnings: [
                { repository: 'owner/repo', packageName: 'better-sqlite3', version: '12.11.1', scriptTypes: ['install', 'preinstall'] },
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('`install`, `preinstall`')
    })

    it('omits section when no warnings', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)

        expect(md).not.toContain('Supply Chain Warnings')
    })

    it('serializes warnings into json report', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            supplyChainWarnings: [
                { repository: 'owner/repo', packageName: 'esbuild', version: '0.25.12', scriptTypes: ['postinstall'] },
            ],
        }
        const json = JSON.parse(generateJsonReport(result)) as { supplyChainWarnings?: unknown[] }

        expect(json.supplyChainWarnings).toHaveLength(1)
        expect(json.supplyChainWarnings?.[0]).toMatchObject({ packageName: 'esbuild', scriptTypes: ['postinstall'] })
    })

    it('renders Alerts Disabled section with repository/source/message when alertsDisabled present', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            alertsDisabled: [
                { repository: 'owner/repo', source: 'dependabot', message: 'Dependabot alerts are disabled for this repository.' },
            ],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## Alerts Disabled')
        expect(md).toContain('owner/repo')
        expect(md).toContain('dependabot')
        expect(md).toContain('Dependabot alerts are disabled for this repository.')
    })

    it('renders code-scanning disabled record with source-agnostic enablement guidance', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            alertsDisabled: [
                {
                    repository: 'owner/repo',
                    source: 'code-scanning',
                    message: 'Advanced Security must be enabled for this repository to use code scanning.',
                },
            ],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## Alerts Disabled')
        expect(md).toContain('code-scanning')
        // 正向锁定指引句本身（不依赖 message 列，避免被 fixture 字符串「顺带命中」）
        expect(md).toContain('开启方式：仓库 Settings → Code security 中启用对应功能')
        // 反向：指引不得只写 Dependabot（否则 code-scanning 记录被误导）
        expect(md).not.toContain('开启方式：仓库 Settings → Code security → Dependabot alerts。')
    })

    it('renders Alerts disabled count in summary table', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: { ...EMPTY_RUN_RESULT.summary, reposWithAlertsDisabled: 3 },
        }
        const md = generateMarkdownReport(result)
        // 精确断言行内容（避免 toContain('3') 被日期字符污染恒真）
        expect(md).toContain('| Alerts disabled (repos) | 3 |')
    })

    it('omits Alerts Disabled section when no alertsDisabled records', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Alerts Disabled')
    })

    it('omits Alerts Disabled section when alertsDisabled is empty array', () => {
        const result = { ...EMPTY_RUN_RESULT, alertsDisabled: [] }
        const md = generateMarkdownReport(result)
        expect(md).not.toContain('## Alerts Disabled')
    })
})

// ---------------------------------------------------------------------------
// Code Quality findings 报告段（独立于 Code Scanning Suggestions）
// ---------------------------------------------------------------------------

describe('generateMarkdownReport code quality findings', () => {
    it('renders Code Quality Findings section with rule/location/suggestion columns', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            config: { ...EMPTY_RUN_RESULT.config, codeQualityEnabled: true },
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
        const md = generateMarkdownReport(result)

        expect(md).toContain('## Code Quality Findings')
        expect(md).toContain('`java/useless-null-check`')
        expect(md).toContain('`src/UselessNullCheck.java:9`')
        expect(md).toContain('Checking whether an expression is null...')
    })

    it('omits Code Quality Findings section when no cq alerts exist', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Code Quality Findings')
    })

    it('updates header alert source label when codeQualityEnabled is true', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            config: {
                ...EMPTY_RUN_RESULT.config,
                codeQualityEnabled: true,
                codeScanningEnabled: true,
            },
        }
        const md = generateMarkdownReport(result)
        // header 组合展示
        expect(md).toContain('GitHub Dependabot + Code Scanning API + Code Quality API')
    })
})

describe('generateMarkdownReport dependency paths', () => {
    it('renders dependency paths section when alerts have dependencyPath', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [
                { repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1, fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 100 },
            ],
            alerts: [
                makeAlert({
                    packageName: 'vite',
                    dependencyPath: ['docs>vitepress>@vitejs/plugin-vue>vite'],
                }),
            ],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('**Dependency paths:**')
        expect(md).toContain('`vite`')
        expect(md).toContain('docs>vitepress>@vitejs/plugin-vue>vite')
    })

    it('renders multiple dependency paths for one alert', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [
                { repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1, fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 100 },
            ],
            alerts: [
                makeAlert({
                    packageName: 'vite',
                    dependencyPath: ['a>b>vite', 'c>vite'],
                }),
            ],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('a>b>vite')
        expect(md).toContain('c>vite')
    })

    it('omits dependency paths section when no alerts have dependencyPath', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            repositories: [
                { repository: 'owner/repo', defaultBranch: 'main', alertsCount: 1, fixable: 1, fixed: 0, failed: 0, lockfileRepaired: false, durationMs: 100 },
            ],
            alerts: [makeAlert()],
        }
        const md = generateMarkdownReport(result)
        expect(md).not.toContain('**Dependency paths:**')
    })
})

describe('generateMarkdownReport family lockstep', () => {
    it('renders the family lockstep section when a family action is present', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [
                makeAction({
                    target: 'vitest',
                    family: {
                        id: 'vitest',
                        members: ['vitest', '@vitest/coverage-v8'],
                        skipped: ['@vitest/ui'],
                    },
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('## Family Lockstep')
        expect(md).toContain('| `vitest` | `vitest`, `@vitest/coverage-v8` | `@vitest/ui` |')
    })

    it('renders the repository column for multi-repository runs', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [
                makeAction({
                    target: 'vitest',
                    family: { id: 'vitest', members: ['vitest'], skipped: [] },
                }),
                makeAction({
                    repository: 'owner/other',
                    target: 'jest',
                    family: { id: 'jest', members: ['jest', '@types/jest'], skipped: [] },
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('| Repository | Family | Members | Skipped |')
        expect(md).toContain('| owner/other | `jest` | `jest`, `@types/jest` | — |')
        expect(md).toContain('| owner/repo | `vitest` | `vitest` | — |')
    })

    it('renders an em dash when there are no skipped members', () => {
        const result = {
            ...EMPTY_RUN_RESULT,
            actions: [
                makeAction({
                    target: 'vitest',
                    family: { id: 'vitest', members: ['vitest', '@vitest/coverage-v8'], skipped: [] },
                }),
            ],
        }
        const md = generateMarkdownReport(result)

        expect(md).toContain('| `vitest` | `vitest`, `@vitest/coverage-v8` | — |')
    })

    it('omits the section when no action carries family information', () => {
        const md = generateMarkdownReport({ ...EMPTY_RUN_RESULT, actions: [makeAction({})] })
        expect(md).not.toContain('## Family Lockstep')
    })
})
