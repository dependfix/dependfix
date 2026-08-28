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
 *  NUXT_QUEUE_ENABLED=false：强制同步降级——Nuxt runtimeConfig 运行时覆盖只认 NUXT_ 前缀
 *  （无前缀 QUEUE_ENABLED 只在构建时烘焙，运行时设置无效——本地 Redis 可达时 auto 会走
 *  async 且无 worker 消费导致扫描挂起；该问题在批量扫描首次触发真实执行后才暴露）；
 *  CI 无 Redis 时 auto 探测也降级同步；显式 false 保证本地/CI 一致 */
const e2eServerEnv = [
    'NODE_ENV=production',
    'E2E_TEST=true',
    `HOST=${e2eHost}`,
    `PORT=${e2ePort}`,
    `NUXT_AUTH_SECRET=${e2eAuthSecret}`,
    `NUXT_ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!`,
    // credential.service.ts 的 getEncryptionKey() 通过 Nuxt runtimeConfig().encryptionKey 读取密钥；
    // e2e 需要在 server 进程环境直接提供 NUXT_ENCRYPTION_KEY（runtimeConfig 默认从该前缀读取）
    // 否则任何凭据加密/解密请求会抛 500
    `DATABASE_PATH=data/e2e.sqlite`,
    'DATABASE_SYNCHRONIZE=true',
    'NUXT_QUEUE_ENABLED=false',
].join(' ')

/** CI 强制串行（共享 SQLite 库）；本地默认并行 */
const workers = process.env.CI ? 1 : undefined

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1,
    timeout: process.env.CI ? 180000 : 120000,
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
        // 强制新进程（不复用）：runtimeConfig 覆盖 env（NUXT_QUEUE_ENABLED 等）只在进程启动时读取，
        // 复用残留进程会导致 env 变更不生效（e2e 批量扫描暴露：旧无前缀 QUEUE_ENABLED 烘焙 auto + 本地 Redis → async 挂起）
        reuseExistingServer: false,
        timeout: 600000,
    },
})
