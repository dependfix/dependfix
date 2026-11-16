// pr-creator-push-lease.test.ts — 同名 dependfix 分支残留时的推送语义。
//
// 场景（线上 rsshub-never-die 复现）：上一轮 PR 被关闭但 `dependfix/auto-fix-<fingerprint>`
// 分支未删除；下一轮从默认分支重新建同名分支，新 commit 与远端 tip 是兄弟节点 → 普通 push
// 非快进失败，且同指纹每轮都会重来。
//
// 契约：仅 `dependfix/` 前缀使用 `--force-with-lease`（期望值取 ls-remote 实测 tip）；
// 默认分支 / 非自有分支保持非快进语义（防止误覆盖他人提交）。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { pushBranch } from './pr-creator'

const tempDirs: string[] = []

const git = (args: string[], cwd: string): string =>
    execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()

const makeTempDir = (prefix: string): string => {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}

const configUser = (cwd: string): void => {
    git(['config', 'user.name', 'test'], cwd)
    git(['config', 'user.email', 'test@example.com'], cwd)
}

const commitFile = (cwd: string, name: string, content: string, message: string): void => {
    writeFileSync(join(cwd, name), content)
    git(['add', name], cwd)
    git(['commit', '-m', message], cwd)
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

describe('pushBranch 同名 dependfix 分支残留', () => {
    it('远端已有同名 dependfix 分支时用 lease 覆盖兄弟 commit（普通 push 反例失败）', async () => {
        const originDir = makeTempDir('dependfix-lease-origin-')
        git(['init', '--bare', '-b', 'main'], originDir)
        const originUrl = pathToFileURL(originDir).href

        // 种子仓库：main + 远端 dependfix 分支
        const seedDir = makeTempDir('dependfix-lease-seed-')
        git(['clone', originUrl, seedDir], tmpdir())
        configUser(seedDir)
        commitFile(seedDir, 'README.md', '# init\n', 'init')
        git(['push', 'origin', 'main'], seedDir)
        git(['checkout', '-b', 'dependfix/auto-fix-abc12345'], seedDir)
        commitFile(seedDir, 'fix.txt', 'old\n', 'old fix')
        git(['push', 'origin', 'dependfix/auto-fix-abc12345'], seedDir)
        const oldRemoteTip = git(['rev-parse', 'HEAD'], seedDir)

        // 模拟执行器：depth 1 克隆默认分支（不含 dependfix 分支的 remote-tracking ref）
        const workDir = makeTempDir('dependfix-lease-work-')
        git(['clone', '--depth', '1', '--branch', 'main', originUrl, workDir], tmpdir())
        configUser(workDir)
        git(['checkout', '-b', 'dependfix/auto-fix-abc12345'], workDir)
        commitFile(workDir, 'fix.txt', 'new\n', 'new fix')
        const newLocalTip = git(['rev-parse', 'HEAD'], workDir)
        expect(newLocalTip).not.toBe(oldRemoteTip)

        // 反例：普通 push 在兄弟 commit 下必失败（证明场景真实，不是恒真断言）
        const plainPush = (): void => {
            git(['push', 'origin', 'dependfix/auto-fix-abc12345'], workDir)
        }
        expect(plainPush).toThrow()

        // 正例：pushBranch 对 dependfix/ 前缀使用 lease 覆盖
        await pushBranch('dependfix/auto-fix-abc12345', workDir)

        const remoteTip = git(['ls-remote', originUrl, 'refs/heads/dependfix/auto-fix-abc12345'], workDir)
        expect(remoteTip.split(/\s+/u)[0]).toBe(newLocalTip)
    })

    it('远端无同名 dependfix 分支时不带 lease，按普通 push 创建', async () => {
        const originDir = makeTempDir('dependfix-lease-new-origin-')
        git(['init', '--bare', '-b', 'main'], originDir)
        const originUrl = pathToFileURL(originDir).href

        const seedDir = makeTempDir('dependfix-lease-new-seed-')
        git(['clone', originUrl, seedDir], tmpdir())
        configUser(seedDir)
        commitFile(seedDir, 'README.md', '# init\n', 'init')
        git(['push', 'origin', 'main'], seedDir)

        const workDir = makeTempDir('dependfix-lease-new-work-')
        git(['clone', originUrl, workDir], tmpdir())
        configUser(workDir)
        git(['checkout', '-b', 'dependfix/auto-fix-newbranch'], workDir)
        commitFile(workDir, 'fix.txt', 'new\n', 'new fix')
        const localTip = git(['rev-parse', 'HEAD'], workDir)

        await pushBranch('dependfix/auto-fix-newbranch', workDir)

        const remoteTip = git(['ls-remote', originUrl, 'refs/heads/dependfix/auto-fix-newbranch'], workDir)
        expect(remoteTip.split(/\s+/u)[0]).toBe(localTip)
    })

    it('默认分支不走 lease（远端前进时普通 push 仍按非快进失败）', async () => {
        const originDir = makeTempDir('dependfix-lease-main-origin-')
        git(['init', '--bare', '-b', 'main'], originDir)
        const originUrl = pathToFileURL(originDir).href

        const seedDir = makeTempDir('dependfix-lease-main-seed-')
        git(['clone', originUrl, seedDir], tmpdir())
        configUser(seedDir)
        commitFile(seedDir, 'README.md', '# init\n', 'init')
        git(['push', 'origin', 'main'], seedDir)

        const workDir = makeTempDir('dependfix-lease-main-work-')
        git(['clone', originUrl, workDir], tmpdir())
        configUser(workDir)

        // 远端前进一个 commit（本地未同步）
        commitFile(seedDir, 'remote.txt', 'remote\n', 'remote advance')
        git(['push', 'origin', 'main'], seedDir)

        // 本地在旧 main 上新增 commit → 非快进
        commitFile(workDir, 'local.txt', 'local\n', 'local advance')
        await expect(pushBranch('main', workDir)).rejects.toThrow()
    })
})
