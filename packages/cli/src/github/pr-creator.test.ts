import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach, vi } from 'vitest'
import type { Octokit } from '@octokit/rest'
import { createEmptyRunSummary, type FixAction, type RunResult } from '@dependfix/core'
import {
    computeFixFingerprint,
    extractFingerprintFromBranch,
    computeFixAndPrPlan,
    createFixBranch,
    findDependfixOpenPR,
    closePullRequest,
    generatePRBody,
    listDependfixBranches,
    getBranchPrStatus,
    deleteRemoteBranch,
    isConfirmAnswer,
    type DependfixOpenPR,
} from './pr-creator'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUpgradeAction(target: string, toVersion: string, success: boolean): FixAction {
    return {
        type: 'dependency-upgrade',
        repository: 'owner/repo',
        target,
        fromVersion: '1.0.0',
        toVersion,
        isMajor: false,
        success,
        durationMs: 1,
    }
}

function makeRepairAction(success: boolean): FixAction {
    return {
        type: 'lockfile-repair',
        repository: 'owner/repo',
        target: 'pnpm-lock.yaml',
        success,
        durationMs: 1,
    }
}

function buildRunResult(): RunResult {
    return {
        runId: 'dependfix-abc',
        startedAt: '2026-08-02T00:00:00.000Z',
        finishedAt: '2026-08-02T00:01:00.000Z',
        config: {
            mode: 'fix-and-pr',
            severityThreshold: 'high',
            repositories: ['owner/repo'],
            dryRun: false,
            createPullRequest: true,
            maxAlertsPerRepository: 10,
            alertSource: 'github-dependabot',
        },
        summary: createEmptyRunSummary(),
        repositories: [],
        alerts: [],
        actions: [],
        errors: [],
    }
}

function mockOctokit(options?: {
    listResult?: unknown[]
    matchingRefs?: unknown[]
}): Octokit {
    return {
        rest: {
            pulls: {
                list: vi.fn().mockResolvedValue({ data: options?.listResult ?? [] }),
                update: vi.fn().mockResolvedValue({ data: {} }),
            },
            git: {
                listMatchingRefs: vi.fn().mockResolvedValue({ data: options?.matchingRefs ?? [] }),
                deleteRef: vi.fn().mockResolvedValue({ data: {} }),
            },
        },
    } as unknown as Octokit
}

// ---------------------------------------------------------------------------
// computeFixFingerprint
// ---------------------------------------------------------------------------

describe('computeFixFingerprint', () => {
    it('is deterministic for identical inputs', () => {
        const actions = [
            makeUpgradeAction('lodash', '4.17.21', true),
            makeUpgradeAction('express', '4.19.0', true),
            makeRepairAction(true),
        ]
        expect(computeFixFingerprint(actions)).toBe(computeFixFingerprint(actions))
    })

    it('is order-independent for the same fix set', () => {
        const a = [
            makeUpgradeAction('lodash', '4.17.21', true),
            makeUpgradeAction('express', '4.19.0', true),
        ]
        const b = [
            makeUpgradeAction('express', '4.19.0', true),
            makeUpgradeAction('lodash', '4.17.21', true),
        ]
        expect(computeFixFingerprint(a)).toBe(computeFixFingerprint(b))
    })

    it('changes when the upgrade set changes', () => {
        const base = [makeUpgradeAction('lodash', '4.17.21', true)]
        const added = [makeUpgradeAction('lodash', '4.17.21', true), makeUpgradeAction('express', '4.19.0', true)]
        expect(computeFixFingerprint(base)).not.toBe(computeFixFingerprint(added))
    })

    it('changes when a target version changes', () => {
        const v1 = [makeUpgradeAction('lodash', '4.17.21', true)]
        const v2 = [makeUpgradeAction('lodash', '4.17.22', true)]
        expect(computeFixFingerprint(v1)).not.toBe(computeFixFingerprint(v2))
    })

    it('includes failed upgrades in the fingerprint', () => {
        const allSuccess = [makeUpgradeAction('lodash', '4.17.21', true)]
        const withFailure = [makeUpgradeAction('lodash', '4.17.21', true), makeUpgradeAction('express', '4.19.0', false)]
        expect(computeFixFingerprint(allSuccess)).not.toBe(computeFixFingerprint(withFailure))
    })

    it('includes lockfile repair status in the fingerprint', () => {
        const repaired = [makeUpgradeAction('lodash', '4.17.21', true), makeRepairAction(true)]
        const notRepaired = [makeUpgradeAction('lodash', '4.17.21', true), makeRepairAction(false)]
        expect(computeFixFingerprint(repaired)).not.toBe(computeFixFingerprint(notRepaired))
    })

    it('ignores PR record actions (target starts with "PR #")', () => {
        const base = [makeUpgradeAction('lodash', '4.17.21', true)]
        const prRecord: FixAction = {
            type: 'dependency-upgrade',
            repository: 'owner/repo',
            target: 'PR #12 (existing)',
            toVersion: 'https://github.com/o/r/pull/12',
            success: true,
            durationMs: 0,
        }
        expect(computeFixFingerprint([...base, prRecord])).toBe(computeFixFingerprint(base))
    })

    it('returns a stable 8-char hex for empty actions', () => {
        const fp = computeFixFingerprint([])
        expect(fp).toMatch(/^[0-9a-f]{8}$/)
        expect(fp).toBe(computeFixFingerprint([]))
    })

    it('includes code-scanning fixes in the fingerprint (T303 dimension)', () => {
        const csFix: FixAction = {
            type: 'code-scanning-fix',
            repository: 'owner/repo',
            target: 'no-trailing-spaces',
            success: true,
            diff: 'removed trailing whitespace in src/foo.ts',
            durationMs: 0,
        }
        expect(computeFixFingerprint([csFix])).not.toBe(computeFixFingerprint([]))
        // 内容变化（diff 不同）→ 指纹变化
        expect(computeFixFingerprint([csFix])).not.toBe(computeFixFingerprint([{
            ...csFix,
            diff: 'removed trailing whitespace in src/bar.ts',
        }]))
        // 成功/失败 → 指纹变化
        expect(computeFixFingerprint([csFix])).not.toBe(computeFixFingerprint([{ ...csFix, success: false, error: 'no fix template' }]))
        // 排序无关
        const other: FixAction = {
            type: 'code-scanning-fix',
            repository: 'owner/repo',
            target: 'eol-last',
            success: true,
            diff: 'appended trailing newline to src/baz.ts',
            durationMs: 0,
        }
        expect(computeFixFingerprint([csFix, other])).toBe(computeFixFingerprint([other, csFix]))
    })
})

// ---------------------------------------------------------------------------
// extractFingerprintFromBranch
// ---------------------------------------------------------------------------

describe('extractFingerprintFromBranch', () => {
    it('extracts the fingerprint from a content-addressed branch', () => {
        expect(extractFingerprintFromBranch('dependfix/auto-fix-abc12345')).toBe('abc12345')
    })

    it('returns null for non-dependfix branches', () => {
        expect(extractFingerprintFromBranch('feature/foo')).toBeNull()
        expect(extractFingerprintFromBranch('master')).toBeNull()
    })

    it('returns null for prefix-only or empty fingerprint', () => {
        expect(extractFingerprintFromBranch('dependfix/auto-fix-')).toBeNull()
    })

    it('returns null for malformed fingerprint formats', () => {
        // 非 8 位 hex（如旧 runId 尾段）不匹配 → 会被 supersede
        expect(extractFingerprintFromBranch('dependfix/auto-fix-abcdefg')).toBeNull()
        expect(extractFingerprintFromBranch('dependfix/auto-fix-zzzzzzzz')).toBeNull()
        expect(extractFingerprintFromBranch('dependfix/auto-fix-ABC12345')).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// computeFixAndPrPlan
// ---------------------------------------------------------------------------

describe('computeFixAndPrPlan', () => {
    function openPR(number: number, fingerprint: string): DependfixOpenPR {
        return {
            number,
            htmlUrl: `https://github.com/o/r/pull/${number}`,
            headRef: `dependfix/auto-fix-${fingerprint}`,
        }
    }

    it('skips when an open PR has the same fingerprint', () => {
        const prs = [openPR(1, 'aaa11111')]
        const plan = computeFixAndPrPlan(prs, 'aaa11111')

        expect(plan.action).toBe('skip')
        expect(plan.sameContentPR?.number).toBe(1)
        expect(plan.supersedePRs).toEqual([])
    })

    it('plans create (supersede all) when no open PR has the same fingerprint', () => {
        const prs = [openPR(1, 'aaa11111')]
        const plan = computeFixAndPrPlan(prs, 'bbb22222')

        expect(plan.action).toBe('create')
        expect(plan.sameContentPR).toBeUndefined()
        expect(plan.supersedePRs.map((pr) => pr.number)).toEqual([1])
    })

    it('plans create with empty supersede when no dependfix PR is open', () => {
        const plan = computeFixAndPrPlan([], 'bbb22222')
        expect(plan.action).toBe('create')
        expect(plan.supersedePRs).toEqual([])
    })

    it('keeps other different-fingerprint PRs for cleanup even when skipping', () => {
        // 异常态收敛：同指纹命中时，并存的异指纹旧 PR 仍进入 supersede 清单
        const prs = [openPR(1, 'aaa11111'), openPR(2, 'ccc33333'), openPR(3, 'ddd44444')]
        const plan = computeFixAndPrPlan(prs, 'aaa11111')

        expect(plan.action).toBe('skip')
        expect(plan.sameContentPR?.number).toBe(1)
        expect(plan.supersedePRs.map((pr) => pr.number)).toEqual([2, 3])
    })

    it('treats legacy runId branches as different content (supersede)', () => {
        const legacy: DependfixOpenPR = {
            number: 9,
            htmlUrl: 'https://github.com/o/r/pull/9',
            headRef: 'dependfix/auto-fix-ab12cd',
        }
        const plan = computeFixAndPrPlan([legacy], 'aaa11111')
        expect(plan.action).toBe('create')
        expect(plan.supersedePRs.map((pr) => pr.number)).toEqual([9])
    })
})

// ---------------------------------------------------------------------------
// findDependfixOpenPR / closePullRequest
// ---------------------------------------------------------------------------

describe('findDependfixOpenPR', () => {
    it('filters open PRs by the dependfix branch prefix', async () => {
        const octokit = mockOctokit({
            listResult: [
                { number: 1, html_url: 'https://github.com/o/r/pull/1', head: { ref: 'dependfix/auto-fix-aaa11111' } },
                { number: 2, html_url: 'https://github.com/o/r/pull/2', head: { ref: 'feature/manual' } },
                { number: 3, html_url: 'https://github.com/o/r/pull/3', head: { ref: 'dependfix/auto-fix-bbb22222' } },
            ],
        })

        const result = await findDependfixOpenPR(octokit, 'o', 'r')
        expect(result.map((pr) => pr.number)).toEqual([1, 3])
        expect(result[0]).toEqual({
            number: 1,
            htmlUrl: 'https://github.com/o/r/pull/1',
            headRef: 'dependfix/auto-fix-aaa11111',
        })
    })

    it('returns empty when no dependfix PR is open', async () => {
        const octokit = mockOctokit({
            listResult: [
                { number: 2, html_url: 'https://github.com/o/r/pull/2', head: { ref: 'feature/manual' } },
            ],
        })
        await expect(findDependfixOpenPR(octokit, 'o', 'r')).resolves.toEqual([])
    })
})

describe('closePullRequest', () => {
    it('calls pulls.update with state=closed', async () => {
        const octokit = mockOctokit()
        await closePullRequest(octokit, 'owner', 'repo', 42)

        expect(octokit.rest.pulls.update).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            pull_number: 42,
            state: 'closed',
        })
    })
})

// ---------------------------------------------------------------------------
// createFixBranch (real git in temp dir)
// ---------------------------------------------------------------------------

describe('createFixBranch', () => {
    const tempDirs: string[] = []

    function createGitRepo(): string {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-branch-'))
        tempDirs.push(dir)
        execSync('git init -b main', { cwd: dir, stdio: 'pipe' })
        execSync('git config user.email test@example.com', { cwd: dir, stdio: 'pipe' })
        execSync('git config user.name test', { cwd: dir, stdio: 'pipe' })
        writeFileSync(join(dir, 'README.md'), '# test\n')
        execSync('git add . && git commit -m init', { cwd: dir, stdio: 'pipe' })
        return dir
    }

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            try {
                rmSync(dir, { recursive: true, force: true })
            } catch {
                /* ignore */
            }
        }
    })

    // Windows 并发全量跑时 git init/commit 系列命令可能超过默认 5s 超时（基线 flaky）
    it('creates a new branch with the given name', () => {
        const dir = createGitRepo()
        const result = createFixBranch('dependfix/auto-fix-abc12345', dir)

        expect(result).toEqual({ branchName: 'dependfix/auto-fix-abc12345', created: true })
        const current = execSync('git branch --show-current', { cwd: dir, encoding: 'utf-8' }).trim()
        expect(current).toBe('dependfix/auto-fix-abc12345')
    }, 15_000)

    it('switches to an existing branch instead of creating a duplicate', () => {
        const dir = createGitRepo()
        createFixBranch('dependfix/auto-fix-abc12345', dir)
        const second = createFixBranch('dependfix/auto-fix-abc12345', dir)

        expect(second.created).toBe(false)
        expect(second.branchName).toBe('dependfix/auto-fix-abc12345')
    })
})

// ---------------------------------------------------------------------------
// Branch cleanup API
// ---------------------------------------------------------------------------

describe('listDependfixBranches', () => {
    it('returns branch names under the dependfix/ prefix', async () => {
        const octokit = mockOctokit({
            matchingRefs: [
                { ref: 'refs/heads/dependfix/auto-fix-aaa11111' },
                { ref: 'refs/heads/dependfix/auto-fix-bbb22222' },
                { ref: 'refs/heads/main' },
                { ref: 'refs/heads/feature/x' },
            ],
        })

        const result = await listDependfixBranches(octokit, 'o', 'r')
        expect(result).toEqual(['dependfix/auto-fix-aaa11111', 'dependfix/auto-fix-bbb22222'])
        expect(octokit.rest.git.listMatchingRefs).toHaveBeenCalledWith({
            owner: 'o',
            repo: 'r',
            ref: 'heads/dependfix',
            per_page: 100,
        })
    })

    it('returns empty when no matching refs exist', async () => {
        const octokit = mockOctokit({ matchingRefs: [] })
        await expect(listDependfixBranches(octokit, 'o', 'r')).resolves.toEqual([])
    })
})

describe('getBranchPrStatus', () => {
    it('queries with head match and updated sort', async () => {
        const octokit = mockOctokit({ listResult: [] })
        await getBranchPrStatus(octokit, 'o', 'r', 'dependfix/auto-fix-aaa11111')
        expect(octokit.rest.pulls.list).toHaveBeenCalledWith({
            owner: 'o',
            repo: 'r',
            head: 'o:dependfix/auto-fix-aaa11111',
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 1,
        })
    })

    it('reports merged=true for a merged PR', async () => {
        const octokit = mockOctokit({
            listResult: [
                {
                    number: 7,
                    state: 'closed',
                    merged_at: '2026-08-01T00:00:00Z',
                    head: { ref: 'dependfix/auto-fix-aaa11111' },
                },
            ],
        })
        const status = await getBranchPrStatus(octokit, 'o', 'r', 'dependfix/auto-fix-aaa11111')
        expect(status).toEqual({
            branch: 'dependfix/auto-fix-aaa11111',
            prNumber: 7,
            merged: true,
            closed: true,
        })
    })

    it('reports closed-but-not-merged for a closed PR', async () => {
        const octokit = mockOctokit({
            listResult: [
                {
                    number: 8,
                    state: 'closed',
                    merged_at: null,
                    head: { ref: 'dependfix/auto-fix-bbb22222' },
                },
            ],
        })
        const status = await getBranchPrStatus(octokit, 'o', 'r', 'dependfix/auto-fix-bbb22222')
        expect(status).toEqual({
            branch: 'dependfix/auto-fix-bbb22222',
            prNumber: 8,
            merged: false,
            closed: true,
        })
    })

    it('reports open for an open PR', async () => {
        const octokit = mockOctokit({
            listResult: [
                {
                    number: 9,
                    state: 'open',
                    merged_at: null,
                    head: { ref: 'dependfix/auto-fix-ccc33333' },
                },
            ],
        })
        const status = await getBranchPrStatus(octokit, 'o', 'r', 'dependfix/auto-fix-ccc33333')
        expect(status.merged).toBe(false)
        expect(status.closed).toBe(false)
        expect(status.prNumber).toBe(9)
    })

    it('reports no PR when the branch has no PR record', async () => {
        const octokit = mockOctokit({ listResult: [] })
        const status = await getBranchPrStatus(octokit, 'o', 'r', 'dependfix/auto-fix-aaa11111')
        expect(status).toEqual({
            branch: 'dependfix/auto-fix-aaa11111',
            prNumber: null,
            merged: false,
            closed: false,
        })
    })
})

describe('deleteRemoteBranch', () => {
    it('calls git.deleteRef with the heads ref', async () => {
        const octokit = mockOctokit()
        await deleteRemoteBranch(octokit, 'owner', 'repo', 'dependfix/auto-fix-aaa11111')

        expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            ref: 'heads/dependfix/auto-fix-aaa11111',
        })
    })
})

describe('isConfirmAnswer', () => {
    it('accepts y/yes in any case', () => {
        expect(isConfirmAnswer('y')).toBe(true)
        expect(isConfirmAnswer('yes')).toBe(true)
        expect(isConfirmAnswer('Y')).toBe(true)
        expect(isConfirmAnswer('YES')).toBe(true)
        expect(isConfirmAnswer('  yes  ')).toBe(true)
    })

    it('rejects empty, n/no and arbitrary input', () => {
        expect(isConfirmAnswer('')).toBe(false)
        expect(isConfirmAnswer('n')).toBe(false)
        expect(isConfirmAnswer('no')).toBe(false)
        expect(isConfirmAnswer('maybe')).toBe(false)
        expect(isConfirmAnswer('yes please')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// generatePRBody
// ---------------------------------------------------------------------------

describe('generatePRBody', () => {
    it('includes Supersedes declaration when superseded numbers are given', () => {
        const body = generatePRBody(buildRunResult(), [12, 15])
        expect(body).toContain('**Supersedes**: #12, #15')
    })

    it('omits Supersedes when no superseded numbers are given', () => {
        const body = generatePRBody(buildRunResult())
        expect(body).not.toContain('Supersedes')
    })

    it('aggregates duplicate packages into a single upgraded row (from = earliest, to = latest)', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({ target: 'vite', fromVersion: '5.4.20', toVersion: '6.4.3', isMajor: true }),
            makeBodyAction({ target: 'vite', fromVersion: '6.4.3', toVersion: '8.2.1', isMajor: true }),
            makeBodyAction({ target: 'fast-uri', fromVersion: '2.1.0', toVersion: '3.1.5' }),
        ]
        const body = generatePRBody(result)

        // vite 只出现一次，from 为最早起点、to 为最新终点
        expect(body.match(/\| `vite` \|/g)).toHaveLength(1)
        expect(body).toContain('| `vite` | 5.4.20 | 8.2.1 | direct | ⚠️ Yes |')
        expect(body).toContain('| `fast-uri` | 2.1.0 | 3.1.5 | direct | No |')
    })

    it('excludes PR skip pseudo-actions from the upgraded list', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({ target: 'PR #12 (existing)', success: true }),
            makeBodyAction({ target: 'lodash', fromVersion: '4.17.20', toVersion: '4.17.21' }),
        ]
        const body = generatePRBody(result)

        expect(body).not.toContain('PR #12')
        expect(body).toContain('| `lodash` | 4.17.20 | 4.17.21 |')
    })

    it('keeps same package across repositories as separate rows with repository column', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({ repository: 'owner/repo-a', target: 'lodash', fromVersion: '4.17.20', toVersion: '4.17.21' }),
            makeBodyAction({ repository: 'owner/repo-b', target: 'lodash', fromVersion: '4.17.19', toVersion: '4.17.21' }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('| Repository | Package | From | To | Strategy | Major |')
        expect(body.match(/\| `lodash` \|/g)).toHaveLength(2)
        expect(body).toContain('| owner/repo-a | `lodash` | 4.17.20 | 4.17.21 | direct | No |')
        expect(body).toContain('| owner/repo-b | `lodash` | 4.17.19 | 4.17.21 | direct | No |')
    })

    it('renders failed upgrades with package, target version and error, aggregated per package', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({ target: 'b-pkg', toVersion: '2.0.0', success: false, error: 'mock upgrade failure' }),
            makeBodyAction({ target: 'b-pkg', toVersion: '2.0.0', success: false, error: 'lint failed after upgrade; per-package verification failed, changes rolled back' }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('### ⚠️ Failed Upgrades')
        // 聚合后 b-pkg 只出现一次，error 取最后一条
        expect(body.match(/\| `b-pkg` \|/g)).toHaveLength(1)
        expect(body).toContain('| `b-pkg` | 2.0.0 | lint failed after upgrade; per-package verification failed, changes rolled back |')
    })

    it('marks pnpm overrides strategy in the upgraded table', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({ target: 'fast-uri', fromVersion: '2.1.0', toVersion: '3.1.5', strategy: 'override' }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('| `fast-uri` | 2.1.0 | 3.1.5 | pnpm overrides | No |')
    })

    it('escapes pipe and newlines in failure error cells', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({
                target: 'b-pkg',
                toVersion: '2.0.0',
                success: false,
                error: 'resolution failed\nfailed | to parse',
            }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('| `b-pkg` | 2.0.0 | resolution failed failed \\| to parse |')
        expect(body).not.toContain('\nfailed | to parse')
    })

    it('excludes bare PR #N pseudo-actions (fingerprint-consistent filter)', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({ target: 'PR #12', success: true, toVersion: 'https://github.com/foo/bar/pull/12' }),
        ]
        const body = generatePRBody(result)

        expect(body).not.toContain('PR #12')
        expect(body).not.toContain('Upgraded Dependencies')
    })

    it('flags major when any merged action of the package is major', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({ target: 'vite', fromVersion: '5.4.20', toVersion: '6.4.3', isMajor: true }),
            makeBodyAction({ target: 'vite', fromVersion: '6.4.3', toVersion: '6.4.4', isMajor: false }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('| `vite` | 5.4.20 | 6.4.4 | direct | ⚠️ Yes |')
    })

    it('renders code-scanning suggestions section (T304)', () => {
        const result = buildRunResult()
        result.alerts = [{
            id: 2,
            source: 'code-scanning',
            repository: 'owner/repo',
            defaultBranch: 'main',
            severity: 'high',
            packageEcosystem: 'code-scanning',
            packageName: 'SQL injection',
            manifestPath: 'src/db.ts',
            ruleId: 'js/sql-injection',
            summary: 'This query depends on a user-provided value.',
            htmlUrl: 'https://github.com/o/r/security/code-scanning/2',
            fixable: false,
            fixStrategy: null,
            recommendedVersion: '',
            alertClass: 'suggested',
            startLine: 42,
            suggestion: '使用参数化查询',
        }]
        const body = generatePRBody(result)

        expect(body).toContain('### 🧰 Code Scanning Suggestions')
        expect(body).toContain('| `js/sql-injection` | `src/db.ts:42` | B 类建议规则（需人工判断） | 使用参数化查询 |')
    })

    it('omits suggestions section when no unfixed code-scanning alerts exist', () => {
        const body = generatePRBody(buildRunResult())
        expect(body).not.toContain('Code Scanning Suggestions')
    })
})

function makeBodyAction(overrides: Partial<FixAction>): FixAction {
    return {
        type: 'dependency-upgrade',
        repository: 'owner/repo',
        target: 'pkg',
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        isMajor: false,
        success: true,
        ...overrides,
    }
}
