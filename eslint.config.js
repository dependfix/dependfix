// eslint.config.js
import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'
import { createLanguageOptions } from 'eslint-config-cmyr/utils'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import eslintPluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import { vueI18nNoUnusedKeyIgnores } from './scripts/i18n/dynamic-key-allowlist.mjs'

const testFiles = ['**/*.test.ts']

// i18n lint 独立开关：@intlify/vue-i18n 规则（no-unused-keys 等）需要解析 locale 文件，
// 执行较慢，仅通过 `pnpm lint:i18n`（ESLINT_I18N=true）启用，不并入常规 lint。
const enableI18nLint = process.env.ESLINT_I18N === 'true'

// i18n lint 配置块：仅对 apps/platform 生效（唯一使用 vue-i18n 的应用）。
// recommended 内部含 json/yaml 专项 config（自带 files 与 vue-eslint-parser），
// 必须保留其原始 files——统一覆盖会导致 vue parser 应用到 .ts 文件产生解析错误。
const i18nLintConfigs = enableI18nLint
    ? [
        ...vueI18n.configs.recommended.map((config) => {
            const baseConfig = { ...config }

            // 全部限定到 apps/platform 范围：无 files 的通用 config（插件注册 / 规则应用）
            // 限定平台源码；json/yaml 专项 config 保留自身扩展名但加平台前缀，
            // 避免命中平台内 package.json / tsconfig.json / e2e 数据等非业务文件。
            if (!config.files) {
                baseConfig.files = ['apps/platform/**/*.{vue,ts,js,mjs}']
            } else {
                baseConfig.files = config.files.map((pattern) => `apps/platform/${pattern}`)
            }

            if (!config.rules) {
                return baseConfig
            }

            // 提升为 error：i18n 规则在 lint:i18n 独立命令中按硬门禁执行
            baseConfig.rules = Object.fromEntries(
                Object.entries(config.rules).map(([ruleName, ruleConfig]) => {
                    if (!ruleName.startsWith('@intlify/vue-i18n/')) {
                        return [ruleName, ruleConfig]
                    }

                    return [ruleName, Array.isArray(ruleConfig) ? ['error', ...ruleConfig.slice(1)] : 'error']
                }),
            )
            return baseConfig
        }),
        {
            files: ['apps/platform/**/*.{vue,ts,js,mjs}'],
            rules: {
                // 平台部分 UI 文案为动态渲染（状态映射等），允许 raw text 与非静态 key 形态
                '@intlify/vue-i18n/no-raw-text': 0,
                '@intlify/vue-i18n/no-dynamic-keys': 0,
                '@intlify/vue-i18n/no-unused-keys': [
                    'error',
                    {
                        extensions: ['.js', '.ts', '.vue'],
                        // 动态 key（如状态映射）无法静态分析到使用，按白名单豁免
                        ignores: vueI18nNoUnusedKeyIgnores,
                    },
                ],
            },
            settings: {
                'vue-i18n': {
                    localeDir: [
                        './apps/platform/i18n/locales/*.json',
                        './apps/platform/i18n/locales/**/*.json',
                    ],
                    messageSyntaxVersion: '^10.0.0',
                },
            },
        },
        {
            files: ['apps/platform/i18n/locales/*.json', 'apps/platform/i18n/locales/**/*.json'],
            rules: {
                '@intlify/vue-i18n/no-unused-keys': 0,
                '@intlify/vue-i18n/no-html-messages': 0, // 允许在 JSON 文件中使用 HTML 标签
            },
        },
    ]
    : []

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
    ...i18nLintConfigs,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/.nuxt/**',
            '**/.output/**',
            '**/.data/**',
            'apps/platform/data/**',
            // Playwright 生成物（e2e 运行产出，ESLint 9 flat config 不读 .gitignore 需显式排除）
            'apps/platform/playwright-report/**',
            'apps/platform/test-results/**',
            'apps/platform/blob-report/**',
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
        // 规则采用 momei 的 Nuxt 策略：no-unsafe-* 系列关闭（Nuxt/TypeORM/better-auth 生态类型复杂，
        // 且 workspace 包未构建（无 dist）时类型解析失败会触发 unsafe 警告爆炸，渐进收紧）。
        // 与 apps/platform/eslint.config.js（eslint-config-cmyr/nuxt 为基础）保持同一语义。
        files: ['apps/platform/**/*.{ts,tsx,mts,cts}'],
        // nuxt.config.ts 使用 Nuxt auto-import（defineNuxtConfig），须用 .nuxt/tsconfig.json 单独校验；
        // i18n/localeDetector.ts 被 @nuxtjs/i18n 排除出平台 tsconfig（nitro tsconfig 兜底类型检查），
        // 由平台独立定向检查（tsconfig.i18n.json）覆盖，根 lint 跳过避免 project 解析报错
        ignores: [...testFiles, 'apps/platform/nuxt.config.ts', 'apps/platform/i18n/localeDetector.ts'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: [nuxtTsconfig],
            tsconfigRootDir: process.cwd(),
        }),
        rules: {
            '@typescript-eslint/no-deprecated': [1],
            '@typescript-eslint/no-floating-promises': [1],
            '@typescript-eslint/no-misused-promises': [1],
            '@typescript-eslint/await-thenable': [1],
            '@typescript-eslint/no-base-to-string': [1],
            '@typescript-eslint/no-unnecessary-type-assertion': [0],
            '@typescript-eslint/no-redundant-type-constituents': [1],
            '@typescript-eslint/only-throw-error': [1],
            '@typescript-eslint/prefer-optional-chain': [1],
            '@typescript-eslint/require-await': [1],
            '@typescript-eslint/no-unused-vars': [1, { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-extraneous-class': [0],
            '@typescript-eslint/no-confusing-void-expression': [0],
            '@typescript-eslint/restrict-template-expressions': [0],
            '@typescript-eslint/no-non-null-assertion': [0],
            '@typescript-eslint/no-unnecessary-condition': [0],
            '@typescript-eslint/restrict-plus-operands': [0],
            '@typescript-eslint/ban-ts-comment': [0],
            // Nuxt/TypeORM/better-auth 生态类型复杂：unsafe 系列渐进收紧（与 momei 一致）
            '@typescript-eslint/no-explicit-any': [0],
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
