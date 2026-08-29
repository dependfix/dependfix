/* eslint-disable max-lines -- M18.4（todo.md §M18.4 范围）测试层补强 stageAndCommit author 路径回归 + 既有 955 行；按职责不拆分 */
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Octokit } from '@octokit/rest'
import { createEmptyRunSummary, type FixAction, type NormalizedSecurityAlert, type RunResult } from '@dependfix/core'
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
    stageAndCommit,
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

    it('distinguishes root upgrade from member upgrade of the same package', () => {
        const root = [makeUpgradeAction('vite', '5.4.20', true)]
        const member = [{
            ...makeUpgradeAction('vite', '5.4.20', true),
            strategy: 'member-upgrade',
            filePath: 'packages/web/package.json',
        }]
        // 同包同版本，仅 manifest 不同 → 不同修复内容 → 指纹不同（否则成员升级被根 PR 错误 skip）
        expect(computeFixFingerprint(root)).not.toBe(computeFixFingerprint(member))
    })

    it('distinguishes failed member upgrade from failed root upgrade (fingerprint failures dimension)', () => {
        const rootFailure = [makeUpgradeAction('vite', '5.4.20', false)]
        const memberFailure = [{
            ...makeUpgradeAction('vite', '5.4.20', false),
            strategy: 'member-upgrade',
            filePath: 'packages/api/package.json',
        }]
        expect(computeFixFingerprint(rootFailure)).not.toBe(computeFixFingerprint(memberFailure))
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

    it('includes code-scanning fixes in the fingerprint', () => {
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
// stageAndCommit / ensureGitConfig (author 路径回归)
// ---------------------------------------------------------------------------

/**
 * `stageAndCommit` / `ensureGitConfig` 可选 `author` 参数回归覆盖。
 *
 * - PAT 路径（author 不传）→ 使用 `PAT_DEFAULT_COMMIT_AUTHOR`（保持 PAT 路径行为零变化）
 * - GitHub App 路径（author 传入 `{app_id}+{bot_login}[bot]`）→ 使用传入 author
 *
 * 关键回归约束（与 todo.md §M18.0 决策 2 PAT 用户行为零变化一致）：
 * - 已有 `user.name` / `user.email` 时**不**覆盖（用户/CI 上游可能预设 git config）
 *
 * **测试隔离**：本测试通过 `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1` 隔离
 * host 全局 git config（避免 host 全局 `user.name = CaoMeiYouRen` 等干扰导致
 * `git config user.name` 误判"已配置"而不设 local）。所有 execSync 都通过 `git` helper 走隔离 env。
 *
 * @see [C22 PAT 无感升级评估 §5.1 兼容性](../../../../docs/design/governance/c22-pat-backward-compat.md)
 * @see [todo.md §M18.4（测试层）](../../../../docs/plan/todo.md)
 */
describe('stageAndCommit (author 路径回归)', () => {
    const tempDirs: string[] = []
    const ISOLATED_GIT_ENV = {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
    }

    /** 隔离 host 全局 git config 的 execSync helper（避免 host 全局 user.name 干扰） */
    function git(cmd: string, cwd: string): string {
        return execSync(`git ${cmd}`, {
            cwd,
            stdio: 'pipe',
            encoding: 'utf-8',
            env: { ...process.env, ...ISOLATED_GIT_ENV },
        }).trim()
    }

    /**
     * 创建 git repo 但**不**预设 user.name / user.email（用于测 ensureGitConfig 自动设置路径）。
     * 注意：第一次 init commit 也需要 author，必须通过 `git -c user.name= -c user.email=` 注入。
     */
    function createGitRepoWithoutGitConfig(): string {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-stage-'))
        tempDirs.push(dir)
        git('init -b main', dir)
        // 第一次 init commit：注入临时 user.name/email（不会写入 repo config）
        writeFileSync(join(dir, 'README.md'), '# test\n')
        git('add .', dir)
        git('-c user.name=test -c user.email=test@example.com commit -m init', dir)
        return dir
    }

    /**
     * 创建 git repo 且**预设** user.name / user.email（用于测 ensureGitConfig 不覆盖回归）。
     */
    function createGitRepoWithGitConfig(): string {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-stage-'))
        tempDirs.push(dir)
        git('init -b main', dir)
        git('config user.email test@example.com', dir)
        git('config user.name test', dir)
        writeFileSync(join(dir, 'README.md'), '# test\n')
        git('add .', dir)
        git('commit -m init', dir)
        return dir
    }

    /** 读取当前 commit 的 author 字段（git log -1 第一个 commit） */
    function readCommitAuthor(workDir: string): { name: string, email: string } {
        const formatted = git('log -1 --format=%an%n%ae', workDir)
        const lines = formatted.split('\n')
        return { name: lines[0] ?? '', email: lines[1] ?? '' }
    }

    beforeEach(() => {
        // 在 process.env 层面设置，让 stageAndCommit 内部的 execSync 调用也走隔离 env
        // （ESM 下 vi.spyOn 模块导入不可靠；用 process.env 注入更稳）
        for (const [key, value] of Object.entries(ISOLATED_GIT_ENV)) {
            process.env[key] = value
        }
    })

    afterEach(() => {
        for (const key of Object.keys(ISOLATED_GIT_ENV)) {
            delete process.env[key]
        }
        for (const dir of tempDirs.splice(0)) {
            try {
                rmSync(dir, { recursive: true, force: true })
            } catch {
                /* ignore */
            }
        }
    })

    it('PAT 路径（author 不传）+ repo 无 config → local git config 设置成 PAT_DEFAULT_COMMIT_AUTHOR', () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'change.txt'), 'fixed\n')

        stageAndCommit('fix: dependabot', dir) // PAT 路径

        // 用 --local 验证 ensureGitConfig 设置的是 local 级别（不被 host 全局 config 干扰）
        const userName = git('config --local --get user.name', dir)
        const userEmail = git('config --local --get user.email', dir)
        expect(userName).toBe('dependfix[bot]')
        expect(userEmail).toBe('dependfix[bot]@users.noreply.github.com')
    }, 15_000)

    it('App 路径（author 传入）+ repo 无 config → local git config 设置成传入 author', () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'change.txt'), 'fixed\n')

        // 模拟 todo.md §M18.2（集成层）调用：传入 AppAuthProvider.getCommitAuthor() 动态生成的 author
        stageAndCommit('fix: dependabot', dir, {
            name: '123456[bot]',
            email: '123456+dependfix-bot[bot]@users.noreply.github.com',
        })

        const userName = git('config --local --get user.name', dir)
        const userEmail = git('config --local --get user.email', dir)
        expect(userName).toBe('123456[bot]')
        expect(userEmail).toBe('123456+dependfix-bot[bot]@users.noreply.github.com')
    }, 15_000)

    it('已有 user.name / user.email + 传入 author → 不覆盖（关键回归：传入 author 不破坏既有 config）', () => {
        const dir = createGitRepoWithGitConfig()
        writeFileSync(join(dir, 'change.txt'), 'fixed\n')

        // 即使传入 App author，已有 git config 不被覆盖
        stageAndCommit('fix: dependabot', dir, {
            name: '123456[bot]',
            email: '123456+dependfix-bot[bot]@users.noreply.github.com',
        })

        const userName = git('config --local --get user.name', dir)
        const userEmail = git('config --local --get user.email', dir)
        expect(userName).toBe('test')
        expect(userEmail).toBe('test@example.com')
    }, 15_000)

    it('完整 stageAndCommit 端到端：App author 实际生效（git log -1 看到正确 author）', () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'change.txt'), 'fixed\n')

        stageAndCommit('fix: dependabot', dir, {
            name: '123456[bot]',
            email: '123456+dependfix-bot[bot]@users.noreply.github.com',
        })

        // 验证 git commit 实际使用传入 author（不只是 git config 设置）
        const author = readCommitAuthor(dir)
        expect(author.name).toBe('123456[bot]')
        expect(author.email).toBe('123456+dependfix-bot[bot]@users.noreply.github.com')
    }, 15_000)

    it('完整 stageAndCommit 端到端：PAT 默认 author 实际生效（git log -1 看到 dependfix[bot]）', () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'change.txt'), 'fixed\n')

        stageAndCommit('fix: dependabot', dir) // PAT 路径

        const author = readCommitAuthor(dir)
        expect(author.name).toBe('dependfix[bot]')
        expect(author.email).toBe('dependfix[bot]@users.noreply.github.com')
    }, 15_000)
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
    }, 15_000)
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

    it('truncates body from the tail when exceeding GitHub 64KB limit', () => {
        const result = buildRunResult()
        // 构造大量修复告警（每行约 50-60 字节）：3000 行 → body ~150KB，远超 60KB 截断线
        result.actions = Array.from({ length: 3000 }, (_, i) => (
            makeBodyAction({
                target: `pkg-${i}`,
                fromVersion: '1.0.0',
                toVersion: `1.${i}.${i % 10}`,
            })
        ))
        result.summary.alertsFixed = 3000
        // 报告/PR 渲染需要 alerts 匹配 fixedKeys（告警级明细表）
        result.alerts = result.actions.map((a) => ({
            id: 1,
            source: 'dependabot',
            repository: 'owner/repo',
            defaultBranch: 'main',
            severity: 'high',
            packageEcosystem: 'npm',
            packageName: a.target,
            manifestPath: 'package.json',
            ruleId: 'GHSA-x',
            summary: 'x',
            htmlUrl: '',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: a.toVersion,
        } as never))

        const body = generatePRBody(result)

        // 不超过 GitHub 上限（60KB 截断线）
        expect(Buffer.byteLength(body, 'utf-8')).toBeLessThanOrEqual(60 * 1024)
        // 截断说明存在；头部摘要保留
        expect(body).toContain('Body truncated')
        expect(body).toContain('### 📊 Summary')
        // 尾部明细被截断（不会包含最后构造的包）
        expect(body).not.toContain('`pkg-2999`')
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

    it('renders member upgrades with member upgrade strategy and manifest path', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({
                target: 'vite',
                fromVersion: '^5.4.0',
                toVersion: '^5.4.20',
                strategy: 'member-upgrade',
                filePath: 'packages/web/package.json',
            }),
            // 根升级不受 filePath 影响（不追加路径后缀）
            makeBodyAction({ target: 'fast-uri', fromVersion: '2.1.0', toVersion: '3.1.5' }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('| `vite` (packages/web/package.json) | ^5.4.0 | ^5.4.20 | member upgrade | No |')
        expect(body).toContain('| `fast-uri` | 2.1.0 | 3.1.5 | direct | No |')
    })

    it('renders failed member upgrades with manifest path', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({
                target: 'vite',
                toVersion: '^5.4.20',
                success: false,
                strategy: 'member-upgrade',
                filePath: 'packages/web/package.json',
                error: 'vulnerable instance(s) remain after member upgrade',
            }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('### ⚠️ Failed Upgrades')
        expect(body).toContain('| `vite` (packages/web/package.json) | ^5.4.20 | vulnerable instance(s) remain after member upgrade |')
    })

    it('keeps root and member upgrades of the same package as separate rows', () => {
        const result = buildRunResult()
        result.actions = [
            // 根升级（无 filePath）
            makeBodyAction({ target: 'vite', fromVersion: '^5.4.0', toVersion: '^5.4.20' }),
            // 成员升级（带 filePath）
            makeBodyAction({
                target: 'vite',
                fromVersion: '^5.4.0',
                toVersion: '^5.4.20',
                strategy: 'member-upgrade',
                filePath: 'packages/web/package.json',
            }),
        ]
        const body = generatePRBody(result)

        // 两行均可见：根行不带路径、成员行带路径
        expect(body.match(/\| `vite` \|/g)).toHaveLength(1)
        expect(body).toContain('| `vite` | ^5.4.0 | ^5.4.20 | direct | No |')
        expect(body).toContain('| `vite` (packages/web/package.json) | ^5.4.0 | ^5.4.20 | member upgrade | No |')
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

        expect(body).toContain('failed \\| to parse')
    })

    it('does not double-escape pre-escaped backslash-pipe in error cells', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({
                target: 'b-pkg',
                toVersion: '2.0.0',
                success: false,
                error: 'already escaped \\| pipe',
            }),
        ]
        const body = generatePRBody(result)

        // 输入已有 `\|`：先转义反斜杠再转义管道，输出为 `\\\|`（渲染回字面 `\|`）
        expect(body).toContain('already escaped \\\\\\| pipe')
    })

    it('lists fixed alerts with GHSA/rule and severity (dependency upgrade)', () => {
        const result = buildRunResult()
        result.alerts = [
            makeBodyAlert({ packageName: 'fast-uri', ruleId: 'GHSA-f8p3-7c7w-h6x4', severity: 'high', recommendedVersion: '3.1.5' }),
            makeBodyAlert({ packageName: 'vite', ruleId: 'GHSA-xxx', severity: 'medium', recommendedVersion: '5.4.21' }),
            // 未修复的告警（无对应成功 action）不应出现在 Fixed Alerts
            makeBodyAlert({ packageName: 'lodash', ruleId: 'GHSA-yyy', severity: 'high', recommendedVersion: '4.18.1' }),
        ]
        result.actions = [
            makeBodyAction({ target: 'fast-uri', fromVersion: '3.1.0', toVersion: '3.1.5' }),
            makeBodyAction({ target: 'vite', fromVersion: '5.4.14', toVersion: '5.4.21', success: true }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('### ✅ Fixed Alerts')
        expect(body).toContain('| `fast-uri` | `GHSA-f8p3-7c7w-h6x4` | HIGH | 3.1.5 |')
        expect(body).toContain('| `vite` | `GHSA-xxx` | MEDIUM | 5.4.21 |')
        expect(body).not.toContain('GHSA-yyy')
    })

    it('lists only version-satisfied alerts; cross-major alerts are excluded (PR #28 semantics)', () => {
        // 同包多 GHSA 推荐版本各异 + versioned-override 多目标 toVersion：
        // 版本满足判定（isAlertFixedByActions）——5.x 线告警（5.4.15/5.4.21）被
        // ^5.4.21 目标满足 → 列出；6.4.3 跨线告警（无 6.x 目标）→ 不列入 Fixed Alerts
        const result = buildRunResult()
        result.alerts = [
            makeBodyAlert({ packageName: 'vite', ruleId: 'GHSA-a', severity: 'high', recommendedVersion: '5.4.15' }),
            makeBodyAlert({ packageName: 'vite', ruleId: 'GHSA-b', severity: 'high', recommendedVersion: '5.4.21' }),
            makeBodyAlert({ packageName: 'vite', ruleId: 'GHSA-c', severity: 'medium', recommendedVersion: '6.4.3' }),
        ]
        result.actions = [
            makeBodyAction({ target: 'vite', fromVersion: '', toVersion: '^5.4.21, ^8.2.1', strategy: 'versioned-override' }),
        ]
        const body = generatePRBody(result)

        // 5.x 线告警被满足 → 列出；跨线 6.4.3 不误标
        expect(body.match(/\| `vite` \| `GHSA-/g)).toHaveLength(2)
        expect(body).toContain('| `vite` | `GHSA-a` | HIGH | 5.4.15 |')
        expect(body).toContain('| `vite` | `GHSA-b` | HIGH | 5.4.21 |')
        expect(body).not.toContain('GHSA-c')
    })

    it('lists fixed code-scanning alerts (template applied) and omits noOp actions', () => {
        const result = buildRunResult()
        result.alerts = [
            makeBodyAlert({
                packageName: 'src/app.ts',
                ruleId: 'eol-last',
                severity: 'low',
                recommendedVersion: '',
                source: 'code-scanning',
                manifestPath: 'src/app.ts',
            }),
            makeBodyAlert({
                packageName: 'src/other.ts',
                ruleId: 'no-trailing-spaces',
                severity: 'low',
                recommendedVersion: '',
                source: 'code-scanning',
                manifestPath: 'src/other.ts',
            }),
        ]
        result.actions = [
            {
                type: 'code-scanning-fix',
                repository: 'owner/repo',
                target: 'eol-last',
                filePath: 'src/app.ts',
                success: true,
                noOp: false,
                durationMs: 1,
            },
            {
                type: 'code-scanning-fix',
                repository: 'owner/repo',
                target: 'no-trailing-spaces',
                filePath: 'src/other.ts',
                success: true,
                noOp: true,
                durationMs: 1,
            },
        ]
        const body = generatePRBody(result)

        expect(body).toContain('### ✅ Fixed Alerts')
        expect(body).toContain('| `src/app.ts` | `eol-last` | LOW | template applied |')
        // noOp 动作（文件已合规）不算修复：不在 Fixed Alerts 区块（仍会以
        // "无需修改"原因出现在 Code Scanning Suggestions——设计行为）
        const fixedSection = body.slice(
            body.indexOf('### ✅ Fixed Alerts'),
            body.indexOf('### 🧰 Code Scanning Suggestions', body.indexOf('### ✅ Fixed Alerts')),
        )
        expect(fixedSection).not.toContain('no-trailing-spaces')
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

    it('renders code-scanning suggestions section', () => {
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

function makeBodyAlert(overrides: Partial<NormalizedSecurityAlert>): NormalizedSecurityAlert {
    return {
        id: 1,
        source: 'dependabot',
        repository: 'owner/repo',
        defaultBranch: 'master',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName: 'fast-uri',
        manifestPath: 'pnpm-lock.yaml',
        ruleId: 'GHSA-xxx',
        summary: 'test',
        htmlUrl: '',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion: '3.1.5',
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// generatePRBody supply chain warnings
// ---------------------------------------------------------------------------

describe('generatePRBody supply chain warnings', () => {
    it('renders warning section with package and script types', () => {
        const result = {
            ...buildRunResult(),
            supplyChainWarnings: [
                { repository: 'owner/repo', packageName: 'esbuild', version: '0.25.12', scriptTypes: ['postinstall'] },
            ],
        }
        const body = generatePRBody(result)

        expect(body).toContain('### ⚠️ Supply Chain Warnings')
        expect(body).toContain('`esbuild`')
        expect(body).toContain('`0.25.12`')
        expect(body).toContain('`postinstall`')
        expect(body).toContain('owner/repo')
    })

    it('omits section when no warnings', () => {
        const body = generatePRBody(buildRunResult())

        expect(body).not.toContain('Supply Chain Warnings')
    })
})
