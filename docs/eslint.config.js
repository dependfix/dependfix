// eslint.config.js
import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'
import { createLanguageOptions } from 'eslint-config-cmyr/utils'
import tseslint from 'typescript-eslint'

// 严格化规则：仅对生产 TS 启用（no-explicit-any → no-unnecessary-type-conversion 区间），
// 逐步收紧代码质量避免一次性修复过多问题
const strictRules = {
    '@typescript-eslint/explicit-module-boundary-types': [1, {
        allowArgumentsExplicitlyTypedAsAny: true,
    }],
    '@typescript-eslint/no-explicit-any': [1],
    '@typescript-eslint/no-unsafe-argument': [1],
    '@typescript-eslint/no-unsafe-assignment': [1],
    '@typescript-eslint/no-unsafe-member-access': [1],
    '@typescript-eslint/no-unsafe-return': [1],
    '@typescript-eslint/no-unsafe-call': [1],
    '@typescript-eslint/unbound-method': [1],
    '@typescript-eslint/no-dynamic-delete': [1],
    '@typescript-eslint/no-unnecessary-type-conversion': [1],
}

export default defineConfig([
    cmyr,
    {
        ignores: ['.vitepress/dist/**', '.vitepress/cache/**', 'node_modules/**'],
    },
    {
        rules: {
            'max-lines': [1, { max: 800, skipBlankLines: true }], // 强制文件的最大行数（空行不计入）
            'max-lines-per-function': [1, { max: 500 }], // 强制函数最大行数
            'no-console': [0], // CLI 工具允许使用 console（前端项目才禁）
        },
    },
    {
        files: ['.vitepress/config.ts'],
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: import.meta.dirname,
        }),
    },
    {
        files: ['**/*.{ts,tsx,mts,cts}'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: import.meta.dirname,
        }),
        rules: strictRules,
    },
])
