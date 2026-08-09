// AI 研判输出 schema（Zod）与解析：结构化修改（search/replace 块）而非 raw diff，
// 让应用层可控、质量门可校验。

import { z } from 'zod'

export const replaceBlockSchema = z.object({
    /**
     * 需匹配的原文（唯一性校验在应用层：同文件多块必须精确匹配且互不重叠）。
     * 允许空串：仅"新建文件"场景合法（应用层按文件存在性决定语义——
     * 既有文件空 search 拒绝）。
     */
    search: z.string().max(20_000, 'search too long'),
    /** 替换后的内容（可为空字符串 = 删除） */
    replace: z.string().max(20_000, 'replace too long'),
})

export const fileChangeSchema = z.object({
    /** 相对工作区根的文件路径（应用层校验路径穿越） */
    filePath: z.string().min(1, 'filePath must not be empty').max(1_000, 'filePath too long'),
    replace: z.array(replaceBlockSchema).min(1, 'at least one replace block required').max(100, 'too many replace blocks'),
})

export const assessmentSchema = z.object({
    /**
     * 研判结论：
     * - code-change：需要代码修改（changes 给出结构化修改）
     * - version-lock：锁定/回退版本可规避 breaking（应用层生成 override）
     * - wait-upstream：上游未修复，等待（应用层输出说明）
     * - manual：需人工处理（应用层输出建议）
     */
    classification: z.enum(['code-change', 'version-lock', 'wait-upstream', 'manual']),
    /** 研判摘要（人类可读） */
    summary: z.string().min(1, 'summary must not be empty').max(2_000, 'summary too long'),
    /** 代码修改（classification=code-change 时应有内容；其他分类可为空数组） */
    changes: z.array(fileChangeSchema).max(50, 'too many changed files').default([]),
    /** 置信度 0-1 */
    confidence: z.number().min(0).max(1),
    /** 研判依据（引用 breaking 条目/失败日志） */
    rationale: z.string().max(8_000, 'rationale too long').default(''),
})

export type AiAssessment = z.infer<typeof assessmentSchema>
export type AiFileChange = z.infer<typeof fileChangeSchema>
export type AiReplaceBlock = z.infer<typeof replaceBlockSchema>

export type ParseAssessmentResult =
    | { ok: true, value: AiAssessment }
    | { ok: false, error: string }

/**
 * 解析 AI 输出为结构化研判。
 *
 * 兼容两种输出形态：
 * - 纯 JSON（`{...}`）
 * - Markdown 代码块（```json ... ``` / ``` ... ```）
 *
 * 校验失败返回带原因的降级信号（调用方重试一次后降级建议模式）。
 */
export function parseAssessment(text: string): ParseAssessmentResult {
    const jsonText = extractJson(text)
    if (jsonText === null) {
        return { ok: false, error: 'no JSON object found in AI output' }
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch (error: unknown) {
        return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` }
    }
    const result = assessmentSchema.safeParse(parsed)
    if (!result.success) {
        const details = result.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
            .join('; ')
        return { ok: false, error: `schema validation failed: ${details}` }
    }
    return { ok: true, value: result.data }
}

/** 从输出中提取 JSON 候选（整体 JSON 或代码块内容） */
function extractJson(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed) {
        return null
    }
    if (trimmed.startsWith('{')) {
        return trimmed
    }
    // ```json ... ``` 或 ``` ... ``` 代码块（贪婪取第一个完整块）
    const block = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
    return block ? block[1].trim() : null
}
