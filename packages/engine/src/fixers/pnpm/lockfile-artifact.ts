// lockfile-artifact.ts — 锁文件修复的产物判据与备份 / 移出管理。
//
// 从 index.ts 拆出（该文件接近 max-lines 上限）：只负责「修复前备份 → 策略前移出 →
// 失败恢复 → 结果产物校验」，不包含诊断与策略链编排。
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** 目标锁文件名（仓库根）。 */
export const LOCKFILE_NAME = 'pnpm-lock.yaml'

/**
 * 备份 pnpm-lock.yaml → `<name>.bak`，返回备份路径。
 * 原锁文件不存在时不创建 .bak（回滚以 bak 是否存在区分「原本有无锁文件」）。
 */
export function backupLockfilePath(workDir: string): string {
    const src = join(workDir, LOCKFILE_NAME)
    const bak = `${src}.bak`
    if (existsSync(src)) {
        copyFileSync(src, bak)
    }
    return bak
}

/** 从 .bak 还原 lockfile，并删除 .bak。 */
export function rollback(bakPath: string, workDir: string): void {
    const target = join(workDir, LOCKFILE_NAME)
    try {
        if (existsSync(bakPath)) {
            copyFileSync(bakPath, target)
        }
    } finally {
        try {
            rmSync(bakPath)
        } catch {
            /* ignore */
        }
    }
}

/**
 * 结构兜底的前置动作：把当前锁文件移到 `<name>.broken` 并返回该路径。
 *
 * 移出而不是删除——覆盖 rename 失败等异常的兜底由调用方处理；文件不存在时返回 undefined。
 */
export function moveLockfileAside(workDir: string): string | undefined {
    const src = join(workDir, LOCKFILE_NAME)
    if (!existsSync(src)) {
        return undefined
    }
    const aside = `${src}.broken`
    try {
        removeQuietly(aside)
        renameSync(src, aside)
        return aside
    } catch {
        // 移出失败：保留原文件，退化为原地策略（策略命令自身会失败并被记为一次尝试）
        return undefined
    }
}

/**
 * 从 .bak 复制回锁文件但**保留** .bak（供后续策略与最终回滚继续使用）。
 *
 * 返回是否已恢复到本次修复前的状态：`false` 时调用方**不得**删除移出件
 * （宁可留下 `.broken` 证据，也不能让锁文件凭空消失）。
 */
export function restoreLockfileFromBackup(bakPath: string, workDir: string): boolean {
    if (!existsSync(bakPath)) {
        // 原本就没有锁文件：清掉策略可能生成的部分产物，回到「无锁文件」起点
        removeQuietly(join(workDir, LOCKFILE_NAME))
        return true
    }
    try {
        copyFileSync(bakPath, join(workDir, LOCKFILE_NAME))
        return true
    } catch {
        return false
    }
}

export function removeQuietly(path: string): void {
    try {
        rmSync(path, { force: true })
    } catch {
        /* ignore */
    }
}

/**
 * 修复产物判据：锁文件必须存在且可被 YAML 解析（含 `lockfileVersion`）。
 *
 * 不能只信 pnpm 退出码 / frozen 安装结论：`node_modules` 已是最新（`node_modules/.pnpm/lock.yaml`
 * 与 `.modules.yaml` 命中）时，pnpm 对 `install` 直接输出 `Already up to date` 并返回 0——
 * 既可能在 `--lockfile-only` 下不重建被移出的锁文件，也会让 `--frozen-lockfile` 在锁文件缺失 /
 * 结构损坏时短路通过。`yaml` 解析对重复 key 严格报错，正好覆盖「duplicated mapping key」形态。
 */
export function inspectLockfileArtifact(workDir: string): { ok: boolean, reason?: string } {
    const lockfilePath = join(workDir, LOCKFILE_NAME)
    if (!existsSync(lockfilePath)) {
        return {
            ok: false,
            reason: 'lockfile missing after the command (pnpm can exit 0 without writing it when node_modules is already up to date)',
        }
    }
    let content: string
    try {
        content = readFileSync(lockfilePath, 'utf-8')
    } catch (error: unknown) {
        return { ok: false, reason: `lockfile unreadable: ${error instanceof Error ? error.message : String(error)}` }
    }
    try {
        const parsed = parseYaml(content) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, reason: 'lockfile is not a pnpm lockfile (root is not a mapping)' }
        }
        const version = (parsed as Record<string, unknown>).lockfileVersion
        if (typeof version !== 'string' && typeof version !== 'number') {
            return { ok: false, reason: 'lockfile is not a pnpm lockfile (missing lockfileVersion)' }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
        return { ok: false, reason: `lockfile is not valid YAML: ${message}` }
    }
    return { ok: true }
}
