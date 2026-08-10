import { defineConfig, devices } from '@playwright/test'

/**
 * dependfix 平台 e2e 配置（参考 momei 项目模式）。
 *
 * 设计要点：
 * - 服务端使用构建产物 `.output/server/index.mjs`（对齐生产形态；CI 由 build 阶段产出）
 * - 独立端口 + 独立 SQLite 库 + 独立 AUTH_SECRET，隔离开发/测试环境
 * - globalSetup 注册首用户 admin 并保存认证状态（storageState），测试内复用
 * - CI 单 worker 串行（共享同一 SQLite 库，避免并发写冲突）；本地按需并行
 */

const e2eHost = '127.0.0.1'
const e2ePort = 3101
const e2eBaseURL = `http://${e2eHost}:${e2ePort}`
const e2eAuthSecret = 'e2e-test-secret-0123456789abcdef'

/** 测试环境变量：独立数据库 + 固定密钥 + 允许注册（globalSetup 需注册首用户）
 *  DATABASE_SYNCHRONIZE=true：生产构建默认关闭自动建表，e2e 独立库需显式开启
 *  QUEUE_ENABLED=false：强制同步降级——本地有 Redis 会走 async 且无 worker 消费导致扫描挂起；
 *  CI 无 Redis 时 auto 探测也降级同步；显式 false 保证本地/CI 行为一致（队列闭环由手动冒烟验证） */
const e2eServerEnv = [
    'NODE_ENV=production',
    'E2E_TEST=true',
    `HOST=${e2eHost}`,
    `PORT=${e2ePort}`,
    `NUXT_AUTH_SECRET=${e2eAuthSecret}`,
    `NUXT_ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!`,
    `DATABASE_PATH=data/e2e.sqlite`,
    'DATABASE_SYNCHRONIZE=true',
    'QUEUE_ENABLED=false',
].join(' ')

/** CI 强制串行（共享 SQLite 库）；本地默认并行 */
const workers = process.env.CI ? 1 : undefined

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1,
    timeout: process.env.CI ? 90000 : 30000,
    workers,
    reporter: process.env.CI
        ? [['github'], ['list'], ['blob', { outputDir: 'test-results/blob-report' }]]
        : [['html', { open: 'never' }], ['list']],
    use: {
        baseURL: e2eBaseURL,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: `pnpm exec cross-env ${e2eServerEnv} node .output/server/index.mjs`,
        url: e2eBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 600000,
    },
})
