import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * _pending workDir 清理（2026-08-20）。
 *
 * 背景：2026-08-20 的 PR 失败保留链路 commit 引入 `moveToPending`（container-executor.ts:96）——push 成功 + PR 失败时把
 * workDir 移动到 `{workRoot}/_pending/{runId}/` 并写 `.meta.json`（含 expiresAt），保留 24h
 * 供失败诊断。但此前**没有任何机制清理 `_pending/` 下的过期目录**——PR 反复失败时目录
 * 无限堆积。本模块闭合该缺口。
 *
 * 设计要点：
 * - 按 `.meta.json` 的 `expiresAt` 判定过期（moveToPending 写入；默认 retentionMs = 24h）
 * - 防御性保留：无 `.meta.json` 或 expiresAt 缺失的目录**不删**（归属不明，避免误删
 *   正在写入 / 手动放置的诊断目录）
 * - runId 子目录名校验（`RUN_ID_PATTERN`；moveToPending 已校验，此处双保险防路径穿越）
 * - 清理失败静默（不影响其他目录 / 不阻断插件循环；下次重试）
 * - `_pending` 根目录不存在 → 返回零值（从未发生 PR 失败，无需清理）
 */

/** _pending workDir 清理结果 */
export interface CleanupPendingResult {
    /** 已删除的过期目录数 */
    removed: number
    /** 因缺失 .meta.json / expiresAt 而保留的目录数（防御性，通常为 0） */
    skippedMissingMeta: number
    /** 检查时刻（ISO 字符串，便于审计） */
    checkedAt: string
}

/** runId 子目录名白名单（与 container-executor.moveToPending 内联正则一致，双保险防路径穿越） */
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/

export const cleanupPendingWorkdirs = async (options: { workRoot?: string } = {}): Promise<CleanupPendingResult> => {
    const workRoot = options.workRoot ?? process.env.RUN_WORK_ROOT ?? 'data/runs'
    const pendingRoot = join(workRoot, '_pending')
    const now = new Date()
    let removed = 0
    let skippedMissingMeta = 0

    let entries: string[]
    try {
        entries = await readdir(pendingRoot)
    } catch {
        // _pending 不存在（从未发生 PR 失败）——无需清理
        return { removed: 0, skippedMissingMeta: 0, checkedAt: now.toISOString() }
    }

    for (const entry of entries) {
        const dir = join(pendingRoot, entry)

        // 仅处理目录（跳过 .meta.json 文件与其他非目录项）
        try {
            const st = await stat(dir)
            if (!st.isDirectory()) {
                continue
            }
        } catch {
            continue
        }

        // runId 名校验（防御路径穿越；moveToPending 已校验，此处双保险）
        if (!RUN_ID_PATTERN.test(entry)) {
            continue
        }

        // 读 .meta.json（缺失 / 非法 JSON / 缺 expiresAt → 防御性保留）
        let expiresAt: number | undefined
        try {
            const meta = JSON.parse(await readFile(join(dir, '.meta.json'), 'utf-8')) as { expiresAt?: string }
            if (typeof meta.expiresAt !== 'string') {
                skippedMissingMeta++
                continue
            }
            expiresAt = new Date(meta.expiresAt).getTime()
            if (!Number.isFinite(expiresAt)) {
                skippedMissingMeta++
                continue
            }
        } catch {
            skippedMissingMeta++
            continue
        }

        // 过期判定：now >= expiresAt → rm -rf（force，幂等）
        if (now.getTime() >= expiresAt) {
            try {
                await rm(dir, { recursive: true, force: true })
                removed++
            } catch {
                // 清理失败静默（下次重试；不阻断其他目录）
            }
        }
    }

    return { removed, skippedMissingMeta, checkedAt: now.toISOString() }
}
