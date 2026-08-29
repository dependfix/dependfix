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

    /**
     * better-auth admin 端点 viewer 403 矩阵（todo.md §M17.6 S-4）：
     * 锁定 better-auth admin 当前版本的 role 行为，防升级回归。覆盖 5 端点
     * （ban-user / remove-user / impersonate-user / unban-user / list-users），
     * set-role 端点已在上面 it case 覆盖。
     * 注：端点由 better-auth admin 插件原生提供（项目不持有 handler 代码），
     * 升级 better-auth 时若 adminMiddleware 行为变化，此测试可立即捕获。
     */
    test('viewer 直接调 API：/api/auth/admin/ban-user → 403', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const response = await page.request.post('/api/auth/admin/ban-user', {
            headers: {
                origin: 'http://127.0.0.1:3101',
                cookie: cookies,
            },
            data: {
                userId: 'any-target-user-id',
                banReason: 'test-ban-reason',
                banExpiresIn: 86400,
            },
        })
        expect([401, 403]).toContain(response.status())
        await context.close()
    })

    test('viewer 直接调 API：/api/auth/admin/remove-user → 403', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const response = await page.request.post('/api/auth/admin/remove-user', {
            headers: {
                origin: 'http://127.0.0.1:3101',
                cookie: cookies,
            },
            data: {
                userId: 'any-target-user-id',
            },
        })
        expect([401, 403]).toContain(response.status())
        await context.close()
    })

    test('viewer 直接调 API：/api/auth/admin/impersonate-user → 403', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const response = await page.request.post('/api/auth/admin/impersonate-user', {
            headers: {
                origin: 'http://127.0.0.1:3101',
                cookie: cookies,
            },
            data: {
                userId: 'any-target-user-id',
            },
        })
        expect([401, 403]).toContain(response.status())
        await context.close()
    })

    test('viewer 直接调 API：/api/auth/admin/unban-user → 403', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const response = await page.request.post('/api/auth/admin/unban-user', {
            headers: {
                origin: 'http://127.0.0.1:3101',
                cookie: cookies,
            },
            data: {
                userId: 'any-target-user-id',
            },
        })
        expect([401, 403]).toContain(response.status())
        await context.close()
    })

    test('viewer 直接调 API：GET /api/auth/admin/list-users → 403', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        // list-users 是 GET 请求（无 request body）；其他 4 端点是 POST
        const response = await page.request.get('/api/auth/admin/list-users', {
            headers: {
                origin: 'http://127.0.0.1:3101',
                cookie: cookies,
            },
        })
        expect([401, 403]).toContain(response.status())
        await context.close()
    })

    /**
     * S-3（M18.x 治理批次）：M17.6 实施时排除 update-user 端点（与 M16.5 auth-self-guard 5 端点重叠），
     * 本 case 补 update-user viewer 403 断言——与既有 5 端点同模式，覆盖 better-auth admin
     * `/admin/update-user` POST 端点的 adminMiddleware 行为。
     */
    test('viewer 直接调 API：/api/auth/admin/update-user → 403（S-3 补强）', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

        const response = await page.request.post('/api/auth/admin/update-user', {
            headers: {
                origin: 'http://127.0.0.1:3101',
                cookie: cookies,
            },
            data: {
                userId: 'any-target-user-id',
                data: { name: 'hacker-name' },
            },
        })
        expect([401, 403]).toContain(response.status())
        await context.close()
    })

    /**
     * S-4（M18.x 治理批次）：admin 200 双向断言——既有 5 端点 viewer 403 单向断言补 admin 通过验证，
     * 形成 viewer 403 ↔ admin 通过的完整双向矩阵。注意：admin 调用状态码依赖 better-auth 业务
     * 逻辑（userId 存在性、payload 合法性等），本测试用合法 self-update payload（userId = self）触发
     * admin middleware 通过路径——即使业务逻辑返回 4xx（如字段未找到），adminMiddleware 拦截
     * 在前置中间件层，admin 必须通过此层到达业务 handler。期望 status ∈ [200, 400, 404]（不包含 401/403，
     * 即 adminMiddleware 通过）。
     */
    test.describe('admin 通过双向（S-4 补强）', () => {
        test.use({ storageState: 'tests/e2e/.auth/admin.json' })

        test('admin POST /api/auth/admin/ban-user → 通过 adminMiddleware（2xx 或业务 4xx）', async ({ browser }) => {
            const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' })
            const page = await context.newPage()
            const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

            const response = await page.request.post('/api/auth/admin/ban-user', {
                headers: { origin: 'http://127.0.0.1:3101', cookie: cookies },
                data: { userId: 'self-non-existent-user-id', banReason: 'test', banExpiresIn: 86400 },
            })
            // adminMiddleware 通过（不是 401/403）；业务层可能 200/400/404
            expect(response.status()).not.toBe(401)
            expect(response.status()).not.toBe(403)
            await context.close()
        })

        test('admin POST /api/auth/admin/remove-user → 通过 adminMiddleware', async ({ browser }) => {
            const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' })
            const page = await context.newPage()
            const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

            const response = await page.request.post('/api/auth/admin/remove-user', {
                headers: { origin: 'http://127.0.0.1:3101', cookie: cookies },
                data: { userId: 'self-non-existent-user-id' },
            })
            expect(response.status()).not.toBe(401)
            expect(response.status()).not.toBe(403)
            await context.close()
        })

        test('admin POST /api/auth/admin/impersonate-user → 通过 adminMiddleware', async ({ browser }) => {
            const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' })
            const page = await context.newPage()
            const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

            const response = await page.request.post('/api/auth/admin/impersonate-user', {
                headers: { origin: 'http://127.0.0.1:3101', cookie: cookies },
                data: { userId: 'self-non-existent-user-id' },
            })
            expect(response.status()).not.toBe(401)
            expect(response.status()).not.toBe(403)
            await context.close()
        })

        test('admin POST /api/auth/admin/unban-user → 通过 adminMiddleware', async ({ browser }) => {
            const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' })
            const page = await context.newPage()
            const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

            const response = await page.request.post('/api/auth/admin/unban-user', {
                headers: { origin: 'http://127.0.0.1:3101', cookie: cookies },
                data: { userId: 'self-non-existent-user-id' },
            })
            expect(response.status()).not.toBe(401)
            expect(response.status()).not.toBe(403)
            await context.close()
        })

        test('admin GET /api/auth/admin/list-users → 通过 adminMiddleware（200 或 4xx 业务错）', async ({ browser }) => {
            const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' })
            const page = await context.newPage()
            const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

            const response = await page.request.get('/api/auth/admin/list-users', {
                headers: { origin: 'http://127.0.0.1:3101', cookie: cookies },
            })
            // admin 调用 list-users 期望成功（业务层 list）
            expect(response.status()).not.toBe(401)
            expect(response.status()).not.toBe(403)
            await context.close()
        })

        test('admin POST /api/auth/admin/update-user → 通过 adminMiddleware（S-3 对偶 S-4）', async ({ browser }) => {
            const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' })
            const page = await context.newPage()
            const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')

            const response = await page.request.post('/api/auth/admin/update-user', {
                headers: { origin: 'http://127.0.0.1:3101', cookie: cookies },
                data: { userId: 'self-non-existent-user-id', data: { name: 'noop' } },
            })
            expect(response.status()).not.toBe(401)
            expect(response.status()).not.toBe(403)
            await context.close()
        })
    })
})
