import { defineConfig, devices } from '@playwright/test'

/**
 * dependfix 平台视觉回归（截图识别层）独立配置。
 *
 * 与 `playwright.config.ts`（e2e 功能层）**完全隔离**：独立 testDir / 端口 / SQLite 库 /
 * 认证状态目录，不并入 `pnpm test:e2e` 的 `testMatch` 与断言语义。
 *
 * 环境固定、阈值口径、维护协议与覆盖边界以 [测试规范 §6.7](../../docs/standards/testing.md)（`视觉回归`）
 * 为唯一权威；`tests/visual/README.md` 记录读基线须知（M31 已裁定差异 / 已知盲区）。
 *
 * 服务端复用 e2e 的构建产物（`.output/server/index.mjs`）→ **取证 / 更新基线前必须先 build**，
 * 否则比对的是过期产物（可假绿）。
 */

const visualHost = '127.0.0.1'
const visualPort = 3102
const visualBaseURL = `http://${visualHost}:${visualPort}`

/** 与 playwright.config.ts 的 e2eServerEnv 同源，差异仅端口与库文件：视觉库独立，
 *  避免 e2e 累积数据（repos-crud 等用例会留下记录）污染基线。上游调整该 env 时须同步此处。 */
const visualServerEnv = [
    'NODE_ENV=test',
    'E2E_TEST=true',
    'NUXT_E2E_FIXTURES_ALLOWED=true',
    `HOST=${visualHost}`,
    `PORT=${visualPort}`,
    'NUXT_AUTH_SECRET=e2e-test-secret-0123456789abcdef',
    'NUXT_ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!',
    'DATABASE_PATH=data/visual.sqlite',
    'DATABASE_SYNCHRONIZE=true',
    'NUXT_QUEUE_ENABLED=false',
    'BACKUP_SKIP=true',
].join(' ')

export default defineConfig({
    testDir: './tests/visual',
    globalSetup: './tests/visual/global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    /* 截图层不做重试：不稳定即失败并归因，不用重试掩盖抖动 */
    retries: 0,
    workers: 1,
    timeout: 60000,
    expect: {
        toHaveScreenshot: {
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixels: 200,
            threshold: 0.2,
            scale: 'css',
        },
    },
    reporter: process.env.CI
        ? [['github'], ['list'], ['blob', { outputDir: 'test-results/visual-blob' }]]
        : [['html', { open: 'never', outputFolder: 'playwright-report/visual' }], ['list']],
    /* 基线快照随仓库提交（可在 PR 中 review 差异）；失败产物 -actual / -diff 落于 outputDir */
    snapshotPathTemplate: 'tests/visual/__screenshots__/{testFilePath}/{arg}{ext}',
    outputDir: 'test-results/visual',
    use: {
        baseURL: visualBaseURL,
        storageState: 'tests/visual/.auth/admin.json',
        trace: 'off',
        screenshot: 'off',
        video: 'off',
    },
    projects: [
        {
            name: 'chromium-visual',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1440, height: 900 },
                deviceScaleFactor: 1,
                locale: 'zh-CN',
                timezoneId: 'Asia/Shanghai',
                colorScheme: 'light',
                reducedMotion: 'reduce',
            },
        },
    ],
    webServer: {
        /* 强制新进程（不复用）：与 e2e 一致，env 只在进程启动时读取 */
        command: `pnpm exec cross-env ${visualServerEnv} node .output/server/index.mjs`,
        url: visualBaseURL,
        reuseExistingServer: false,
        timeout: 600000,
    },
})
