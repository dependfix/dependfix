// ---------------------------------------------------------------------------
// 产品 skill 安装器（dependfix skills install 核心）
// ---------------------------------------------------------------------------
// 语义：
// - 目标不存在 → 创建并复制（installed）
// - 目标已存在且内容一致 → 跳过（up-to-date，幂等）
// - 目标已存在但内容不一致 → 覆盖需确认（force 或交互确认；拒绝则 skipped-conflict）
// - dry-run 只输出将要执行的操作，不写文件
// 覆盖采用镜像语义：删除旧内容后全量复制，保证与权威源严格一致。

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCT_SKILL_NAME } from './source'

export type InstallStatus = 'installed' | 'up-to-date' | 'skipped-conflict' | 'failed'

export interface InstallResult {
    status: InstallStatus
    /** 安装目标目录（依赖 fix-and-pr 模式外，本为 dependfix-remediator 目录） */
    targetDir: string
    detail?: string
}

export interface InstallOptions {
    /** 权威源内容目录（含 SKILL.md） */
    sourceDir: string
    /** 目标 agent skills 目录（dependfix-remediator 将位于其下） */
    targetDir: string
    /** 强制覆盖（跳过确认） */
    force?: boolean
    /** 试运行：只输出将要执行的操作 */
    dryRun?: boolean
    /** 覆盖确认回调；缺省返回 false（非交互默认拒绝，不静默覆盖） */
    confirmOverwrite?: (existingDir: string) => Promise<boolean> | boolean
}

/** 收集目录内文件相对路径 -> sha256（递归） */
export function collectFileHashes(dir: string): Map<string, string> {
    const result = new Map<string, string>()
    if (!existsSync(dir)) {
        return result
    }
    const walk = (current: string, relPrefix: string) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = join(current, entry.name)
            const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
            if (entry.isDirectory()) {
                walk(full, rel)
            } else if (entry.isFile()) {
                result.set(rel, hashFile(full))
            }
        }
    }
    walk(dir, '')
    return result
}

function hashFile(filePath: string): string {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

/** 两个目录内容是否完全一致（文件集合 + 内容 hash） */
export function isContentSame(dirA: string, dirB: string): boolean {
    const mapA = collectFileHashes(dirA)
    const mapB = collectFileHashes(dirB)
    if (mapA.size !== mapB.size) {
        return false
    }
    for (const [rel, hash] of mapA) {
        if (mapB.get(rel) !== hash) {
            return false
        }
    }
    return true
}

/** 复制目录（镜像语义：先清空目标内同名子目录再复制） */
function mirrorCopy(sourceDir: string, targetSkillDir: string): void {
    rmSync(targetSkillDir, { recursive: true, force: true })
    mkdirSync(targetSkillDir, { recursive: true })
    for (const entry of readdirSync(sourceDir)) {
        const src = join(sourceDir, entry)
        const dst = join(targetSkillDir, entry)
        if (statSync(src).isDirectory()) {
            cpSync(src, dst, { recursive: true })
        } else {
            cpSync(src, dst)
        }
    }
}

/**
 * 安装产品 skill 到单个 agent skills 目录。
 * 返回 InstallResult；失败时 status='failed' 且 detail 含错误信息（不抛错，便于批量收尾）。
 */
export async function installSkillToDir(options: InstallOptions): Promise<InstallResult> {
    const { sourceDir, targetDir, force, dryRun, confirmOverwrite } = options
    const skillTarget = join(targetDir, PRODUCT_SKILL_NAME)

    if (!existsSync(sourceDir)) {
        return { status: 'failed', targetDir, detail: `权威源不存在: ${sourceDir}` }
    }

    if (dryRun) {
        try {
            const same = existsSync(skillTarget) && isContentSame(sourceDir, skillTarget)
            return same
                ? { status: 'up-to-date', targetDir, detail: '[dry-run] 已一致' }
                : { status: 'installed', targetDir, detail: '[dry-run] 将安装' }
        } catch (error: unknown) {
            return { status: 'failed', targetDir, detail: errorMessage(error) }
        }
    }

    if (!existsSync(skillTarget)) {
        try {
            mirrorCopy(sourceDir, skillTarget)
            return { status: 'installed', targetDir }
        } catch (error: unknown) {
            cleanupPartial(skillTarget)
            return { status: 'failed', targetDir, detail: errorMessage(error) }
        }
    }

    // 已存在：内容一致则幂等跳过
    let same: boolean
    try {
        same = isContentSame(sourceDir, skillTarget)
    } catch (error: unknown) {
        return { status: 'failed', targetDir, detail: errorMessage(error) }
    }
    if (same) {
        return { status: 'up-to-date', targetDir }
    }

    // 内容不一致：需要确认覆盖（非交互默认拒绝）
    const allowed = force ?? (confirmOverwrite ? await confirmOverwrite(skillTarget) : false)
    if (!allowed) {
        return {
            status: 'skipped-conflict',
            targetDir,
            detail: '目标存在内容不一致的同名 skill，已跳过（使用 --force 或交互确认覆盖）',
        }
    }

    try {
        mirrorCopy(sourceDir, skillTarget)
        return { status: 'installed', targetDir, detail: '已覆盖旧版本' }
    } catch (error: unknown) {
        cleanupPartial(skillTarget)
        return { status: 'failed', targetDir, detail: errorMessage(error) }
    }
}

/** mirrorCopy 失败后清理半写目录（避免下次安装误判为内容不一致需 force） */
function cleanupPartial(skillTarget: string): void {
    try {
        rmSync(skillTarget, { recursive: true, force: true })
    } catch {
        // 清理失败不掩盖原始错误
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
