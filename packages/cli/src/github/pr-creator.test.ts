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
}): Octokit {
    return {
        rest: {
            pulls: {
                list: vi.fn().mockResolvedValue({ data: options?.listResult ?? [] }),
                update: vi.fn().mockResolvedValue({ data: {} }),
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

    it('creates a new branch with the given name', () => {
        const dir = createGitRepo()
        const result = createFixBranch('dependfix/auto-fix-abc12345', dir)

        expect(result).toEqual({ branchName: 'dependfix/auto-fix-abc12345', created: true })
        const current = execSync('git branch --show-current', { cwd: dir, encoding: 'utf-8' }).trim()
        expect(current).toBe('dependfix/auto-fix-abc12345')
    })

    it('switches to an existing branch instead of creating a duplicate', () => {
        const dir = createGitRepo()
        createFixBranch('dependfix/auto-fix-abc12345', dir)
        const second = createFixBranch('dependfix/auto-fix-abc12345', dir)

        expect(second.created).toBe(false)
        expect(second.branchName).toBe('dependfix/auto-fix-abc12345')
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
})
