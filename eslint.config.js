// eslint.config.js
import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'
import { createLanguageOptions } from 'eslint-config-cmyr/utils'

export default defineConfig([
    cmyr,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
        ],
    },
    {
        files: [
            'commitlint.config.ts',
            'packages/*/tsdown.config.ts',
            'vitest.config.ts',
            'packages/*/src/**/*.spec.ts',
            'packages/*/src/**/*.test.ts',
        ],
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: process.cwd(),
        }),
    },
])
