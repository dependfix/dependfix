// eslint.config.js
import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'
import { createLanguageOptions } from 'eslint-config-cmyr/utils'
import eslintPluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

const testFiles = ['**/*.test.ts']

// 严格化规则：仅对生产 TS 启用（no-explicit-any → no-unnecessary-type-conversion 区间），
// 测试文件维持豁免，逐步收紧代码质量避免一次性修复过多问题
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

// Nuxt 平台（apps/platform）：使用平台自己的 tsconfig.json（extends .nuxt/tsconfig.json 并显式 include server/**/*）。
// 不能直接用 .nuxt/tsconfig.json：其 include 只有 `../server` + `../server/*`（不递归），
// 深层目录（如 server/services/executor/）不在项目中会触发 "file was not found in any project"。
const nuxtTsconfig = './apps/platform/tsconfig.json'

export default defineConfig([
    cmyr,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/.nuxt/**',
            '**/.output/**',
            '**/.data/**',
            'apps/platform/data/**',
        ],
    },
    {
        rules: {
            'max-lines': [1, { max: 800, skipBlankLines: true }], // 强制文件的最大行数（空行不计入）
            'max-lines-per-function': [1, { max: 500 }], // 强制函数最大行数
            'no-console': [0], // CLI 工具允许使用 console（前端项目才禁）
        },
    },
    {
        files: testFiles,
        rules: {
            'max-lines': [1, { max: 1000 }], // 测试文件的行数限制放宽一些
            'max-lines-per-function': [1, { max: 800 }], // 测试文件的函数行数限制放宽一些
        },
    },
    {
        files: [
            'commitlint.config.ts',
            'packages/*/tsdown.config.ts',
            'vitest.config.ts',
            'packages/*/src/**/*.test.ts',
        ],
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: process.cwd(),
        }),
    },
    {
        // 生产 TS：启用 type-aware 严格化规则
        files: ['**/*.{ts,tsx,mts,cts}'],
        ignores: [...testFiles, 'apps/platform/**'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: process.cwd(),
        }),
        rules: strictRules,
    },
    {
        // Nuxt 平台（apps/platform）：TS 使用平台 tsconfig（extends .nuxt/tsconfig.json 并 include server/**/*）
        files: ['apps/platform/**/*.{ts,tsx,mts,cts}'],
        // nuxt.config.ts 使用 Nuxt auto-import（defineNuxtConfig），须用 .nuxt/tsconfig.json 单独校验
        ignores: [...testFiles, 'apps/platform/nuxt.config.ts'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: [nuxtTsconfig],
            tsconfigRootDir: process.cwd(),
        }),
        rules: strictRules,
    },
    {
        // nuxt.config.ts：Nuxt auto-import（defineNuxtConfig）只能用 .nuxt/tsconfig.json 解析
        files: ['apps/platform/nuxt.config.ts'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./apps/platform/.nuxt/tsconfig.json'],
            tsconfigRootDir: process.cwd(),
        }),
        rules: strictRules,
    },
    {
        // Nuxt 平台 Vue SFC：仅对平台 .vue 文件启用 vue 规则
        files: ['apps/platform/**/*.vue'],
        extends: [eslintPluginVue.configs['flat/recommended']],
        languageOptions: createLanguageOptions({}),
        rules: {
            'vue/html-indent': [1, 4], // vue 模板缩进为 4
            'vue/html-quotes': [1, 'double'], // vue 属性使用双引号
            'vue/multi-word-component-names': 0, // 允许单字组件名（Nuxt 页面）
            'vue/max-attributes-per-line': [2, {
                singleline: 2,
                multiline: {
                    max: 1,
                },
            }],
            'vue/require-default-prop': [0],
            'vue/require-name-property': [0],
            'vue/no-unused-vars': [1],
        },
    },
])
