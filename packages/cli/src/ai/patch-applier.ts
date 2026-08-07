// 修复方案生成器：结构化 changes 应用（search 精确匹配 + 唯一性校验），
// 应用前备份、失败自动回滚；版本锁定声明生成；等待上游说明生成。
// 不做 raw diff 解析——AI 输出经 schema 校验后即为受控结构。

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { AiAssessment, AiFileChange } from './schema'

export interface ApplyChangesResult {
    success: boolean
    /** 实际修改的文件（相对路径） */
    appliedFiles: string[]
    /** 失败原因（success=false 时） */
    error?: string
    /**
     * 回滚函数：恢复应用前状态（含新增文件删除）。
     * 调用方在质量门失败时必须调用；成功路径可调用以清理备份。
     */
    rollback: () => void
}

/**
 * 应用 AI 结构化修改到工作区。
 *
 * 规则：
 * - 每个 replace 块的 search 必须在目标文件**原始内容**中恰好出现一次
 *   （0 次 → not found；多次 → not unique，均失败并回滚）
 * - 替换基于原始内容执行（块之间互不干扰），按出现位置从后往前替换
 *   （避免位置偏移）
 * - 目标文件不存在 → 视为新建：该文件的 replace 必须为单块且 search 为空串
 *   （整文件内容 = replace）
 * - 失败自动回滚全部已应用修改；成功返回 rollback 供质量门阶段兜底
 */
export function applyChanges(workDir: string, changes: AiFileChange[]): ApplyChangesResult {
    // ---- 1. 预检：路径安全 + search 唯一性 + 重复文件 + 块重叠 ----
    type FilePlan = {
        filePath: string
        content: string | null // null = 文件不存在（新建）
        blocks: AiFileChange['replace']
    }
    const plans: FilePlan[] = []
    const backup = new Map<string, string>()
    const seenFiles = new Set<string>()

    for (const change of changes) {
        // 路径穿越防护（防御纵深：schema 校验 + 应用层再次确认）
        const rel = safeRelativePath(workDir, change.filePath)
        if (rel === null) {
            return failure(`filePath escapes workspace: ${change.filePath}`, [], () => undefined)
        }
        // 重复 filePath 拒绝（避免静默覆盖）
        if (seenFiles.has(rel)) {
            return failure(`duplicate filePath in changes: "${rel}"`, [], () => undefined)
        }
        seenFiles.add(rel)
        const absolute = join(workDir, rel)

        const content = existsSync(absolute) ? readFileSync(absolute, 'utf-8') : null
        if (content === null) {
            // 新建文件：单块 + search 为空（整文件内容 = replace）
            if (change.replace.length !== 1 || change.replace[0].search !== '') {
                return failure(
                    `new file "${change.filePath}" requires a single empty-search block (full content)`,
                    [],
                    () => undefined,
                )
            }
            plans.push({ filePath: rel, content: null, blocks: change.replace })
            continue
        }

        // 唯一性 + 重叠校验（在原始内容上；空 search 在既有文件上视为非法）
        const positions: Array<{ search: string, index: number }> = []
        for (const block of change.replace) {
            if (block.search === '') {
                return failure(`empty search block is only allowed for new files ("${change.filePath}")`, [], () => undefined)
            }
            const occurrences = countOccurrences(content, block.search)
            if (occurrences === 0) {
                return failure(`search not found in "${rel}"`, [], () => undefined)
            }
            if (occurrences > 1) {
                return failure(`search not unique in "${rel}" (${occurrences} occurrences)`, [], () => undefined)
            }
            positions.push({ search: block.search, index: content.indexOf(block.search) })
        }
        // 相邻块重叠检查（排序后 index + len > nextIndex → 重叠）
        positions.sort((a, b) => a.index - b.index)
        for (let i = 0; i < positions.length - 1; i += 1) {
            if (positions[i].index + positions[i].search.length > positions[i + 1].index) {
                return failure(`overlapping search blocks in "${rel}"`, [], () => undefined)
            }
        }
        plans.push({ filePath: rel, content, blocks: change.replace })
    }

    // ---- 2. 备份 + 应用（写盘失败自动回滚全部）----
    const appliedFiles: string[] = []
    const createdFiles: string[] = []
    try {
        for (const plan of plans) {
            const absolute = join(workDir, plan.filePath)
            if (plan.content !== null) {
                backup.set(plan.filePath, plan.content)
            } else {
                // 新建文件：创建前登记（mkdirSync 成功后 writeFileSync 失败也可回滚清理）
                createdFiles.push(plan.filePath)
            }
            let result: string
            if (plan.content !== null) {
                // 从后往前替换（基于原始内容的位置计算，块间互不干扰）
                const positions = plan.blocks
                    .map((block) => ({ block, index: plan.content!.indexOf(block.search) }))
                    .sort((a, b) => b.index - a.index)
                result = plan.content
                for (const { block, index } of positions) {
                    result = `${result.slice(0, index)}${block.replace}${result.slice(index + block.search.length)}`
                }
            } else {
                result = plan.blocks[0].replace
            }
            mkdirSync(dirname(absolute), { recursive: true })
            writeFileSync(absolute, result, 'utf-8')
            appliedFiles.push(plan.filePath)
        }
    } catch (error: unknown) {
        // 写盘失败：恢复备份 + 删除新建文件（含半写文件），返回 failure
        rollbackApplied(workDir, backup, appliedFiles, createdFiles)
        return {
            success: false,
            appliedFiles,
            error: `failed to write changes: ${error instanceof Error ? error.message : String(error)}`,
            rollback: () => undefined,
        }
    }

    return {
        success: true,
        appliedFiles,
        rollback: () => rollbackApplied(workDir, backup, appliedFiles, createdFiles),
    }
}

/**
 * 回滚已应用的修改：恢复备份文件 + 删除新建文件（含半写残留）。
 * 单文件操作各自 try/catch（回滚失败不中断其余文件）。
 */
function rollbackApplied(
    workDir: string,
    backup: Map<string, string>,
    appliedFiles: string[],
    createdFiles: string[],
): void {
    for (const [filePath, content] of backup) {
        try {
            writeFileSync(join(workDir, filePath), content, 'utf-8')
        } catch {
            // 恢复失败静默（保留文件，不中断回滚流程）
        }
    }
    // 删除新建文件（createdFiles 含写盘前登记，覆盖半写残留）——单文件明确路径删除
    for (const filePath of [...new Set([...createdFiles, ...appliedFiles.filter((f) => !backup.has(f))])]) {
        const absolute = join(workDir, filePath)
        if (existsSync(absolute)) {
            try {
                unlinkSync(absolute)
            } catch {
                // 回滚删除失败静默（保留文件，不抛异常）
            }
        }
    }
}

/**
 * 生成版本锁定 override 声明（classification=version-lock）。
 *
 * 返回 `pkg@version: spec` 形态的版本化 override 键值（pnpm-workspace.yaml
 * overrides 语义），写入由 app 层复用既有 override 修复链路完成。
 * 版本严格 semver（锚定结尾，防 YAML 注入面）。
 *
 * @returns null 表示版本/包名不合法无法生成
 */
export function buildVersionLockOverride(
    packageName: string,
    version: string,
): { key: string, value: string } | null {
    const clean = version.trim()
    const name = packageName.trim()
    // 严格 semver（可选 pre-release/build 后缀，锚定结尾）
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(clean)) {
        return null
    }
    // 包名白名单形态：scoped（@scope/name）或普通包名；段以字母数字开头
    // （防 `..`/`../` 起始的路径穿越形态）
    if (!/^@?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/i.test(name)) {
        return null
    }
    // 版本化 override：只影响该版本实例（与既有版本化 overrides 语义一致）
    return { key: `${name}@${clean}`, value: clean }
}

/**
 * 生成"等待上游"说明文档内容（classification=wait-upstream）。
 * 供报告建议区块 / PR body 使用。
 */
export function buildWaitUpstreamNote(assessment: AiAssessment): string {
    const summary = assessment.summary.trim()
    const rationale = assessment.rationale.trim()
    const lines = ['### 等待上游修复', '']
    if (summary) {
        lines.push(summary, '')
    }
    if (rationale) {
        lines.push(`**依据**: ${rationale}`, '')
    }
    lines.push('该升级已暂缓自动修复，待上游发布修复版本后重试。', '')
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 校验相对路径并返回规范化后的 POSIX 相对路径。
 *
 * - 拒绝绝对路径、`..` 跳转、空路径
 * - 允许嵌套子目录（packages/web/src/a.ts）
 *
 * @returns 规范化相对路径；非法返回 null
 */
export function safeRelativePath(baseDir: string, filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/')
    if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
        return null
    }
    const absolute = resolve(baseDir, normalized)
    const rel = relative(resolve(baseDir), absolute)
    if (rel === '' || rel === '.' || rel.startsWith(`..${sep}`) || rel === '..' || rel.includes(`..${sep}`)) {
        return null
    }
    // Windows 盘符跨盘（resolve 已处理，双保险）
    if (/^[a-zA-Z]:/.test(rel)) {
        return null
    }
    return rel.split(sep).join('/')
}

function countOccurrences(haystack: string, needle: string): number {
    let count = 0
    let index = haystack.indexOf(needle)
    while (index !== -1) {
        count += 1
        index = haystack.indexOf(needle, index + needle.length)
    }
    return count
}

function failure(
    error: string,
    appliedFiles: string[],
    rollback: () => void,
): ApplyChangesResult {
    return { success: false, appliedFiles, error, rollback }
}
