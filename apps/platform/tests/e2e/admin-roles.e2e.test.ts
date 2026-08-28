import { expect, test } from '@playwright/test'

/**
 * 管理后台三角色权限 e2e（todo.md §M16.5 T701-e2e）：
 * 验证 viewers / org_admins 访问受角色保护页面（/users）时被中间件拦截跳转到 /dashboard。
 *
 * middleware 行为（apps/platform/app/middleware/auth.ts）：
 * - 未登录 → navigateTo('/login')
 * - 角色不匹配（page meta `roles`） → navigateTo('/dashboard')
 *
 * admin storageState（tests/e2e/.auth/admin.json）由 global-setup 注册首用户 admin，
 * viewer storageState（tests/e2e/.auth/viewer.json）由后续注册 + 登录态生成。
 * org_admin storageState 本批次不覆盖（需新增第三方用户并升级角色，超出 M16.5 验收范围），
 * 改为直接验证 viewer 路径（admin 自修改拦截已在 admin.e2e 覆盖）。
 */

test.describe('管理后台角色权限（todo.md §M16.5）', () => {
    // 默认 storageState：admin（覆盖 default empty state）
    test.use({ storageState: 'tests/e2e/.auth/admin.json' })


    test('admin 访问 /users → 正常渲染', async ({ page }) => {
        // 默认 storageState 是 admin（来自 use 声明），直接访问
        await page.goto('/users')
        // 页面应渲染用户列表
        await expect(page.locator('h2')).toContainText('用户管理', { timeout: 15000 })
        await expect(page.locator('.p-datatable')).toBeVisible()
        // 包含已注册 admin / viewer 账号
        await expect(page.locator('.p-datatable')).toContainText('e2e-admin@dependfix.test')
    })

    test('viewer 访问 /users → 重定向到 /dashboard（roles:["admin"] 不匹配）', async ({ browser }) => {
        // 单独 browser context 复用 viewer storageState
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        await page.goto('/users')
        // 等页面跳转稳定
        await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
        // URL 应是 /dashboard 而非 /users
        expect(page.url()).toMatch(/\/dashboard$/)
        // /users 页面 H2 标题不应可见
        await expect(page.locator('h2:has-text("用户管理")')).toHaveCount(0)
        await context.close()
    })

    test('viewer 直接调 API：/api/auth/admin/list-users → 403 (服务端拦截)', async ({ browser }) => {
        // 验证服务端强制拦截（绕过前端 UI）：viewer 调 admin 端点应被 better-auth 401/403 拒绝
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        // 注意：__Secure- cookie 在 HTTP 下不自动发送，需手工拼接 Cookie header（参考 batch/scans e2e 模式）
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        // better-auth admin 插件 GET /api/auth/admin/list-users（虽然 better-auth 暴露 listUsers 端点）
        // 这里尝试 POST /api/auth/admin/set-role（即使 viewer 调用也应被 adminMiddleware 拦截）
        const response = await page.request.post('/api/auth/admin/set-role', {
            headers: {
                origin: 'http://127.0.0.1:3101',
                cookie: cookies,
            },
            data: {
                userId: 'any-target-user-id',
                role: 'viewer',
            },
        })
        // viewer 没有 admin 权限 → 403/401（better-auth admin middleware 拦截）
        expect([401, 403]).toContain(response.status())
        await context.close()
    })
})
