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

import { disposeWorkDirAfterRun, moveToPending, cleanupRemoteBranch } from './container-executor'

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

    it('records the custom reason (取消未落定的延迟清理)', async () => {
        const workDir = join(tempRoot, runId)
        await mkdir(workDir, { recursive: true })
        const pendingRoot = join(tempRoot, '_pending')

        const targetDir = await moveToPending(workDir, runId, pendingRoot, { reason: 'execution_timeout_unsettled' })

        const meta = JSON.parse(await readFile(join(targetDir, '.meta.json'), 'utf-8')) as { reason: string }
        expect(meta.reason).toBe('execution_timeout_unsettled')
    })

    it('supports custom retentionMs (压测 1h 短期窗口)', async () => {
        const workDir = join(tempRoot, runId)
        await mkdir(workDir, { recursive: true })

        const pendingRoot = join(tempRoot, '_pending')
        const targetDir = await moveToPending(workDir, runId, pendingRoot, { retentionMs: 60 * 60 * 1000 })

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
            'push.gpgSign=false',
            '-c',
            expect.stringContaining('http.extraheader=Authorization: basic '),
            'push',
            '--no-verify',
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
        // hooks 隔离：`push --no-verify` 跳过被修复仓库 pre-push（与 commit 侧同一事实源）
        expect(args).toEqual(['-c', 'push.gpgSign=false', 'push', '--no-verify', 'origin', '--delete', 'dependfix/auto-fix-abc12345'])
    })
})

describe('disposeWorkDirAfterRun', () => {
    it('moves an unsettled workDir into _pending with the diagnosis instead of deleting it', async () => {
        const move = vi.fn(async () => '/tmp/_pending/run-1')
        const remove = vi.fn(async () => undefined)

        const outcome = await disposeWorkDirAfterRun({
            workDir: '/tmp/work/run-1',
            runId: 'run-1',
            pendingRoot: '/tmp/_pending',
            unsettledDiagnosis: '未在 10000ms 宽限期内落定；取消时刻在管受管子进程 1 个',
            move,
            remove,
        })

        expect(outcome).toBe('moved')
        expect(remove).not.toHaveBeenCalled()
        expect(move).toHaveBeenCalledWith(
            '/tmp/work/run-1',
            'run-1',
            '/tmp/_pending',
            {
                reason: 'execution_timeout_unsettled',
                extraMeta: { diagnosis: '未在 10000ms 宽限期内落定；取消时刻在管受管子进程 1 个' },
            },
        )
    })

    it('deletes the workDir when the run settled', async () => {
        const move = vi.fn(async () => '/tmp/_pending/run-2')
        const remove = vi.fn(async () => undefined)

        const outcome = await disposeWorkDirAfterRun({
            workDir: '/tmp/work/run-2',
            runId: 'run-2',
            pendingRoot: '/tmp/_pending',
            move,
            remove,
        })

        expect(outcome).toBe('removed')
        expect(move).not.toHaveBeenCalled()
        expect(remove).toHaveBeenCalledWith('/tmp/work/run-2')
    })
})
