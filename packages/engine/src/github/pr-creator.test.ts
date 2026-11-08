/* eslint-disable max-lines -- 测试层补强 stageAndCommit author / 签名 / hooks 隔离路径回归 + 既有 955 行；按职责不拆分（范围见 docs/plan/archive/todo-archive-phases-m18.md §M18.4） */
import { execFileSync, execSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Octokit } from '@octokit/rest'
import { createEmptyRunSummary, type CiAlignmentRecord, type FixAction, type NormalizedSecurityAlert, type RunResult } from '@dependfix/core'
import {
    computeFixFingerprint,
    extractFingerprintFromBranch,
    computeFixAndPrPlan,
    createFixBranch,
    findDependfixOpenPR,
    closePullRequest,
    commentOnPullRequest,
    addLabelToPullRequest,
    generatePRBody,
    listDependfixBranches,
    getBranchPrStatus,
    deleteRemoteBranch,
    isConfirmAnswer,
    stageAndCommit,
    createPullRequest,
    type DependfixOpenPR,
} from './pr-creator'
import { CommitScopeError } from './commit-scope'

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
            issues: {
                createComment: vi.fn().mockResolvedValue({ data: {} }),
                addLabels: vi.fn().mockResolvedValue({ data: {} }),
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
// commentOnPullRequest / addLabelToPullRequest（docs/plan/archive/todo-archive-phases-m19-m21.md §M19.3 重复 PR 评论 + label）
// ---------------------------------------------------------------------------

describe('commentOnPullRequest', () => {
    it('calls issues.createComment with the provided body', async () => {
        const octokit = mockOctokit()
        await commentOnPullRequest(octokit, 'owner', 'repo', 42, 'duplicate notice body')

        expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            issue_number: 42,
            body: 'duplicate notice body',
        })
    })

    it('propagates errors from the API', async () => {
        const octokit = mockOctokit()
        vi.mocked(octokit.rest.issues.createComment).mockRejectedValueOnce(new Error('403 Forbidden'))

        await expect(
            commentOnPullRequest(octokit, 'owner', 'repo', 42, 'body'),
        ).rejects.toThrow('403 Forbidden')
    })
})

describe('addLabelToPullRequest', () => {
    it('calls issues.addLabels with the provided labels', async () => {
        const octokit = mockOctokit()
        await addLabelToPullRequest(octokit, 'owner', 'repo', 42, ['duplicate'])

        expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            issue_number: 42,
            labels: ['duplicate'],
        })
    })

    it('supports multiple labels', async () => {
        const octokit = mockOctokit()
        await addLabelToPullRequest(octokit, 'owner', 'repo', 42, ['duplicate', 'auto-fix'])

        expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            issue_number: 42,
            labels: ['duplicate', 'auto-fix'],
        })
    })

    it('propagates errors from the API', async () => {
        const octokit = mockOctokit()
        vi.mocked(octokit.rest.issues.addLabels).mockRejectedValueOnce(new Error('403 Forbidden'))

        await expect(
            addLabelToPullRequest(octokit, 'owner', 'repo', 42, ['duplicate']),
        ).rejects.toThrow('403 Forbidden')
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
 * 关键回归约束（与 docs/plan/archive/todo-archive-phases-m18.md §M18.0 决策 2 PAT 用户行为零变化一致）：
 * - 已有 `user.name` / `user.email` 时**不**覆盖（用户/CI 上游可能预设 git config）
 *
 * **测试隔离**：本测试通过 `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_NOSYSTEM=1` 隔离
 * host 全局 git config（避免 host 全局 `user.name = CaoMeiYouRen` 等干扰导致
 * `git config user.name` 误判"已配置"而不设 local）。所有 execSync 都通过 `git` helper 走隔离 env。
 *
 * @see [C22 PAT 无感升级评估 §5.1 兼容性](../../../../docs/design/governance/c22-pat-backward-compat.md)
 * @see [docs/plan/archive/todo-archive-phases-m18.md §M18.4（测试层）](../../../../docs/plan/archive/todo-archive-phases-m18.md)
 */
describe('stageAndCommit 回归（author / 签名 / hooks 隔离）', () => {
    const tempDirs: string[] = []

    /** execSync helper for git command in test tempDir（不屏蔽 host global，避免 `git init` 抛 `bad config line 1 in file /dev/null`） */
    function git(cmd: string, cwd: string): string {
        try {
            return execSync(`git ${cmd}`, {
                cwd,
                stdio: 'pipe',
                encoding: 'utf-8',
            }).trim()
        } catch {
            // `git config --local --get <key>` 在 local 没设时 exit 1（抛错）—— 返回空字符串便于测试断言
            return ''
        }
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
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixture" }\n')
        git('add .', dir)
        // 显式关签名：本仓库下有用例把 host 全局 `commit.gpgsign=true` + 不可用 gpg.program 注入，
        // 夹具的初始提交不能被它带崩（否则工作区停在「已暂存未提交」，后续判定口径失真）
        git('-c user.name=test -c user.email=test@example.com -c commit.gpgsign=false commit -m init', dir)
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
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixture" }\n')
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
        // 注：早期测试曾用 ISOLATED_GIT_ENV (GIT_CONFIG_GLOBAL=/dev/null) 屏蔽 host 全局，
        // 但 `/dev/null` 不是合法 git config 文件 → `git init` 抛 `bad config line 1 in file /dev/null`。
        // 后改用 stageAndCommit 内部 `-c user.name=X -c user.email=Y` 显式传，
        // 强制 commit author 用传入值（lookup order 中最高优先），无需屏蔽 host 全局。
    })

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            try {
                rmSync(dir, { recursive: true, force: true })
            } catch {
                /* ignore */
            }
        }
    })

    it('PAT 路径（author 不传）+ repo 无 config → local git config 设置成 PAT_DEFAULT_COMMIT_AUTHOR', async () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        await stageAndCommit('fix: dependabot', dir) // PAT 路径

        // 用 --local 验证 ensureGitConfig 设置的是 local 级别（不被 host 全局 config 干扰）
        const userName = git('config --local --get user.name', dir)
        const userEmail = git('config --local --get user.email', dir)
        expect(userName).toBe('dependfix[bot]')
        expect(userEmail).toBe('dependfix[bot]@users.noreply.github.com')
    }, 15_000)

    it('App 路径（author 传入）+ repo 无 config → local git config 设置成传入 author', async () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        // 模拟 docs/plan/archive/todo-archive-phases-m18.md §M18.2（集成层）调用：传入 AppAuthProvider.getCommitAuthor() 动态生成的 author
        await stageAndCommit('fix: dependabot', dir, {
            name: '123456[bot]',
            email: '123456+dependfix-bot[bot]@users.noreply.github.com',
        })

        const userName = git('config --local --get user.name', dir)
        const userEmail = git('config --local --get user.email', dir)
        expect(userName).toBe('123456[bot]')
        expect(userEmail).toBe('123456+dependfix-bot[bot]@users.noreply.github.com')
    }, 15_000)

    it('已有 user.name / user.email + 传入 author → 不覆盖（关键回归：传入 author 不破坏既有 config）', async () => {
        const dir = createGitRepoWithGitConfig()
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        // 即使传入 App author，已有 git config 不被覆盖
        await stageAndCommit('fix: dependabot', dir, {
            name: '123456[bot]',
            email: '123456+dependfix-bot[bot]@users.noreply.github.com',
        })

        const userName = git('config --local --get user.name', dir)
        const userEmail = git('config --local --get user.email', dir)
        expect(userName).toBe('test')
        expect(userEmail).toBe('test@example.com')
    }, 15_000)

    it('完整 stageAndCommit 端到端：App author 实际生效（git log -1 看到正确 author）', async () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        await stageAndCommit('fix: dependabot', dir, {
            name: '123456[bot]',
            email: '123456+dependfix-bot[bot]@users.noreply.github.com',
        })

        // 验证 git commit 实际使用传入 author（不只是 git config 设置）
        const author = readCommitAuthor(dir)
        expect(author.name).toBe('123456[bot]')
        expect(author.email).toBe('123456+dependfix-bot[bot]@users.noreply.github.com')
    }, 15_000)

    it('完整 stageAndCommit 端到端：PAT 默认 author 实际生效（git log -1 看到 dependfix[bot]）', async () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        await stageAndCommit('fix: dependabot', dir) // PAT 路径

        const author = readCommitAuthor(dir)
        expect(author.name).toBe('dependfix[bot]')
        expect(author.email).toBe('dependfix[bot]@users.noreply.github.com')
    }, 15_000)

    /**
     * 回归：stageAndCommit 显式传 `-c user.name=X -c user.email=Y` 保证 commit author
     * 用传入值，不受 host 全局 user.name 污染。
     *
     * 修复前：`git config user.name` 查询会查到 host 全局 `CaoMeiYouRen`，
     * `ensureGitConfig.hasName=true` → 不 set local config → `git commit` 用 host 全局 author
     * → 破坏 PAT 路径"commit author 硬编码 dependfix[bot]"承诺 + App 路径
     * `{app_id}+{bot_login}[bot]` 协议。
     *
     * 修复后：`stageAndCommit` 显式传 `-c user.name=X -c user.email=Y`，在 `git commit` lookup
     * order（env → `-c` config → local → global → system）中最高优先，**强制** commit author
     * 用传入值，与 host 全局 config 无关。
     */
    it('stageAndCommit 显式 -c user.name -c user.email 覆盖 host 全局 user.name', async () => {
        // 场景：worker 创建 tempDir + git init，host 全局有 user.name=CaoMeiYouRen（不屏蔽）
        const dir = createGitRepoWithoutGitConfig()
        // 模拟 host 全局有 user.name（在 local 写入等效——git commit lookup order：local 优先）
        git('config user.name host-global-user', dir)
        git('config user.email host-global@example.com', dir)
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        await stageAndCommit('fix: dependabot', dir, {
            name: '123456[bot]',
            email: '123456+dependfix-bot[bot]@users.noreply.github.com',
        })

        // 验证 commit author 用传入值（不被 host-global-user 覆盖）
        const author = readCommitAuthor(dir)
        expect(author.name).toBe('123456[bot]')
        expect(author.email).toBe('123456+dependfix-bot[bot]@users.noreply.github.com')
    }, 15_000)

    // host 全局 git config 含 user.name 但 repo 无 local config → ensureGitConfig
    // 写入 local config（不被 host 全局污染）—— 验证 gitConfigExists 用 --local flag 路径
    it('host 全局 git config 存在 user.name 但 repo 无 local config → ensureGitConfig 写入 local config（不被 host 污染）', async () => {
        // 模拟开发者机器的 host 全局 git config（不应被 dependfix 错误读取）
        const globalDir = mkdtempSync(join(tmpdir(), 'dependfix-global-'))
        const globalConfig = join(globalDir, 'gitconfig')
        writeFileSync(globalConfig, '[user]\n\tname = GlobalHost\n\temail = host@example.com\n')
        vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)
        vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')

        try {
            const dir = createGitRepoWithoutGitConfig()
            writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

            // 验证前置状态：local config 无 user.name / user.email（用 --local 查询应返回空）
            // 关键：如果 gitConfigExists 不带 --local flag，会错误读到 host global 的 GlobalHost，
            // 误判"已配置" → ensureGitConfig 跳过 set → commit author 失败
            expect(git('config --local --get user.name', dir)).toBe('')
            expect(git('config --local --get user.email', dir)).toBe('')

            await stageAndCommit('fix: dependabot', dir) // PAT 路径

            // 验证：local config 是 PAT author（不是 host global 的 GlobalHost）
            const userName = git('config --local --get user.name', dir)
            const userEmail = git('config --local --get user.email', dir)
            expect(userName).toBe('dependfix[bot]')
            expect(userEmail).toBe('dependfix[bot]@users.noreply.github.com')
        } finally {
            vi.unstubAllEnvs()
            try {
                rmSync(globalDir, { recursive: true, force: true })
            } catch {
                /* ignore */
            }
        }
    }, 15_000)

    /**
     * 回归：stageAndCommit 显式传 `-c commit.gpgsign=false`，隔离 host `commit.gpgsign=true`。
     *
     * 根因：dependfix 宿主进程直接继承宿主 git 配置（平台 `container-executor` 名为 container、
     * 实为宿主进程内运行），故 host 开启签名时有两种破坏：
     * ① host 有可用签名 key → commit 带上宿主个人 GPG 签名（签名身份与被修复仓库的 commit
     *   author 不一致）；
     * ② host 无可用 key / `gpg.program` 不可用（CI、纯 Linux 容器）→
     *   `gpg failed to sign the data` → `failed to write commit object`，交付直接失败。
     *
     * 修复后 `-c commit.gpgsign=false` 在 lookup order（env → `-c` → local → global → system）
     * 中最高优先，签名不再被触发，commit 恒成功且 `%G?` = `N`（无签名）。
     *
     * 本用例把 `gpg.program` 指向不存在的程序：若签名未被关闭，commit 必然失败——
     * 断言与环境无关（无论本机是否安装 gpg）。
     */
    it('host commit.gpgsign=true + gpg.program 不可用 → commit 仍成功且无签名', async () => {
        const globalDir = mkdtempSync(join(tmpdir(), 'dependfix-gpgsign-'))
        const globalConfig = join(globalDir, 'gitconfig')
        writeFileSync(
            globalConfig,
            '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = /nonexistent/dependfix-no-such-gpg\n',
        )
        vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)
        vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')

        try {
            const dir = createGitRepoWithoutGitConfig()
            writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

            // 修复前：此处抛 `fatal: failed to write commit object`
            await stageAndCommit('fix: dependabot', dir)

            const author = readCommitAuthor(dir)
            expect(author.name).toBe('dependfix[bot]')
            // %G? = N 表示 commit 无 GPG 签名
            expect(git('log -1 --format=%G?', dir)).toBe('N')
        } finally {
            vi.unstubAllEnvs()
            try {
                rmSync(globalDir, { recursive: true, force: true })
            } catch {
                /* ignore */
            }
        }
    }, 15_000)

    /**
     * 回归（覆盖根因分支 ①）：host `commit.gpgsign=true` 且 gpg 按 host 默认配置可用时，
     * commit 仍不得带签名。
     *
     * 与上一用例的差异：**不**把 `gpg.program` 指向不可用程序。若 host 配了可用签名 key，
     * 修复前 commit 会带宿主个人签名（`%G?` = `G`/`U`）；若 host 无可用 key，修复前 commit
     * 直接失败。两种情形在修复后均应为「成功 + `%G?` = `N`」，故本断言同样与环境无关。
     */
    it('host commit.gpgsign=true + gpg 可用 → commit 仍成功且无签名', async () => {
        const globalDir = mkdtempSync(join(tmpdir(), 'dependfix-gpgsign-'))
        const globalConfig = join(globalDir, 'gitconfig')
        writeFileSync(globalConfig, '[commit]\n\tgpgsign = true\n')
        vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)
        vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')

        try {
            const dir = createGitRepoWithoutGitConfig()
            writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

            await stageAndCommit('fix: dependabot', dir)

            const author = readCommitAuthor(dir)
            expect(author.name).toBe('dependfix[bot]')
            expect(git('log -1 --format=%G?', dir)).toBe('N')
        } finally {
            vi.unstubAllEnvs()
            try {
                rmSync(globalDir, { recursive: true, force: true })
            } catch {
                /* ignore */
            }
        }
    }, 15_000)

    /**
     * 回归：repo **local** `commit.gpgsign=true`（非 host global）同样被 `-c` 覆盖。
     * 与 host 级用例互补——验证显式 `-c` 在 lookup order 中同时优于 repo local 配置。
     */
    it('repo local commit.gpgsign=true → commit 仍成功且无签名', async () => {
        const dir = createGitRepoWithoutGitConfig()
        // 写入 repo local config（非 host global）：签名开关 + 不可用的 gpg 程序
        git('config commit.gpgsign true', dir)
        git('config gpg.program /nonexistent/dependfix-no-such-gpg', dir)
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        // 修复前：local `commit.gpgsign=true` 会触发签名 → gpg 不可用 → failed to write commit object
        await stageAndCommit('fix: dependabot', dir)

        expect(git('log -1 --format=%G?', dir)).toBe('N')
    }, 15_000)

    it('commit.gpgsign=false 仅作用于本次调用，不写入 repo local config', async () => {
        const dir = createGitRepoWithoutGitConfig()
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        await stageAndCommit('fix: dependabot', dir)

        // `-c` 是单次调用级配置，不得落盘到用户仓库的 local config（不改变被修复仓库状态）。
        // 用 `--list`（成功路径）而非 `--get`：local 未设该键时 `--get` exit 1 会被 git() helper
        // 吞成空串，使 `toBe('')` 恒真而失去断言力。
        const localConfig = git('config --local --list', dir)
        expect(localConfig).not.toContain('commit.gpgsign')
        // 前置校验：local config 确有内容（ensureGitConfig 写入的 user.*），证明 --list 走的是成功路径
        expect(localConfig).toContain('user.name=')
    }, 15_000)

    /**
     * 回归：stageAndCommit 显式传 `--no-verify`，隔离被修复仓库的 git hooks。
     *
     * 根因：目标仓库常安装 husky / lint-staged（`.husky/pre-commit` → `npx lint-staged`），dependfix 的
     * 自动 commit 会触发它；隔离执行环境无 `npx`、目标仓库 `node_modules` 也未必完整 →
     * hook 非 0 退出（生产实证 `npx: not found` exit 127）→ `COMMIT_FAILED` → 修复回滚。
     *
     * 本用例植入「写标记文件 + exit 1」的 husky 风格 pre-commit：
     * - 反例：同环境裸 commit 必被拦截（证明 hook 真实生效，避免正例退化为恒真）
     * - 正例：stageAndCommit 成功，且标记文件不存在（证明 hook 未执行）
     */
    it('目标仓库 pre-commit hook 非 0 退出 → stageAndCommit 仍成功且 hook 未执行', async () => {
        const hooksGlobalDir = mkdtempSync(join(tmpdir(), 'dependfix-hooks-global-'))
        const hooksGlobalConfig = join(hooksGlobalDir, 'gitconfig')
        writeFileSync(hooksGlobalConfig, '')
        // 隔离 host 全局配置（避免 host `core.hooksPath` 等干扰本用例的 hook 安装点）
        vi.stubEnv('GIT_CONFIG_GLOBAL', hooksGlobalConfig)
        vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')

        try {
            const dir = createGitRepoWithoutGitConfig()
            const hookPath = join(dir, '.git', 'hooks', 'pre-commit')
            writeFileSync(hookPath, '#!/bin/sh\ntouch .hook-ran\nexit 1\n')
            chmodSync(hookPath, 0o755)
            writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

            // 反例对照：同环境裸 commit 被 hook 拦截（exit 非 0 → execSync 抛错）
            git('add .', dir)
            expect(() => execSync('git -c user.name=x -c user.email=x@example.com commit -m bare', {
                cwd: dir,
                stdio: 'pipe',
            })).toThrow()
            expect(existsSync(join(dir, '.hook-ran'))).toBe(true)

            // 清理反例副作用（标记文件），再制造新变更供正例提交
            rmSync(join(dir, '.hook-ran'), { force: true })
            writeFileSync(join(dir, 'package.json'), '{ "name": "fixed-2" }\n')

            // 被测实现：`--no-verify` 隔离后 commit 成功且 hook 未执行
            await stageAndCommit('fix: dependabot', dir)

            expect(existsSync(join(dir, '.hook-ran'))).toBe(false)
            expect(git('log -1 --format=%s', dir)).toBe('fix: dependabot')
        } finally {
            vi.unstubAllEnvs()
            try {
                rmSync(hooksGlobalDir, { recursive: true, force: true })
            } catch {
                /* ignore */
            }
        }
    }, 15_000)
})

// ---------------------------------------------------------------------------
// stageAndCommit 提交面白名单
// ---------------------------------------------------------------------------

describe('stageAndCommit 提交面白名单', () => {
    const tempDirs: string[] = []

    function git(args: string[], cwd: string): string {
        try {
            return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim()
        } catch {
            return ''
        }
    }

    /** 仓库含 README.md + package.json（均已在初始提交内） */
    function createRepo(): string {
        const dir = mkdtempSync(join(tmpdir(), 'dependfix-test-scope-'))
        tempDirs.push(dir)
        execSync('git init -q -b main', { cwd: dir, stdio: 'pipe' })
        execSync('git config user.email test@example.com', { cwd: dir, stdio: 'pipe' })
        execSync('git config user.name test', { cwd: dir, stdio: 'pipe' })
        writeFileSync(join(dir, 'README.md'), '# test\n')
        writeFileSync(join(dir, 'src.ts'), 'v1\n')
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixture" }\n')
        execSync('git add . && git -c commit.gpgsign=false commit -q -m init', { cwd: dir, stdio: 'pipe' })
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

    it('只提交白名单与声明路径：生成物 / 未跟踪文件不进入 commit', async () => {
        const dir = createRepo()
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')
        writeFileSync(join(dir, 'src.ts'), 'v2\n')
        writeFileSync(join(dir, '.nuxtrc'), 'compatibilityVersion=4\n')
        writeFileSync(join(dir, 'auto-imports.d.ts'), '// generated\n')
        writeFileSync(join(dir, 'notes.txt'), 'scratch\n')

        const scope = await stageAndCommit('fix: dependabot', dir, undefined, { declaredPaths: ['src.ts'] })

        expect(scope.staged).toEqual(['package.json', 'src.ts'])
        expect(scope.ignored.sort()).toEqual(['.nuxtrc', 'auto-imports.d.ts', 'notes.txt'])
        expect(git(['show', '--name-only', '--pretty=format:', 'HEAD'], dir).split('\n').filter(Boolean).sort())
            .toEqual(['package.json', 'src.ts'])
    }, 15_000)

    it('未声明的已跟踪改动 → CommitScopeError(UNEXPECTED_CHANGES)，且不产生提交', async () => {
        const dir = createRepo()
        const headBefore = git(['rev-parse', 'HEAD'], dir)
        writeFileSync(join(dir, 'README.md'), '# hacked\n')
        writeFileSync(join(dir, 'package.json'), '{ "name": "fixed" }\n')

        let thrown: unknown
        try {
            await stageAndCommit('fix: dependabot', dir)
        } catch (error: unknown) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(CommitScopeError)
        expect((thrown as CommitScopeError).category).toBe('UNEXPECTED_CHANGES')
        expect((thrown as CommitScopeError).message).toContain('README.md')
        expect(git(['rev-parse', 'HEAD'], dir)).toBe(headBefore)
    }, 15_000)

    it('只有生成物 / 未跟踪文件 → CommitScopeError(NO_CHANGES)，不产生空提交', async () => {
        const dir = createRepo()
        const headBefore = git(['rev-parse', 'HEAD'], dir)
        writeFileSync(join(dir, '.nuxtrc'), 'compatibilityVersion=4\n')
        writeFileSync(join(dir, 'notes.txt'), 'scratch\n')

        let thrown: unknown
        try {
            await stageAndCommit('fix: dependabot', dir)
        } catch (error: unknown) {
            thrown = error
        }

        expect((thrown as CommitScopeError).category).toBe('NO_CHANGES')
        expect(git(['rev-parse', 'HEAD'], dir)).toBe(headBefore)
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
    it('creates a new branch with the given name', async () => {
        const dir = createGitRepo()
        const result = await createFixBranch('dependfix/auto-fix-abc12345', dir)

        expect(result).toEqual({ branchName: 'dependfix/auto-fix-abc12345', created: true })
        const current = execSync('git branch --show-current', { cwd: dir, encoding: 'utf-8' }).trim()
        expect(current).toBe('dependfix/auto-fix-abc12345')
    }, 15_000)

    it('switches to an existing branch instead of creating a duplicate', async () => {
        const dir = createGitRepo()
        await createFixBranch('dependfix/auto-fix-abc12345', dir)
        const second = await createFixBranch('dependfix/auto-fix-abc12345', dir)

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

    it('无尝试标记时不写入 dependfix:attempt 注释', () => {
        expect(generatePRBody(buildRunResult())).not.toContain('dependfix:attempt')
        expect(generatePRBody(buildRunResult(), [], [])).not.toContain('dependfix:attempt')
    })

    it('尝试标记置于正文头部（尾部截断不会丢标记）', () => {
        const markers = [
            { key: 'aaaaaaaaaaaaaaaa', n: 2 },
            { key: 'bbbbbbbbbbbbbbbb', n: 1, failureSignature: 'deadbeef', failed: 1 as const },
        ]
        const body = generatePRBody(buildRunResult(), undefined, markers)

        expect(body.startsWith('<!-- dependfix:attempt key=aaaaaaaaaaaaaaaa n=2 failed=? -->')).toBe(true)
        expect(body).toContain('<!-- dependfix:attempt key=bbbbbbbbbbbbbbbb n=1 fp=deadbeef failed=1 -->')
        // 标记位于标题之前；正文内容完整保留
        expect(body.indexOf('dependfix:attempt')).toBeLessThan(body.indexOf('## 🔒 Dependfix Auto Fix'))
    })

    it('renders skipped/truncated breakdown and unfixed count', () => {
        const result = buildRunResult()
        result.summary = {
            ...result.summary,
            alertsFound: 20,
            alertsFixed: 0,
            alertsUnfixed: 20,
            alertsConverged: 0,
            alertsSkipped: 4,
            alertsSkippedByReason: { 'cross-major': 4 },
            alertsTruncated: 6,
            alertsTruncatedBySeverity: { critical: 2, high: 4 },
        }

        const body = generatePRBody(result)

        expect(body).toContain('| Unfixed alerts | 20 |')
        expect(body).toContain('### ⏭️ Not Fixed / Skipped')
        expect(body).toContain('**20 / 20** evaluated alerts remain unfixed; **6** truncated before analysis (not evaluated).')
        expect(body).toContain('| Truncated: Critical | 2 |')
        expect(body).toContain('| Truncated: High | 4 |')
        expect(body).toContain('| Skipped: Cross-major / manual review | 4 |')
        expect(body).toContain('| Failed / other not fixed | 16 |')
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

    it('renders versioned override strategy and em-dash for empty from version', () => {
        const result = buildRunResult()
        result.alerts = [
            makeBodyAlert({ packageName: 'vite', ruleId: 'GHSA-a', recommendedVersion: '5.4.21' }),
        ]
        result.actions = [
            makeBodyAction({ target: 'vite', fromVersion: '', toVersion: '^5.4.21', strategy: 'versioned-override' }),
        ]
        const body = generatePRBody(result)

        // 空 from 降级为 —（不再输出空单元格）；versioned-override 不再误标 direct
        expect(body).toContain('| `vite` | — | ^5.4.21 | pnpm overrides (versioned) | No |')
        expect(body).not.toContain('| `vite` |  | ^5.4.21 | direct |')
    })

    it('keeps the first non-empty from version when aggregating same-package actions', () => {
        // 同包多动作：首个空值不应让后续真实旧值失效（聚合回填）
        const result = buildRunResult()
        result.alerts = [
            makeBodyAlert({ packageName: 'vite', ruleId: 'GHSA-a', recommendedVersion: '5.4.21' }),
        ]
        result.actions = [
            makeBodyAction({ target: 'vite', fromVersion: '', toVersion: '^5.4.21', strategy: 'versioned-override' }),
            makeBodyAction({ target: 'vite', fromVersion: '5.4.14', toVersion: '^5.4.21', strategy: 'versioned-override' }),
        ]
        const body = generatePRBody(result)

        expect(body).toContain('| `vite` | 5.4.14 | ^5.4.21 | pnpm overrides (versioned) | No |')
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
            upstreamId: 'code-scanning:2',
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
        upstreamId: 'dependabot:1',
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

// ---------------------------------------------------------------------------
// generatePRBody CI 口径（验证链 vs 目标仓库 CI）
// ---------------------------------------------------------------------------

function makeCiAlignment(overrides: Partial<CiAlignmentRecord> = {}): CiAlignmentRecord {
    return {
        repository: 'owner/repo',
        commands: ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm build', 'pnpm typecheck', 'pnpm test'],
        status: 'aligned',
        ciCategories: ['lint', 'build', 'test'],
        extraInExecution: ['typecheck'],
        missingInExecution: [],
        workflows: [{ path: '.github/workflows/ci.yml', categories: ['lint', 'build', 'test'], unrecognized: [] }],
        ...overrides,
    }
}

function ciBulletLines(body: string): string[] {
    const section = body.split('### 🔎 CI 口径')[1]?.split('\n\n')[0] ?? ''
    return section.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- '))
}

describe('generatePRBody CI 口径', () => {
    it('aligned 时披露一致与「CI 未跑 typecheck，本次已验证」', () => {
        const result = { ...buildRunResult(), ciAlignment: [makeCiAlignment()] }

        const body = generatePRBody(result)

        expect(body).toContain('### 🔎 CI 口径')
        expect(body).toContain('CI 口径：一致')
        expect(body).toContain('本仓库 CI 未跑 typecheck，本次已验证')
        expect(body).toContain('本次验证链：')
    })

    it('区块固定 ≤ 5 行', () => {
        const result = {
            ...buildRunResult(),
            ciAlignment: [makeCiAlignment({
                workflows: [{
                    path: '.github/workflows/ci.yml',
                    categories: ['lint', 'build', 'test'],
                    unrecognized: ['pnpm test:e2e', 'pnpm format', 'pnpm release'],
                }],
                defaultBranchHealth: [{ path: '.github/workflows/ci.yml', conclusion: 'failure' }],
            })],
        }

        expect(ciBulletLines(generatePRBody(result)).length).toBeLessThanOrEqual(5)
    })

    it('differs 时列出 CI 运行而本次未执行的类别', () => {
        const result = {
            ...buildRunResult(),
            ciAlignment: [makeCiAlignment({
                status: 'differs',
                extraInExecution: [],
                missingInExecution: ['test'],
            })],
        }

        const body = generatePRBody(result)

        expect(body).toContain('CI 口径：不一致（CI 运行、本次未执行：test）')
    })

    it('unreadable 时标注未能读取 CI 配置（不阻断正文生成）', () => {
        const result = {
            ...buildRunResult(),
            ciAlignment: [makeCiAlignment({
                status: 'unreadable',
                workflows: [],
                ciCategories: [],
                extraInExecution: [],
                unreadableReason: '未找到 .github/workflows',
            })],
        }

        const body = generatePRBody(result)

        expect(body).toContain('CI 口径：未能读取 CI 配置（未找到 .github/workflows）')
    })

    it('默认分支同 workflow 最近一次失败 → 标注「非本 PR 引入」', () => {
        const result = {
            ...buildRunResult(),
            ciAlignment: [makeCiAlignment({
                defaultBranchHealth: [{ path: '.github/workflows/ci.yml', conclusion: 'failure' }],
            })],
        }

        expect(generatePRBody(result)).toContain('默认分支同 workflow 最近一次失败（非本 PR 引入）')
    })

    it('健康预检未获取（API 失败 / 限流 / 超时）不标注失败结论', () => {
        const result = {
            ...buildRunResult(),
            ciAlignment: [makeCiAlignment({
                healthUnavailableReason: 'API rate limit exceeded',
            })],
        }

        const body = generatePRBody(result)

        expect(body).not.toContain('最近一次失败')
        expect(body).not.toContain('rate limit')
    })

    it('无口径记录时不渲染区块（旧结果 / 未执行验证链）', () => {
        expect(generatePRBody(buildRunResult())).not.toContain('CI 口径')
    })
})

describe('generatePRBody family lockstep', () => {
    it('adds a Family column and lists members / skipped members', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({
                target: 'vitest',
                fromVersion: '^3.2.4',
                toVersion: '^4.0.1',
                isMajor: true,
                strategy: 'family-lockstep',
                family: {
                    id: 'vitest',
                    members: ['vitest', '@vitest/coverage-v8'],
                    skipped: ['@vitest/ui'],
                },
            }),
        ]

        const body = generatePRBody(result)

        expect(body).toContain('| Package | From | To | Strategy | Major | Family |')
        expect(body).toContain('| `vitest` | ^3.2.4 | ^4.0.1 | family lockstep | ⚠️ Yes | `vitest` |')
        expect(body).toContain('### 🧩 Family Lockstep')
        expect(body).toContain('| `vitest` | `vitest`, `@vitest/coverage-v8` | `@vitest/ui` |')
    })

    it('renders an em dash for non-family rows when the Family column is present', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({
                target: 'vitest',
                family: { id: 'vitest', members: ['vitest', '@vitest/coverage-v8'], skipped: [] },
            }),
            makeBodyAction({ target: 'lodash', fromVersion: '4.17.20', toVersion: '4.17.21' }),
        ]

        const body = generatePRBody(result)

        expect(body).toContain('| Package | From | To | Strategy | Major | Family |')
        expect(body).toContain('| `lodash` | 4.17.20 | 4.17.21 | direct | No | — |')
    })

    it('renders the repository column and multi-repository family table', () => {
        const result = buildRunResult()
        result.actions = [
            makeBodyAction({
                target: 'vitest',
                family: { id: 'vitest', members: ['vitest'], skipped: [] },
            }),
            makeBodyAction({
                repository: 'owner/other',
                target: 'jest',
                family: { id: 'jest', members: ['jest', '@types/jest'], skipped: [] },
            }),
        ]

        const body = generatePRBody(result)

        expect(body).toContain('| Repository | Package | From | To | Strategy | Major | Family |')
        expect(body).toContain('| Repository | Family | Members | Skipped |')
        expect(body).toContain('| owner/other | `jest` | `jest`, `@types/jest` | — |')
    })

    it('keeps the table shape unchanged without family information', () => {
        const result = buildRunResult()
        result.actions = [makeBodyAction({ target: 'vite', fromVersion: '5.4.20', toVersion: '6.4.3' })]

        const body = generatePRBody(result)

        expect(body).toContain('| `vite` | 5.4.20 | 6.4.3 | direct | No |')
        expect(body).not.toContain('Family Lockstep')
    })
})

// ---------------------------------------------------------------------------
// createPullRequest（draft 档）
// ---------------------------------------------------------------------------

describe('createPullRequest', () => {
    const makeClient = () => {
        const create = vi.fn().mockResolvedValue({
            data: { number: 5, html_url: 'https://github.com/o/r/pull/5', head: { sha: 'abc' } },
        })
        return { octokit: { rest: { pulls: { create } } } as unknown as Octokit, create }
    }

    const params = {
        owner: 'o',
        repo: 'r',
        headBranch: 'dependfix/auto-fix-deadbeef',
        baseBranch: 'main',
        title: 'title',
        body: 'body',
    }

    it('默认请求体不带 draft（既有行为逐字不变）', async () => {
        const { octokit, create } = makeClient()
        const result = await createPullRequest({ octokit, ...params })
        expect(create.mock.calls[0]![0]).toEqual({
            owner: 'o',
            repo: 'r',
            title: 'title',
            body: 'body',
            head: params.headBranch,
            base: 'main',
        })
        expect(result).toEqual({ number: 5, htmlUrl: 'https://github.com/o/r/pull/5', headSha: 'abc' })
    })

    it('draft 档显式置 true（基线红的草稿交付）', async () => {
        const { octokit, create } = makeClient()
        await createPullRequest({ octokit, ...params, draft: true })
        expect(create.mock.calls[0]![0]).toMatchObject({ draft: true })
    })
})
