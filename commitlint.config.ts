import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 当前文件目录（commitlint.config.ts 编译后位于 dependfix 根目录）
const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
    extends: [
        'cmyr',
        // 信息密度硬约束扩展（详见 scripts/commitlint/info-density.config.mjs）
        // 4 条规则：不写执行命令 / 不写执行结果数字 / 不写改动行数 / 不写没实证废话与关联度低教训段
        resolve(__dirname, 'scripts/commitlint/info-density.config.mjs'),
    ],
    rules: {
        // cmyr 基础规则
        'header-max-length': [2, 'always', 140],
    },
}
