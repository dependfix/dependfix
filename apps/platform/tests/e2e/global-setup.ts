import path from 'node:path'
import { chromium, type FullConfig } from '@playwright/test'
import { TEST_ADMIN, TEST_VIEWER, apiSignUp, pageSignIn } from './helpers/auth.helper'

/**
 * Playwright 全局初始化：
 * 1. 等待 webServer 就绪
 * 2. 注册 e2e 测试账号（首用户 admin + viewer；幂等）
 * 3. 登录 admin 与 viewer 并保存认证状态（storageState），供各角色用例复用
 */
async function globalSetup(config: FullConfig): Promise<void> {
    const baseURL = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3101'
    const authDir = path.resolve(process.cwd(), 'tests/e2e/.auth')
    const adminAuthFile = path.join(authDir, 'admin.json')
    const viewerAuthFile = path.join(authDir, 'viewer.json')
    const browser = await chromium.launch()

    try {
        // 注册测试账号（幂等：已存在则忽略）共用同一个 request context 即可
        const setupCtx = await browser.newContext({ baseURL })
        const setupPage = await setupCtx.newPage()
        console.info('[e2e global-setup] waiting for server...')
        await setupPage.goto('/', { timeout: 60000 })
        console.info('[e2e global-setup] server ready')
        await apiSignUp(setupPage.request, TEST_ADMIN)
        await apiSignUp(setupPage.request, TEST_VIEWER)
        await setupCtx.close()

        // 登录 admin 保存认证状态
        const adminCtx = await browser.newContext({ baseURL })
        const adminPage = await adminCtx.newPage()
        console.info('[e2e global-setup] signing in admin...')
        await pageSignIn(adminPage, TEST_ADMIN)
        await adminCtx.storageState({ path: adminAuthFile })
        console.info(`[e2e global-setup] admin auth state saved to ${adminAuthFile}`)
        await adminCtx.close()

        // 登录 viewer 保存认证状态（用于 viewer 角色权限 e2e；首用户 admin 后注册 → 默认 viewer）
        const viewerCtx = await browser.newContext({ baseURL })
        const viewerPage = await viewerCtx.newPage()
        console.info('[e2e global-setup] signing in viewer...')
        await pageSignIn(viewerPage, TEST_VIEWER)
        await viewerCtx.storageState({ path: viewerAuthFile })
        console.info(`[e2e global-setup] viewer auth state saved to ${viewerAuthFile}`)
        await viewerCtx.close()
    } finally {
        await browser.close()
    }
}

export default globalSetup
