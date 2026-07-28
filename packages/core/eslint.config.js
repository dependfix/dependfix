import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'
import { createLanguageOptions } from 'eslint-config-cmyr/utils'

export default defineConfig([
    cmyr,
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    {
        files: [
            'tsdown.config.ts',
            'src/**/*.spec.ts',
            'src/**/*.test.ts',
        ],
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: import.meta.dirname,
        }),
    },
])
