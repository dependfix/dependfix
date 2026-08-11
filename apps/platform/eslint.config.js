// apps/platform/eslint.config.js
// Nuxt 平台独立 eslint 配置：参考 momei 的 eslint.config.js，以 eslint-config-cmyr/nuxt 为基础。
//
// 设计说明（与 momei 的差异与原因）：
// - 不使用 withNuxt(.nuxt/eslint.config.mjs)：@nuxt/eslint 模块会引入 devframe → h3@2.x，
//   与 Nuxt 4 的 h3@1.x 冲突导致 platform typecheck 失败（h3 1.x/2.x 是 breaking API）。
//   故手动引用 eslint-config-cmyr/nuxt（含 vue 配置 + nuxt globals）+ tseslint type-checked 规则。
// - no-unsafe-* 系列关闭：Nuxt/TypeORM/better-auth 生态类型复杂，与 momei 一致采用"渐进收紧"策略，
//   同时避免 CI 中 workspace 包类型解析失败时 no-unsafe 警告爆炸（root lint 依赖 dist 类型声明）。
import cmyrConfig from 'eslint-config-cmyr/nuxt'
import { __WARN__, createLanguageOptions } from 'eslint-config-cmyr/utils'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

const testFiles = ['**/**/*.test.*', '**/**/*.spec.*']
const tsFiles = ['**/*.{ts,tsx,mts,cts}']
const serverTsFiles = ['server/**/*.{ts,tsx,mts,cts}']

export default [
    {
        ignores: [
            'node_modules',
            '.nuxt',
            '.output',
            '.data',
            'data',
            'dist',
            'coverage',
            'logs',
            'test-results',
            'playwright-report',
            'blob-report',
        ],
    },
    {
        plugins: {
            vue: pluginVue,
        },
    },
    ...cmyrConfig,
    {
        rules: {
            'max-lines': [1, { max: 800, skipBlankLines: true }], // 强制文件的最大行数（空行不计入）
            'max-lines-per-function': [1, { max: 500 }], // 强制函数最大行数
            'no-console': [0], // 平台服务端允许使用 console（日志输出）
        },
    },
    {
        files: testFiles,
        rules: {
            'max-lines': [1, { max: 1000 }], // 测试文件的行数限制放宽一些
            'max-lines-per-function': [1, { max: 800 }], // 测试文件的函数行数限制放宽一些
        },
    },
    ...tseslint.config(
        {
            files: tsFiles,
            // i18n/localeDetector.ts：@nuxtjs/i18n 模块设计上将其从 Nuxt tsconfig exclude
            // （.nuxt/tsconfig.json，服务端 nitro tsconfig include 兜底类型检查），无法参与 type-checked lint，
            // 回落 cmyrConfig 非 type-checked 解析（语法/风格规则仍生效）
            ignores: ['i18n/localeDetector.ts', 'nuxt.config.ts'],
            extends: [
                tseslint.configs.recommendedTypeChecked,
                tseslint.configs.strictTypeChecked,
                tseslint.configs.stylisticTypeChecked,
            ],
            languageOptions: createLanguageOptions({}, {
                projectService: false,
                project: ['./tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            }),
            rules: {
                '@typescript-eslint/no-deprecated': [1],
                '@typescript-eslint/no-floating-promises': [1],
                '@typescript-eslint/no-misused-promises': [1],
                '@typescript-eslint/await-thenable': [1],
                '@typescript-eslint/no-base-to-string': [1],
                '@typescript-eslint/no-unnecessary-type-assertion': [0],
                '@typescript-eslint/no-unsafe-enum-comparison': [1],
                '@typescript-eslint/no-redundant-type-constituents': [1],
                '@typescript-eslint/only-throw-error': [1],
                '@typescript-eslint/prefer-optional-chain': [1],
                '@typescript-eslint/require-await': [1],
                '@typescript-eslint/no-empty-function': [__WARN__],
                '@typescript-eslint/non-nullable-type-assertion-style': [0],
                '@typescript-eslint/no-inferrable-types': [0],
                '@typescript-eslint/explicit-function-return-type': [0],
                '@typescript-eslint/prefer-nullish-coalescing': [0],

                '@typescript-eslint/no-unnecessary-boolean-literal-compare': [1],
                '@typescript-eslint/return-await': [1],
                '@typescript-eslint/no-invalid-void-type': [1],
                '@typescript-eslint/no-unnecessary-type-parameters': [1],
                '@typescript-eslint/no-unused-vars': [1, { argsIgnorePattern: '^_' }],
                '@typescript-eslint/no-misused-spread': [1],

                '@typescript-eslint/no-extraneous-class': [0],
                '@typescript-eslint/no-confusing-void-expression': [0],
                '@typescript-eslint/use-unknown-in-catch-callback-variable': [0],
                '@typescript-eslint/restrict-template-expressions': [0],
                '@typescript-eslint/no-non-null-assertion': [0],
                '@typescript-eslint/no-unnecessary-condition': [0],
                '@typescript-eslint/restrict-plus-operands': [0],
                '@typescript-eslint/ban-ts-comment': [0],
                '@typescript-eslint/no-unnecessary-type-arguments': [0],
                '@typescript-eslint/prefer-reduce-type-parameter': [0],

                '@typescript-eslint/explicit-module-boundary-types': [0, {
                    allowArgumentsExplicitlyTypedAsAny: true,
                }],
                '@typescript-eslint/no-explicit-any': [0],
                // Nuxt/TypeORM/better-auth 生态类型复杂：unsafe 系列渐进收紧（与 momei 一致）
                '@typescript-eslint/no-unsafe-argument': [0],
                '@typescript-eslint/no-unsafe-assignment': [0],
                '@typescript-eslint/no-unsafe-member-access': [0],
                '@typescript-eslint/no-unsafe-return': [0],
                '@typescript-eslint/no-unsafe-call': [0],
                '@typescript-eslint/unbound-method': [0],

                '@typescript-eslint/no-dynamic-delete': [0],
                '@typescript-eslint/no-unnecessary-type-conversion': [0],
            },
        },
        {
            // nuxt.config.ts：Nuxt auto-import（defineNuxtConfig）须用 .nuxt/tsconfig.json 解析
            files: ['nuxt.config.ts'],
            languageOptions: createLanguageOptions({}, {
                projectService: false,
                project: ['./.nuxt/tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            }),
            rules: {
                '@typescript-eslint/no-deprecated': [1],
                '@typescript-eslint/no-floating-promises': [1],
                '@typescript-eslint/no-misused-promises': [1],
                '@typescript-eslint/await-thenable': [1],
                '@typescript-eslint/no-unused-vars': [1, { argsIgnorePattern: '^_' }],
                '@typescript-eslint/no-explicit-any': [0],
                '@typescript-eslint/no-unsafe-argument': [0],
                '@typescript-eslint/no-unsafe-assignment': [0],
                '@typescript-eslint/no-unsafe-member-access': [0],
                '@typescript-eslint/no-unsafe-return': [0],
                '@typescript-eslint/no-unsafe-call': [0],
                '@typescript-eslint/no-dynamic-delete': [0],
            },
        },
        // server 目录二次收紧（与 momei 相同，tests / scripts / migrations 除外）
        {
            files: serverTsFiles,
            rules: {
                '@typescript-eslint/no-unnecessary-type-arguments': [1],
            },
        },
        // 测试文件：async 函数可直接不 await（test 写法更自然）
        {
            files: testFiles,
            rules: {
                '@typescript-eslint/require-await': 0,
            },
        },
    ),
]
