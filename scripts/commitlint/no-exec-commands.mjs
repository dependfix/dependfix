/**
 * commitlint plugin: no-exec-commands
 *
 * 拦截 commit message 中包含执行命令的写法（如 `pnpm run` / `git rev-list` / `node scripts/`）。
 * 完整规则集见 docs/standards/git.md §3.6 第 1 条「不写执行命令」+ ai-collaboration.md §1.6。
 *
 * commitlint plugin 接口：`async (parsed, when, value) => [boolean, string]`
 * - parsed: commitlint 解析后的 commit 对象（含 header / body / footer / type / scope / subject）
 * - when: 'always' | 'never'（来自 rule config 第 2 项）
 * - 返回 [valid, message]：valid=true 通过；valid=false 失败 + message 错误说明
 */

const EXEC_COMMAND_PATTERNS = [
    // shell 命令前缀（放最前，避免被后续 pnpm/npm 正则先匹配）
    /\$\s*(pnpm|npm|yarn|git|node|npx)\b/,
    // pnpm 系列（执行命令而非描述工具）
    /\bpnpm\s+(run|install|i|add|remove|update|test|lint|typecheck|exec|filter|--filter|-r|-F|-w|workspace|recursive)\b/,
    // npm 系列
    /\bnpm\s+(run|install|i|test|lint|typecheck|exec|ci|publish)\b/,
    // yarn 系列
    /\byarn\s+(run|install|add|test|lint|typecheck)\b/,
    // git 系列（read-only 命令也算违规，因为 commit message 应说"做了什么"而非"跑了什么命令"）
    /\bgit\s+(rev-list|log|status|diff|show|fetch|pull|push|rebase|merge|reset|checkout|branch)\b/,
    // node 直接执行
    /\bnode\s+scripts\//,
    // npx 执行（lint-staged / commitlint 等）
    /\bnpx\s+(commitlint|lint-staged|husky|eslint|prettier|vitest)\b/,
]

export default {
    rules: {
        /**
         * @param {object} parsed - commitlint 解析对象
         * @param {string} when - 'always' | 'never'
         * @returns {Promise<[boolean, string]>}
         */
        'no-exec-commands': async (parsed, when = 'always') => {
            if (when !== 'always') {
                return [true, '']
            }

            // 拼接全部文本：header + body + footer
            const text = [parsed.header, parsed.body, parsed.footer]
                .filter(Boolean)
                .join('\n')

            if (!text) {
                return [true, '']
            }

            for (const pattern of EXEC_COMMAND_PATTERNS) {
                const match = text.match(pattern)
                if (match) {
                    return [
                        false,
                        `commit message 包含执行命令「${match[0]}」；git.md §3.6 第 1 条：不写执行命令`,
                    ]
                }
            }

            return [true, '']
        },
    },
}
