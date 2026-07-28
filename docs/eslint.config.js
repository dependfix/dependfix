import { defineConfig } from 'eslint/config'
import cmyr from 'eslint-config-cmyr'
import { createLanguageOptions } from 'eslint-config-cmyr/utils'

export default defineConfig([
    cmyr,
    {
        ignores: ['.vitepress/dist/**', '.vitepress/cache/**', 'node_modules/**'],
    },
    {
        files: ['.vitepress/config.ts'],
        languageOptions: createLanguageOptions({}, {
            projectService: false,
            project: ['./tsconfig.eslint.json'],
            tsconfigRootDir: import.meta.dirname,
        }),
    },
])
