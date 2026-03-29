// eslint.config.js
import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'
import { createLanguageOptions } from 'eslint-config-cmyr/utils'

export default defineConfig([
    cmyr,
    {
        files: [
            'commitlint.config.ts',
            'tsdown.config.ts',
            'vitest.config.ts',
            'src/**/*.spec.ts',
            'src/**/*.test.ts',
        ],
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: process.cwd(),
        }),
    },
])
