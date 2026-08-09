// AI 输出安全校验与质量门（静态检查层）：
// 范围限制、路径穿越、敏感信息泄露、命令注入（package.json 执行面）。
// 动态质量门（install + lint + build 完整验证）由 app 层复用 verification-runner
// 执行（对齐跨线升级语义），本模块只做可静态判定的防线。

import type { AiFileChange } from './schema'
import { safeRelativePath } from './patch-applier'

export interface SafetyGateOptions {
    /** 单次变更最大文件数（默认 5） */
    maxFiles?: number
}

export interface SafetyGateResult {
    /** 是否可进入应用阶段（false = 拒绝，errors 说明原因） */
    ok: boolean
    errors: string[]
    /** 不阻塞但需人工关注的信号（如危险 shell 模式） */
    warnings: string[]
}

const DEFAULT_MAX_FILES = 5

/** 敏感信息模式（凭据/token/私钥）——命中即拒绝（防泄露进 PR/报告） */
const SECRET_PATTERNS: RegExp[] = [
    /sk-[a-zA-Z0-9]{16,}/, // OpenAI / DeepSeek 风格
    /sk-ant-[a-zA-Z0-9]{20,}/, // Anthropic 旧格式（sk-ant- 前缀 + 字母数字）
    /sk-ant-api03-[a-zA-Z0-9]{20,}/, // Anthropic 新格式（含 `-` 分隔段）
    /ghp_[a-zA-Z0-9]{30,}/, // GitHub classic PAT
    /github_pat_[a-zA-Z0-9_]{20,}/, // GitHub fine-grained PAT
    /gh[ous]_[a-zA-Z0-9]{20,}/, // GitHub App token（带长度约束防误报）
    /AKIA[0-9A-Z]{16}/, // AWS Access Key
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM 私钥
    /xox[baprs]-[a-zA-Z0-9-]{20,}/, // Slack token（带长度约束防误报）
]

/** 危险 shell 模式（仅检查 package.json 执行面——scripts/命令字段） */
const DANGEROUS_SHELL_PATTERNS: RegExp[] = [
    /rm\s+-rf\s+(?:\/|\$HOME|~)/, // 危险删除
    /curl[^\n|]*\|\s*(?:ba)?sh/, // 管道执行远程脚本
    /wget[^\n|]*\|\s*(?:ba)?sh/,
    /base64[^\n]*\|\s*(?:ba)?sh/,
    /eval\s*\(\s*process\.env/, // 动态执行环境变量
]

/**
 * AI 变更静态安全检查。
 *
 * 拒绝（error）：
 * - 变更集为空或超过 maxFiles（默认 5）
 * - filePath 路径穿越（复用 safeRelativePath）
 * - 变更内容含敏感信息（密钥/token/私钥）——防泄露进 PR/报告
 *
 * 警告（warn，不阻塞）：
 * - package.json 变更含危险 shell 模式（写入 scripts 等执行面，人工复核信号）
 *
 * 动态质量门（install + lint + build）由 app 层验证执行，不在此层。
 */
export function validateAiChanges(
    workDir: string,
    changes: AiFileChange[],
    options: SafetyGateOptions = {},
): SafetyGateResult {
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
    const errors: string[] = []
    const warnings: string[] = []

    if (changes.length === 0) {
        return { ok: false, errors: ['no file changes to apply'], warnings }
    }
    if (changes.length > maxFiles) {
        return {
            ok: false,
            errors: [`change set exceeds max files (${changes.length} > ${maxFiles})`],
            warnings,
        }
    }

    for (const change of changes) {
        // 路径安全（词法校验在 applier 与 gate 双重复用——同一实现，
        // 拒绝面完全对齐；符号链接逃逸为已登记的安全遗留项）
        const rel = safeRelativePath(workDir, change.filePath)
        if (rel === null) {
            errors.push(`unsafe filePath: ${change.filePath}`)
            continue
        }

        // 敏感信息（搜索/replace 内容都检查）
        const texts = [change.filePath, ...change.replace.flatMap((block) => [block.search, block.replace])]
        for (const text of texts) {
            if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
                errors.push(`potential secret material in change for "${change.filePath}"`)
                break
            }
        }

        // 命令注入（package.json 执行面——含子包 packages/*/package.json，
        // monorepo 中 scripts 执行面常态位于成员包）
        if (rel === 'package.json' || rel.endsWith('/package.json')) {
            for (const block of change.replace) {
                if (DANGEROUS_SHELL_PATTERNS.some((pattern) => pattern.test(block.replace))) {
                    warnings.push(
                        `dangerous shell pattern in package.json change for "${change.filePath}" — manual review required`,
                    )
                    break
                }
            }
        }
    }

    return { ok: errors.length === 0, errors, warnings }
}
