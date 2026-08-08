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
        // 限制并发 worker 数：全量测试含大量真实 git 命令与子进程（cli 集成测试），
        // 默认 worker = CPU 核数 - 1，Windows 全量并发时 CPU 竞争导致 git/子进程测试超时 flaky
        // （pr-creator/app-index 曾随机失败）。4 worker 兼顾并行度与稳定性（实测 978/978 全过）。
        maxWorkers: 4,
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
