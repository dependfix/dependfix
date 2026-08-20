import { mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { cleanupPendingWorkdirs } from './cleanup-pending-workdirs'

/**
 * _pending workDir 清理测试（2026-08-20）。
 * 真实 fs：创建临时目录 + _pending/{runId}/ + .meta.json，模拟 moveToPending 产物。
 * 覆盖：过期删除 / 未过期保留 / 缺 meta 防御 / 非法 runId / 非目录跳过 / 根不存在零值。
 */

describe('cleanupPendingWorkdirs', () => {
    let tempRoot: string

    beforeEach(async () => {
        tempRoot = join(tmpdir(), `c53-pending-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        await mkdir(tempRoot, { recursive: true })
    })

    afterEach(async () => {
        await rm(tempRoot, { recursive: true, force: true })
    })

    const pendingRoot = () => join(tempRoot, '_pending')

    /** 构造 moveToPending 形态的保留目录（runId + .meta.json） */
    const makePendingDir = async (
        runId: string,
        expiresAtISO: string,
    ): Promise<string> => {
        const dir = join(pendingRoot(), runId)
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, '.meta.json'), JSON.stringify({
            runId,
            writtenAt: new Date().toISOString(),
            retentionMs: 24 * 60 * 60 * 1000,
            expiresAt: expiresAtISO,
            reason: 'pr_creation_failed',
        }, null, 2), 'utf-8')
        await writeFile(join(dir, 'package.json'), '{}', 'utf-8')
        return dir
    }

    it('删除已过期的 workDir（expiresAt < now）', async () => {
        const expiredDir = await makePendingDir('run-expired-1', new Date(Date.now() - 60_000).toISOString())

        const result = await cleanupPendingWorkdirs({ workRoot: tempRoot })
        expect(result.removed).toBe(1)
        expect(result.skippedMissingMeta).toBe(0)

        // 目录已被删除
        await expect(rm(expiredDir, { recursive: true, force: true })).resolves.not.toThrow()
        const entries = await readdir(pendingRoot())
        expect(entries).toHaveLength(0)
    })

    it('保留未过期的 workDir（expiresAt > now）', async () => {
        await makePendingDir('run-active-1', new Date(Date.now() + 60_000).toISOString())

        const result = await cleanupPendingWorkdirs({ workRoot: tempRoot })
        expect(result.removed).toBe(0)
        expect(result.skippedMissingMeta).toBe(0)

        const entries = await readdir(pendingRoot())
        expect(entries).toEqual(['run-active-1'])
    })

    it('混合场景：只删过期，未过期 + 缺 meta 保留', async () => {
        await makePendingDir('run-expired-2', new Date(Date.now() - 60_000).toISOString())
        await makePendingDir('run-active-2', new Date(Date.now() + 60_000).toISOString())
        // 无 .meta.json 的目录（防御性保留）
        const noMetaDir = join(pendingRoot(), 'run-no-meta')
        await mkdir(noMetaDir, { recursive: true })
        await writeFile(join(noMetaDir, 'package.json'), '{}', 'utf-8')

        const result = await cleanupPendingWorkdirs({ workRoot: tempRoot })
        expect(result.removed).toBe(1)
        expect(result.skippedMissingMeta).toBe(1)

        const entries = await readdir(pendingRoot())
        expect(entries.sort()).toEqual(['run-active-2', 'run-no-meta'].sort())
    })

    it('非法 runId 目录名（不匹配 RUN_ID_PATTERN）被跳过（防御）', async () => {
        // 路径穿越形态：`..` 无法作为子目录名 mkdir（父目录解析）；用空格/点号形态验证正则拒绝
        const evilDir = join(pendingRoot(), '.. escape')
        await mkdir(evilDir, { recursive: true })

        const result = await cleanupPendingWorkdirs({ workRoot: tempRoot })
        expect(result.removed).toBe(0)
        // 非法名目录保留
        const entries = await readdir(pendingRoot())
        expect(entries).toContain('.. escape')
    })

    it('非目录项（.meta.json 文件等）被跳过', async () => {
        await mkdir(pendingRoot(), { recursive: true })
        await writeFile(join(pendingRoot(), '.gitkeep'), '', 'utf-8')

        const result = await cleanupPendingWorkdirs({ workRoot: tempRoot })
        expect(result.removed).toBe(0)
        expect(result.skippedMissingMeta).toBe(0)
    })

    it('_pending 根不存在 → 零值（从未发生 PR 失败）', async () => {
        const result = await cleanupPendingWorkdirs({ workRoot: tempRoot })
        expect(result).toEqual({ removed: 0, skippedMissingMeta: 0, checkedAt: expect.any(String) })
    })

    it('默认 workRoot 走 RUN_WORK_ROOT env 或 data/runs（不抛错）', async () => {
        // 无 env 时默认 data/runs（相对路径）；目录可能不存在 → 零值
        const result = await cleanupPendingWorkdirs()
        expect(result.removed).toBe(0)
    })
})
