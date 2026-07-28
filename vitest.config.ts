import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@dependfix/core': resolve(import.meta.dirname, 'packages/core/src'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
    },
})
