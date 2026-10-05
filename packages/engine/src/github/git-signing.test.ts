import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GIT_COMMIT_HOOKS_ISOLATION_ARGS, GIT_COMMIT_SIGNING_ISOLATION_ARGS, GIT_PUSH_SIGNING_ISOLATION_ARGS } from './git-signing'
import { pushBranch } from './pr-creator'

/**
 * git 签名语义隔离（push 侧隔离 + 「不提供签名 opt-in」策略；口径见 docs/standards/git.md §3.8）。
 *
 * 覆盖两点：
 * 1. 常量契约——commit / push 两个隔离参数是单一事实源（engine 与平台侧共用）
 * 2. push 侧真实回归——宿主 `push.gpgSign=true` 时 `pushBranch` 仍成功；
 *    并以**同一环境下的裸 `git push` 必失败**作反例对照，证明「成功」来自隔离参数
 *    而非环境恰好不触发签名（避免恒真断言）。
 *
 * 反例的失败信息与服务端 `receive-pack` 证书协商能力相关（实测**不经过** `gpg.program`）：
 * `fatal: the receiving end does not support --signed push`。
 */

const tempDirs: string[] = []

/** 严格版 git 执行（argv 数组，不经 shell）：失败即抛，便于断言「裸 push 必失败」 */
const git = (args: string[], cwd: string): string =>
    execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()

const makeTempDir = (prefix: string): string => {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}

/** 建 bare origin + 工作仓库（含一次 commit，remote origin 指向 bare） */
const setupRepoWithOrigin = (): { workDir: string } => {
    const originDir = makeTempDir('dependfix-pushsign-origin-')
    git(['init', '--bare', '-b', 'main'], originDir)

    const workDir = makeTempDir('dependfix-pushsign-work-')
    git(['init', '-b', 'main'], workDir)
    writeFileSync(join(workDir, 'README.md'), '# test\n')
    git(['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'add', '.'], workDir)
    git(['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], workDir)
    git(['remote', 'add', 'origin', originDir], workDir)
    return { workDir }
}

/** 把宿主全局配置指向含 `[push] gpgSign = true` 的临时文件（并屏蔽 system 配置） */
const stubHostPushSigning = (): void => {
    const globalDir = makeTempDir('dependfix-pushsign-global-')
    const globalConfig = join(globalDir, 'gitconfig')
    writeFileSync(globalConfig, '[push]\n\tgpgSign = true\n')
    vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
}

afterEach(() => {
    vi.unstubAllEnvs()
    for (const dir of tempDirs.splice(0)) {
        try {
            rmSync(dir, { recursive: true, force: true })
        } catch {
            /* ignore */
        }
    }
})

describe('git 签名隔离常量', () => {
    it('commit 侧与 push 侧隔离参数取值固定（跨 engine / 平台共用的单一事实源）', () => {
        expect([...GIT_COMMIT_SIGNING_ISOLATION_ARGS]).toEqual(['-c', 'commit.gpgsign=false'])
        expect([...GIT_COMMIT_HOOKS_ISOLATION_ARGS]).toEqual(['--no-verify'])
        expect([...GIT_PUSH_SIGNING_ISOLATION_ARGS]).toEqual(['-c', 'push.gpgSign=false'])
    })
})

describe('pushBranch 签名隔离回归', () => {
    it('宿主 push.gpgSign=true 时 pushBranch 仍成功（同环境裸 push 失败作反例对照）', () => {
        const { workDir } = setupRepoWithOrigin()
        stubHostPushSigning()

        // 反例对照：未隔离的裸 push 被宿主 push.gpgSign 污染 → 必失败
        expect(() => git(['push', 'origin', 'main'], workDir))
            .toThrow(/does not support --signed push/i)

        // 被测实现：显式 `-c push.gpgSign=false` 后 push 成功
        expect(() => pushBranch('main', workDir)).not.toThrow()

        // 远端确实收到分支（证明反例与正例作用于同一 remote / 同一 commit）
        expect(git(['ls-remote', '--heads', 'origin', 'main'], workDir)).toContain('refs/heads/main')
    }, 20_000)

    it('push 隔离参数仅作用于本次调用，不写入 repo local config', () => {
        const { workDir } = setupRepoWithOrigin()

        pushBranch('main', workDir)

        const localConfig = git(['config', '--local', '--list'], workDir)
        // 前置：local config 确有内容（证明 --list 走成功路径，而非命令失败返回空串）
        expect(localConfig).toContain('core.repositoryformatversion')
        // `--list` 会把键名小写化（push.gpgSign → push.gpgsign），故不能用大小写敏感的
        // not.toContain 断言（恒真）；改用 --get：键未落盘时 exit 1（严格 git helper 抛错）
        expect(() => git(['config', '--local', '--get', 'push.gpgSign'], workDir)).toThrow()
    }, 20_000)
})
