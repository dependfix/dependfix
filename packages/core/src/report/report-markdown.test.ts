import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_RESULT, makeAction, makeAlert, makeError } from './report.test-helpers'
import { generateMarkdownReport, type FixAction, type RepositoryResult } from './index'

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
    })
})
