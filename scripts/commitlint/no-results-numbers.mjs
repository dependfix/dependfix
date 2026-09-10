/**
 * commitlint plugin: no-results-numbers
 *
 * 拦截 commit message 中包含执行结果数字的写法（如 `0 error` / `N passed` / `EXIT=0` / `0 blocker / 3 warning / 2 suggest`）。
 * 完整规则集见 docs/standard/git.md §3.6 第 2 条「不写执行结果数字」+ ai-collaboration.md §1.6。
 *
 * 例外（不视为违规）：
 * - 主题中的日期数字（如 `2026-09-10`）
 * - 主题中的版本号（如 `1.2.3`）
 * - 主题中的 commit hash 短引用（如 `357f6ec`）
 * - 行内 commit hash 引用（如 `commit 357f6ec` / `关联 commit：357f6ec`）
 */

const RESULTS_PATTERNS = [
    // ESLint 错误数：`0 error` / `5 errors` / `1 warning` / `N warning`
    /\b\d+\s+(error|errors|warning|warnings)\b/i,
    // commit message 中 `N passed` / `N failed` / `N skipped` 形式（vitest / jest 报告格式）
    /\b\d+\s+(passed|failed|skipped)\b/i,
    // EXIT 状态：`EXIT=0` / `EXIT=1`
    /\bEXIT=\d+\b/,
    // audit 结论：`0 blocker` / `1 warning` / `2 suggest`
    /\b\d+\s+(blocker|warning|suggest)\b/i,
    // coverage 百分比：`80%` / `99.46%` / `0%`
    /\b\d+(?:\.\d+)?%/,
    // audit 数字组合：`0 blocker / 3 warning / 2 suggest`
    /\d+\s+blocker\s*[/／]\s*\d+\s+warning\s*[/／]\s*\d+\s+suggest/i,
    // ahead commits 数字（保留除外，允许 `ahead=N` 但不允许作为结果数字描述）
    /\b(ahead|behind)\s*=\s*\d+/i,
    // 测试断言行数引用（如 `L42-43` 不算违规；`L42` 是行号标识；但 `L42 cases` 算违规）
    /\bL\d+\s+(cases|files?|commits)\b/i,
]

export default {
    rules: {
        /**
         * @param {object} parsed - commitlint 解析对象
         * @param {string} when - 'always' | 'never'
         * @returns {Promise<[boolean, string]>}
         */
        'no-results-numbers': async (parsed, when = 'always') => {
            if (when !== 'always') {
                return [true, '']
            }

            // 只检查 body + footer（header 主题行可能含日期 / 版本号 / commit hash 短引用）
            const bodyText = [parsed.body, parsed.footer].filter(Boolean).join('\n')

            if (!bodyText) {
                return [true, '']
            }

            for (const pattern of RESULTS_PATTERNS) {
                const match = bodyText.match(pattern)
                if (match) {
                    return [
                        false,
                        `commit message 正文包含执行结果数字「${match[0]}」；git.md §3.6 第 2 条：不写执行结果数字`,
                    ]
                }
            }

            return [true, '']
        },
    },
}
