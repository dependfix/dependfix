/**
 * commitlint 扩展配置：信息密度硬约束 plugins + rules
 *
 * 被 commitlint.config.ts 通过 extends 引入：
 * ```ts
 * extends: ['cmyr', './scripts/commitlint/info-density.config.mjs']
 * ```
 *
 * 4 条硬约束（详见 docs/standard/git.md §3.6 + ai-collaboration.md §1.6）：
 * 1. no-exec-commands：不写执行命令（pnpm run / git rev-list / node scripts/ 等）
 * 2. no-results-numbers：不写执行结果数字（0 error / N passed / EXIT=0 / 0 blocker 等）
 * 3. no-diff-stats：不写改动行数（+N/-M / ~N 行 / N files changed / N commits 等）
 * 4. no-filler-phrases：不写没实证废话或关联度低的教训段（确切路径需源码进一步实证 / 建议下次 X 批次 / 未来可作 X 等）
 *
 * 拦截入口：.husky/commit-msg hook → npx commitlint --edit "$1" → 本配置 + cmyr
 *
 * commitlint v21 load-plugin 行为约束：plugins.local 每次赋值覆盖，因此必须合并为单个 plugin 对象。
 */

import noExecCommandsPlugin from './no-exec-commands.mjs'
import noResultsNumbersPlugin from './no-results-numbers.mjs'
import noDiffStatsPlugin from './no-diff-stats.mjs'
import noFillerPhrasesPlugin from './no-filler-phrases.mjs'

// 合并 4 个 plugin 的 rules 到单个对象（commitlint v21 load-plugin 行为约束）
const mergedRules = {
    ...noExecCommandsPlugin.rules,
    ...noResultsNumbersPlugin.rules,
    ...noDiffStatsPlugin.rules,
    ...noFillerPhrasesPlugin.rules,
}

export default {
    plugins: [
        { rules: mergedRules },
    ],
    rules: {
        'no-exec-commands': [2, 'always'],
        'no-results-numbers': [2, 'always'],
        'no-diff-stats': [2, 'always'],
        'no-filler-phrases': [2, 'always'],
    },
}
