/**
 * commitlint plugin: no-filler-phrases
 *
 * 拦截 commit message 中包含没实证废话 / 关联度低教训段的写法。
 * 完整规则集见 docs/standard/git.md §3.6 第 4 + 5 条「不写没实证的废话 + 不写关联度低的教训段」+ ai-collaboration.md §1.6。
 *
 * 检测模式：
 * - 没实证的废话：声明性猜测 / 没具体路径的引用
 * - 关联度低的教训段：与本次 commit 实际改动无关的教训或建议
 */

const FILLER_PHRASES = [
    // 没实证的废话
    /确切路径需源码进一步实证/,
    /没实证就别写/,
    /确切路径[需要]/,
    /源码实证后[补补]/,
    // 关联度低的教训 / 后续建议
    /建议下次[^\n]*批次/,
    /建议下批[^\n]*/,
    /未来可作[^\n]*/,
    /未来可考虑[^\n]*/,
    /留\s+M\d+\+\s*(评估|候选)/,
    /不在本\s*\w+\s*范围/,
    // 模糊建议（无具体上下文）
    /建议未来[^\n]*/,
    /后续批次\s*考虑/,
]

export default {
    rules: {
        /**
         * @param {object} parsed - commitlint 解析对象
         * @param {string} when - 'always' | 'never'
         * @returns {Promise<[boolean, string]>}
         */
        'no-filler-phrases': async (parsed, when = 'always') => {
            if (when !== 'always') {
                return [true, '']
            }

            // 检查 body + footer
            const bodyText = [parsed.body, parsed.footer].filter(Boolean).join('\n')

            if (!bodyText) {
                return [true, '']
            }

            for (const phrase of FILLER_PHRASES) {
                const match = bodyText.match(phrase)
                if (match) {
                    return [
                        false,
                        `commit message正文包含没实证废话或关联度低教训段「${match[0]}」；git.md §3.6 第 4 + 5 条：不写没实证的废话 + 不写关联度低的教训段`,
                    ]
                }
            }

            return [true, '']
        },
    },
}
