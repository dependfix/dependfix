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
        coverage: {
            provider: 'v8',
            // 只统计两个包的源码；排除测试文件 / 构建产物 / 声明文件
            include: ['packages/core/src/**/*.ts', 'packages/cli/src/**/*.ts', 'packages/mcp/src/**/*.ts'],
            exclude: [
                '**/*.test.ts',
                '**/*.d.ts',
                '**/dist/**',
                '**/node_modules/**',
            ],
            reporter: ['text', 'json-summary', 'lcov'],
        },
    },
})
