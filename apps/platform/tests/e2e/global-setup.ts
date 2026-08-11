import path from 'node:path'
import { chromium, type FullConfig } from '@playwright/test'
import { TEST_ADMIN, TEST_VIEWER, apiSignUp } from './helpers/auth.helper'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * Playwright 全局初始化：
 * 1. 等待 webServer 就绪
 * 2. 注册 e2e 测试账号（首用户 admin + viewer；幂等）
 * 3. 登录 admin 并保存认证状态（storageState），供 admin 用例复用
 */
async function globalSetup(config: FullConfig): Promise<void> {
    const baseURL = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3101'
    const authFile = path.resolve(process.cwd(), 'tests/e2e/.auth/admin.json')
    const browser = await chromium.launch()
    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()

    try {
        // 等待服务就绪（webServer 启动 + 数据库初始化）
        console.info('[e2e global-setup] waiting for server...')
        await page.goto('/', { timeout: 60000 })
        console.info('[e2e global-setup] server ready')

        // 注册测试账号（幂等：已存在则忽略）
        await apiSignUp(page.request, TEST_ADMIN)
        await apiSignUp(page.request, TEST_VIEWER)

        // 登录 admin 保存认证状态
        console.info('[e2e global-setup] signing in admin...')
        await page.goto('/login')
        // 等待 Vue 应用挂载完成（SSR 静态 DOM 无事件绑定；fill 对原生 input 有效但
        // 点击 submit 需 hydration 完成才触发 onSubmit——页面初始化导航链可能延迟挂载，
        // 直接点击会静默失效导致 waitForURL 超时）
        await waitForHydration(page)
        await page.locator('input#email').fill(TEST_ADMIN.email)
        await page.locator('#password input').fill(TEST_ADMIN.password)
        await page.locator('button[type="submit"]').click()
        await page.waitForURL(/\/dashboard/, { timeout: 30000 })

        await context.storageState({ path: authFile })
        console.info(`[e2e global-setup] admin auth state saved to ${authFile}`)
    } finally {
        await browser.close()
    }
}

export default globalSetup
