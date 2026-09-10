/**
 * commitlint plugin: no-diff-stats
 *
 * 拦截 commit message 中包含改动行数描述的写法（如 `+N/-M` / `N files changed` / `~N 行净增`）。
 * 完整规则集见 docs/standard/git.md §3.6 第 3 条「不写改动行数」+ ai-collaboration.md §1.6。
 *
 * 例外（不视为违规）：
 * - commit hash 引用（如 `关联 commit：357f6ec`）
 * - 主题中的版本号（如 `v1.2.3`）
 */

const DIFF_STAT_PATTERNS = [
    // git diff 风格：`+189/-3` / `+10 / -5` / `+0/-2`
    /\+\d+\s*[/／]\s*-\d+/,
    // 净增行数：`~3240 行净增` / `约 1130 行` / `+ 1500 行`
    /~?\s*\d+\s*(?:行|行\s*净增|行\s*新增)/,
    // files changed：`4 files changed` / `17 files` / `4 file`
    /\b\d+\s+files?\s+changed\b/i,
    // 行净增 / 行新增描述
    /\d+\s*行\s*净增/,
    /\d+\s*行\s*新增/,
    // commits 数量描述（区别于 commit hash 引用）：`5 commits ahead` / `36 commits`
    /\b\d+\s+commits\b/i,
    // git diff 数字组合（紧贴 +/- 后无空格）：`+123` `-456` 在行内上下文
    // 排除列表项 `- 5 个`（有空格）
    /[+-]\d+(?=\s|$|[,，])/,
]

export default {
    rules: {
        /**
         * @param {object} parsed - commitlint 解析对象
         * @param {string} when - 'always' | 'never'
         * @returns {Promise<[boolean, string]>}
         */
        'no-diff-stats': async (parsed, when = 'always') => {
            if (when !== 'always') {
                return [true, '']
            }

            // 检查 body + footer
            const bodyText = [parsed.body, parsed.footer].filter(Boolean).join('\n')

            if (!bodyText) {
                return [true, '']
            }

            for (const pattern of DIFF_STAT_PATTERNS) {
                const match = bodyText.match(pattern)
                if (match) {
                    return [
                        false,
                        `commit message正文包含改动行数描述「${match[0]}」；git.md §3.6 第 3 条：不写改动行数（git diff 直接可见）`,
                    ]
                }
            }

            return [true, '']
        },
    },
}
