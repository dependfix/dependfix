import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest'

/**
 * workDir 保留与远程分支清理测试。
 *
 * moveToPending 用真实 fs（创建临时目录 → 移动 → 验证 metadata）。
 * cleanupRemoteBranch 用 mock child_process（避免真实 git 调用）。
 */

/**
 * Mock child_process 策略：util.promisify 检测 Symbol.for('nodejs.util.promisify.custom')，
 * 若被包装函数具备此符号指向自身，promisify 直接返回原函数。我们把 mock execFile 标记为
 * Promise 风格（参考 container-executor-push.test.ts）。
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
    ;(m.execFile as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = m.execFile
    return m
})

vi.mock('node:child_process', () => childProcessMock)

import { moveToPending, cleanupRemoteBranch } from './container-executor'

describe('moveToPending', () => {
    let tempRoot: string
    let runId: string

    beforeEach(async () => {
        tempRoot = join(tmpdir(), `c53-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        await mkdir(tempRoot, { recursive: true })
        runId = 'run-test-123'
    })

    afterEach(async () => {
        await rm(tempRoot, { recursive: true, force: true })
    })

    it('moves workDir to _pending/{runId} and writes metadata (default 24h)', async () => {
        const workDir = join(tempRoot, runId)
        await mkdir(workDir, { recursive: true })
        await writeFile(join(workDir, 'package.json'), '{}', 'utf-8')

        const pendingRoot = join(tempRoot, '_pending')
        const targetDir = await moveToPending(workDir, runId, pendingRoot)

        expect(targetDir).toBe(join(pendingRoot, runId))

        // 源目录已不存在
        await expect(rm(workDir, { recursive: true, force: true })).resolves.not.toThrow()

        // 目标目录含 metadata 与原文件
        const meta = JSON.parse(await readFile(join(targetDir, '.meta.json'), 'utf-8')) as {
            runId: string
            writtenAt: string
            retentionMs: number
            expiresAt: string
            reason: string
        }
        expect(meta.runId).toBe(runId)
        expect(meta.retentionMs).toBe(24 * 60 * 60 * 1000)
        expect(meta.reason).toBe('pr_creation_failed')
        expect(new Date(meta.expiresAt).getTime() - new Date(meta.writtenAt).getTime()).toBe(24 * 60 * 60 * 1000)

        // 原文件保留
        const content = await readFile(join(targetDir, 'package.json'), 'utf-8')
        expect(content).toBe('{}')
    })

    it('rejects illegal runId (path traversal defense)', async () => {
        const workDir = join(tempRoot, 'work')
        await mkdir(workDir, { recursive: true })

        await expect(moveToPending(workDir, '../escape', tempRoot)).rejects.toThrow(/非法 runId/)
    })

    it('creates pendingRoot if not exists (idempotent mkdir)', async () => {
        const workDir = join(tempRoot, runId)
        await mkdir(workDir, { recursive: true })

        const pendingRoot = join(tempRoot, 'deep', '_pending')
        const targetDir = await moveToPending(workDir, runId, pendingRoot)

        expect(targetDir).toBe(join(pendingRoot, runId))
    })

    it('supports custom retentionMs (压测 1h 短期窗口)', async () => {
        const workDir = join(tempRoot, runId)
        await mkdir(workDir, { recursive: true })

        const pendingRoot = join(tempRoot, '_pending')
        const targetDir = await moveToPending(workDir, runId, pendingRoot, 60 * 60 * 1000)

        const meta = JSON.parse(await readFile(join(targetDir, '.meta.json'), 'utf-8'))
        expect(meta.retentionMs).toBe(60 * 60 * 1000)
    })
})

describe('cleanupRemoteBranch', () => {
    beforeEach(() => {
        childProcessMock.execFile.mockReset()
    })

    it('deletes remote branch with token via http.extraheader', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/foo/bar.git\n' })

        const ok = await cleanupRemoteBranch('dependfix/auto-fix-abc12345', '/tmp/work', 'ghp_TOKEN')
        expect(ok).toBe(true)

        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
        const [bin, args, opts] = callArgs
        expect(bin).toBe('git')
        expect(args).toEqual([
            '-c',
            expect.stringContaining('http.extraheader=Authorization: basic '),
            'push',
            'origin',
            '--delete',
            'dependfix/auto-fix-abc12345',
        ])
        expect(args.join(' ')).not.toContain('ghp_TOKEN')
        expect(opts).toEqual(expect.objectContaining({ cwd: '/tmp/work', timeout: 30_000 }))
    })

    it('returns false (silent) when git push --delete fails', async () => {
        childProcessMock.execFile.mockRejectedValue(new Error('remote ref does not exist'))

        const ok = await cleanupRemoteBranch('dependfix/auto-fix-abc12345', '/tmp/work', 'ghp_TOKEN')
        expect(ok).toBe(false)
    })

    it('deletes remote branch without token when not provided', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: '' })

        const ok = await cleanupRemoteBranch('dependfix/auto-fix-abc12345', '/tmp/work')
        expect(ok).toBe(true)

        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[]]
        const [, args] = callArgs
        expect(args).toEqual(['push', 'origin', '--delete', 'dependfix/auto-fix-abc12345'])
    })
})
