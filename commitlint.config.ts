export default {
    extends: ['cmyr'],
    rules: {
        // 主题行硬限制：140 字符（cmyr 默认值，显式声明以便与 git.md 提交消息格式对齐）
        'header-max-length': [2, 'always', 140],
    },
}
