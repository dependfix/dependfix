import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { FixAction, NormalizedSecurityAlert } from '@dependfix/core'
import { getCodeScanningFixTemplate } from './templates'

// ---------------------------------------------------------------------------
// Code Scanning 模板化修复执行器（T303，替换 M0 stub）
//
// 职责边界：
// - 模板选择 + 补丁生成 + 文件读写（本文件）
// - 验证与回滚由 app 层负责（quickVerifyProject + restoreSourceFile，
//   源码文件不在 snapshotTrackedFiles 的清单快照范围内，必须单独快照）
//
// 三态语义（不静默、可审计）：
// - success:true（实际修复）→ 计入 fixed
// - noOp:true（已合规 / 无法安全处理 / 陈旧告警缺文件）→ 不计 fixed/failed，
//   报告显示 Skipped 但 error 中可见原因（避免陈旧告警造成永久 exit 1/2）
// - success:false（写盘失败等真实失败）→ 计入 failed
// ---------------------------------------------------------------------------

export interface ApplyCodeScanningFixParams {
    /** 工作目录（告警 manifestPath 为相对路径，resolve 后读取） */
    workDir: string
    alert: NormalizedSecurityAlert
    /** dry-run：只生成补丁不写盘 */
    dryRun?: boolean
}

/**
 * 应用单个 Code Scanning 告警的模板修复。
 *
 * 仅处理 `source === 'code-scanning'` 且 `alertClass === 'auto-fixable'` 的告警；
 * 其余返回 `null`（调用方不生成动作记录）。
 */
export function applyCodeScanningFix(params: ApplyCodeScanningFixParams): FixAction | null {
    const { workDir, alert, dryRun } = params

    if (alert.source !== 'code-scanning' || alert.alertClass !== 'auto-fixable') {
        return null
    }
    const startMs = Date.now()

    /** 无法安全处理（陈旧告警/缺模板/歧义）→ noOp 标记，不计 failed（避免永久 exit 1/2） */
    const skip = (reason: string): FixAction => ({
        type: 'code-scanning-fix',
        repository: alert.repository,
        target: alert.ruleId,
        fromVersion: undefined,
        toVersion: undefined,
        isMajor: false,
        success: true,
        noOp: true,
        filePath: alert.manifestPath || undefined,
        error: reason,
        durationMs: Date.now() - startMs,
    })

    /** 真实失败（写盘失败等）→ 计入 failed */
    const fail = (reason: string): FixAction => ({
        type: 'code-scanning-fix',
        repository: alert.repository,
        target: alert.ruleId,
        fromVersion: undefined,
        toVersion: undefined,
        isMajor: false,
        success: false,
        filePath: alert.manifestPath || undefined,
        error: reason,
        durationMs: Date.now() - startMs,
    })

    if (!alert.manifestPath) {
        return skip('no file path available for code-scanning fix (manifestPath is empty)')
    }

    const filePath = resolveWithinWorkDir(workDir, alert.manifestPath)
    if (!filePath) {
        return skip(`refusing to fix outside work dir: ${alert.manifestPath}`)
    }

    const template = getCodeScanningFixTemplate(alert.ruleId)
    if (!template) {
        return skip(`no fix template for rule "${alert.ruleId}" — falling back to suggestion mode`)
    }

    let content: string
    try {
        content = readFileSync(filePath, 'utf-8')
    } catch (error) {
        return skip(`cannot read ${alert.manifestPath} (stale alert?): ${error instanceof Error ? error.message : String(error)}`)
    }

    const result = template.apply(filePath, content, alert)
    if (!result) {
        return skip(`template not applicable for "${alert.ruleId}" at ${alert.manifestPath} — falling back to suggestion mode`)
    }

    if (!result.changed) {
        // 文件已合规（告警实例可能已过时/多实例）：不算失败，标记 noOp（不计入 fixed）
        return {
            type: 'code-scanning-fix',
            repository: alert.repository,
            target: alert.ruleId,
            fromVersion: undefined,
            toVersion: undefined,
            isMajor: false,
            success: true,
            noOp: true,
            filePath: alert.manifestPath,
            diff: template.describe(alert.manifestPath, false, alert),
            durationMs: Date.now() - startMs,
        }
    }

    if (!dryRun) {
        try {
            writeFileSync(filePath, result.content, 'utf-8')
        } catch (error) {
            return fail(`cannot write ${alert.manifestPath}: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    return {
        type: 'code-scanning-fix',
        repository: alert.repository,
        target: alert.ruleId,
        fromVersion: undefined,
        toVersion: undefined,
        isMajor: false,
        success: true,
        filePath: alert.manifestPath,
        diff: template.describe(alert.manifestPath, true, alert),
        durationMs: Date.now() - startMs,
    }
}

// ---------------------------------------------------------------------------
// 源码文件快照/恢复（B1：snapshotTrackedFiles 仅覆盖清单文件，
// code-scanning fix 修改任意源码文件，必须单独快照目标文件本身）
// ---------------------------------------------------------------------------

export interface SourceFileSnapshot {
    /** 相对路径（告警 manifestPath） */
    path: string
    /** 快照时文件是否存在 */
    existed: boolean
    /** 文件内容（existed 为 true 时有效） */
    content: string | null
}

/**
 * 快照单个源码文件（修复前调用；文件不存在时记录 existed:false）。
 * 路径越界返回 null；读取失败返回 null（调用方按失败处理，不中断主流程）。
 */
export function snapshotSourceFile(workDir: string, relativePath: string): SourceFileSnapshot | null {
    const filePath = resolveWithinWorkDir(workDir, relativePath)
    if (!filePath) {
        return null
    }
    if (!existsSync(filePath)) {
        return { path: relativePath, existed: false, content: null }
    }
    try {
        return { path: relativePath, existed: true, content: readFileSync(filePath, 'utf-8') }
    } catch {
        return null
    }
}

/**
 * 恢复源码文件（验证失败回滚；原不存在的文件将被删除）。
 * 返回是否恢复成功（写回/删除失败返回 false，调用方在 action.error 记录"可能残留"）。
 */
export function restoreSourceFile(workDir: string, snapshot: SourceFileSnapshot): boolean {
    const filePath = resolveWithinWorkDir(workDir, snapshot.path)
    if (!filePath) {
        return false
    }
    if (!snapshot.existed || snapshot.content === null) {
        if (existsSync(filePath)) {
            try {
                unlinkSync(filePath)
                return true
            } catch {
                return false // 无法回滚到"不存在"状态
            }
        }
        return true
    }
    try {
        writeFileSync(filePath, snapshot.content, 'utf-8')
        return true
    } catch {
        return false // 写回失败，文件可能停留中间态
    }
}

/**
 * 将相对路径解析到工作目录内（W5：防 `../` 与绝对路径逃逸；C5：防符号链接逃逸）。
 * 返回 null 表示越界（调用方拒绝处理）。
 *
 * C5（安全加固）：词法校验（resolve + startsWith）不足以防御符号链接——
 * 工作区内 `src/link → /外部/目录` 词法上仍在 workDir 内，但 realpath 指向外部。
 * 因此对目标做 realpath 校验：目标文件存在 → realpath 文件本身必须在 workDir
 * realpath 内；不存在 → 逐级向上对最近存在的父目录做 realpath 校验。
 * 返回**真实路径**（后续读写走真实路径，避免再次经过 symlink）。
 */
export function resolveWithinWorkDir(workDir: string, relativePath: string): string | null {
    const root = resolve(workDir)
    const target = resolve(root, relativePath)
    if (target === root) {
        return null
    }
    if (!target.startsWith(root + sep)) {
        return null
    }

    // C5：realpath 校验（目标存在 → 校验文件本身；不存在 → 校验最近存在的父目录）
    try {
        const realRoot = realpathSync(root)
        if (existsSync(target)) {
            const realTarget = realpathSync(target)
            return realTarget.startsWith(realRoot + sep) || realTarget === realRoot
                ? realTarget
                : null
        }

        // 目标不存在（快照/新建场景）：逐级向上找最近存在的父目录
        let dir = dirname(target)
        const missingTail: string[] = []
        while (dir !== realRoot && !existsSync(dir)) {
            missingTail.unshift(basename(dir))
            dir = dirname(dir)
        }
        const realDir = realpathSync(dir)
        if (realDir !== realRoot && !realDir.startsWith(realRoot + sep)) {
            return null
        }
        return join(realDir, ...missingTail, basename(target))
    } catch {
        // realpath 失败（权限、不可解析等）→ 保守拒绝
        return null
    }
}
