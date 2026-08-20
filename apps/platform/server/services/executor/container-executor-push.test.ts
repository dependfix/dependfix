import { vi, describe, expect, it, beforeEach } from 'vitest'

/**
 * push 链路测试（extractBranchName / pushFixBranch）。
 *
 * 与 container-executor.test.ts 拆开原因：
 * - 现有 case 依赖真实 DependfixApp.run() 失败（网络 / 无 token）—— 不能 mock child_process
 * - 本文件聚焦 push 链路本身，mock 全部 child_process
 * - 拆文件保证两套测试互不干扰
 *
 * Mock 关键点：util.promisify 检测 `Symbol.for('nodejs.util.promisify.custom')`，
 * 若被包装函数具备此符号指向自身，promisify 直接返回原函数（认为是 Promise 风格）。
 * 我们在 vi.hoisted 内部（即 vi.mock 工厂调用前）设置 custom 符号，否则 promisify 包装时
 * 插入 callback 期望，导致 mock 永不触发 → 测试 timeout。
 */

const childProcessMock = vi.hoisted(() => {
    const m: {
        execFile: ReturnType<typeof vi.fn>
        execFileSync: ReturnType<typeof vi.fn>
        execSync: ReturnType<typeof vi.fn>
        spawn: ReturnType<typeof vi.fn>
        spawnSync: ReturnType<typeof vi.fn>
    } = {
        execFile: vi.fn(),
        execFileSync: vi.fn(),
        execSync: vi.fn(),
        spawn: vi.fn(),
        spawnSync: vi.fn(),
    }
    // 在 vi.hoisted 内部直接设置 custom 符号（Symbol.for 是全局注册，跨模块一致）
    ;(m.execFile as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = m.execFile
    return m
})

vi.mock('node:child_process', () => childProcessMock)

import { extractBranchName, pushFixBranch } from './container-executor'

beforeEach(() => {
    childProcessMock.execFile.mockReset()
})

describe('extractBranchName', () => {
    it('returns trimmed branch name from git rev-parse', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: 'dependfix/auto-fix-abc12345\n', stderr: '' })
        const branch = await extractBranchName('/tmp/test')
        expect(branch).toBe('dependfix/auto-fix-abc12345')
        expect(childProcessMock.execFile).toHaveBeenCalledWith(
            'git',
            ['rev-parse', '--abbrev-ref', 'HEAD'],
            expect.objectContaining({ cwd: '/tmp/test', timeout: 5_000 }),
        )
    })

    it('throws when workDir is detached HEAD', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: 'HEAD\n', stderr: '' })
        await expect(extractBranchName('/tmp/test')).rejects.toThrow(/detached HEAD/)
    })

    it('throws when git returns empty stdout', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '   \n', stderr: '' })
        await expect(extractBranchName('/tmp/test')).rejects.toThrow(/detached HEAD/)
    })
})

describe('pushFixBranch', () => {
    it('pushes branch with token via http.extraheader (CWE-200: token 不进 argv)', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/owner-a/repo-b.git\n' })
        await pushFixBranch('dependfix/auto-fix-abc12345', '/tmp/test', 'ghp_SUPERSECRETTOKEN')

        expect(childProcessMock.execFile).toHaveBeenCalledTimes(1)
        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
        const [bin, args, opts] = callArgs
        expect(bin).toBe('git')
        // 关键断言：token 走 http.extraheader（base64 basic auth），不进 argv
        expect(args).toEqual([
            '-c',
            'http.extraheader=Authorization: basic eC1hY2Nlc3MtdG9rZW46Z2hwX1NVUEVSU0VDUkVUVE9LRU4=',
            'push',
            'origin',
            'dependfix/auto-fix-abc12345',
        ])
        expect(args.join(' ')).toContain('Authorization: basic')
        expect(args.join(' ')).not.toContain('ghp_SUPERSECRETTOKEN')
        expect(args.join(' ')).not.toContain('https://')
        expect(opts).toEqual(expect.objectContaining({ cwd: '/tmp/test', timeout: 60_000 }))
    })

    it('pushes without token when not provided (依赖 git config 已存凭据)', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/owner-a/repo-b.git\n' })
        await pushFixBranch('dependfix/auto-fix-abc12345', '/tmp/test')

        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[]]
        const [, args] = callArgs
        expect(args).toEqual(['push', 'origin', 'dependfix/auto-fix-abc12345'])
        expect(args.join(' ')).not.toContain('http.extraheader')
    })

    it('throws when stderr is not git push success marker (To ...)', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: '',
            stderr: 'remote: Invalid username or password.\nfatal: Authentication failed for \'https://github.com/owner-a/repo-b.git/\'\n',
        })
        await expect(pushFixBranch('dependfix/auto-fix-abc12345', '/tmp/test', 'ghp_bad'))
            .rejects.toThrow(/git push 失败/)
    })

    it('accepts stdout-only success (部分 git 版本 push 成功只走 stdout)', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: '' })
        await expect(pushFixBranch('dependfix/auto-fix-abc12345', '/tmp/test'))
            .resolves.toBeUndefined()
    })
})
