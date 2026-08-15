import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@dependfix/core': resolve(import.meta.dirname, 'packages/core/src'),
            '@dependfix/engine': resolve(import.meta.dirname, 'packages/engine/src'),
            // dependfix = packages/cli（CLI 包）：MCP/Platform 通过 alias 直接解析源码，
            // 避免 CI 中 workspace 包未构建（无 dist）时 "Failed to resolve entry" 失败
            dependfix: resolve(import.meta.dirname, 'packages/cli/src'),
            // Nuxt server 别名：platform 测试 import #server/* 时解析到真实源码
            // （与 apps/platform/.nuxt/tsconfig.json 的 paths 保持一致，vitest 转换时不自动读取）
            '#server': resolve(import.meta.dirname, 'apps/platform/server'),
            '#server/*': resolve(import.meta.dirname, 'apps/platform/server/*'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        // Nuxt server auto-import 模拟（API handler 测试用；setup 文件只注入全局 h3 工具，无副作用）
        // 必须使用绝对路径：pnpm --filter <pkg> test 在包目录运行 vitest，root=cwd=包目录，
        // 相对路径会解析到 <pkg>/apps/platform/tests/... 导致全部测试初始化失败
        setupFiles: [resolve(import.meta.dirname, 'apps/platform/tests/setup-nuxt-server.ts')],
        // e2e 测试由 Playwright 运行（apps/platform/tests/e2e），vitest 不扫描
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.nuxt/**',
            '**/.output/**',
            '**/tests/e2e/**',
        ],
        // 控制并行 worker 数：全量测试含大量真实 git 命令与子进程（cli 集成测试），
        // 默认 worker = CPU 核数 - 1，Windows 全量并发时 CPU 竞争导致 git/子进程测试超时 flaky
        // （pr-creator/app-index 曾随机失败）。4 worker 兼顾并行度与稳定性（实测全量通过）。
        maxWorkers: 4,
        coverage: {
            provider: 'v8',
            // 统计口径：所有交付源码——packages 各发布包 + apps/platform（app 前端 ts + server 后端）+ scripts 工具脚本；
            // .vue 组件不纳入（当前无组件级测试，且 v8 对 SFC 插桩依赖 vue 插件，测试环境为纯 node）；
            // e2e 测试（apps/platform/tests/e2e）由 Playwright 运行，已在 test.exclude 排除
            include: [
                'packages/core/src/**/*.ts',
                'packages/engine/src/**/*.ts',
                'packages/cli/src/**/*.ts',
                'packages/mcp/src/**/*.ts',
                'apps/platform/app/**/*.ts',
                'apps/platform/server/**/*.ts',
                'scripts/**/*.mjs',
            ],
            exclude: [
                '**/*.test.ts',
                '**/*.test.mjs',
                '**/*.d.ts',
                '**/dist/**',
                '**/node_modules/**',
            ],
            reporter: ['text', 'json-summary', 'lcov'],
            // 覆盖率目标：整体 80%（口径 = packages + apps + scripts 全部源码）
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
            },
        },
    },
})
