import { expect, test } from '@playwright/test'
import { unauthenticatedApiContext } from './helpers/unauthenticated-api.helper'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * v1 API key 端到端：创建（一次性明文）→ 无 Cookie 的 Bearer 访问 → 列表只出前缀 → 吊销立即失效。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('/api/v1/keys 与 API key 鉴权', () => {
    test('创建 / 使用 / 列表 / 吊销闭环', async ({ page, browser }) => {
        const name = `e2e-key-${Date.now()}`
        const created = await page.request.post('/api/v1/keys', { data: { name } })
        expect(created.status()).toBe(200)
        const keyBody = await created.json() as {
            id: string
            key: string
            prefix: string
            expiresAt: string
        }
        expect(keyBody.key.startsWith('dfk_')).toBe(true)
        expect(keyBody.prefix).toBe('dfk_')
        const ttlDays = (Date.parse(keyBody.expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)
        expect(ttlDays).toBeGreaterThan(89)
        expect(ttlDays).toBeLessThan(91)

        const keyContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
        try {
            // 无会话，仅 Bearer：可访问只读端点
            const repos = await keyContext.request.get('/api/v1/repos?pageSize=1', {
                headers: { authorization: `Bearer ${keyBody.key}` },
            })
            expect(repos.status()).toBe(200)
            const runs = await keyContext.request.get('/api/v1/runs?pageSize=1', {
                headers: { authorization: `Bearer ${keyBody.key}` },
            })
            expect(runs.status()).toBe(200)
            expect(runs.headers()['access-control-allow-origin']).toBeUndefined()
            for (const path of ['/api/v1/alerts?pageSize=1', '/api/v1/pr-checks?pageSize=1', '/api/v1/dashboard/stats']) {
                const response = await keyContext.request.get(path, { headers: { authorization: `Bearer ${keyBody.key}` } })
                expect(response.status(), path).toBe(200)
            }

            // 无效 key → 401
            const invalid = await keyContext.request.get('/api/v1/repos', {
                headers: { authorization: 'Bearer dfk_not-a-real-key' },
            })
            expect(invalid.status()).toBe(401)
        } finally {
            await keyContext.close()
        }

        // 列表只出前缀 / 元数据，不返回明文
        const listed = await page.request.get('/api/v1/keys')
        expect(listed.status()).toBe(200)
        const listBody = await listed.json() as { items: Record<string, unknown>[] }
        const row = listBody.items.find((item) => item.id === keyBody.id)
        expect(row).toBeTruthy()
        expect(row).not.toHaveProperty('key')
        expect(row!.prefix).toBe('dfk_')

        // 吊销后立即失效
        const deleted = await page.request.delete(`/api/v1/keys/${keyBody.id}`)
        expect(deleted.status()).toBe(200)
        const revokedContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
        try {
            const revoked = await revokedContext.request.get('/api/v1/repos', {
                headers: { authorization: `Bearer ${keyBody.key}` },
            })
            expect(revoked.status()).toBe(401)
        } finally {
            await revokedContext.close()
        }
    })

    test('viewer 无 key 管理权限', async ({ browser }) => {
        const viewerContext = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        try {
            const response = await viewerContext.request.get('/api/v1/keys')
            expect(response.status()).toBe(403)
        } finally {
            await viewerContext.close()
        }
    })

    test('未认证 context 访问 key 管理返回 401', async ({ browser }) => {
        const context = await unauthenticatedApiContext(browser)
        try {
            const response = await context.request.get('/api/v1/keys')
            expect(response.status()).toBe(401)
        } finally {
            await context.close()
        }
    })
})

test.describe('API 密钥管理页面', () => {
    test('创建 -> 一次性明文 -> 列表 -> 吊销闭环', async ({ page }) => {
        const name = `ui-key-${Date.now()}`
        await page.goto('/api-keys')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('API 密钥', { timeout: 15000 })

        await page.locator('button:has-text("创建密钥")').click()
        await expect(page.locator('.caomei-dialog__header')).toContainText('创建 API 密钥', { timeout: 15000 })
        await page.locator('input#api-key-name').fill(name)
        await page.locator('.caomei-dialog__content button:has-text("新建")').click()

        await expect(page.locator('.caomei-dialog__header')).toContainText('密钥已创建', { timeout: 15000 })
        const secret = (await page.locator('.api-keys__secret-value').innerText()).trim()
        expect(secret.startsWith('dfk_')).toBe(true)
        expect(secret.length).toBeGreaterThan(20)

        // 关闭后明文不再出现在 DOM（只存在一次性弹窗的内存里）
        await page.locator('.caomei-dialog__close').click()
        await expect(page.locator('.api-keys__secret-value')).toHaveCount(0)
        expect(await page.content()).not.toContain(secret)

        // 刷新后仍不可再取，且未落入 Web Storage
        await page.reload()
        await waitForHydration(page)
        expect(await page.content()).not.toContain(secret)
        const storage = await page.evaluate(() => JSON.stringify({
            local: Object.entries(localStorage),
            session: Object.entries(sessionStorage),
        }))
        expect(storage).not.toContain(secret)

        // 列表可见新 key（只显示前缀 / 名称）
        await expect(page.locator('.caomei-data-table')).toContainText(name, { timeout: 15000 })

        // 吊销：二次确认后从列表消失
        const row = page.locator('.caomei-data-table__row', { hasText: name })
        await row.locator('button[aria-label="吊销"]').click()
        await page.locator('.caomei-confirm-dialog__footer button').last().click()
        await expect(page.locator('.caomei-message--success')).toContainText('密钥已吊销', { timeout: 15000 })
        await expect(page.locator('.caomei-data-table')).not.toContainText(name)
    })

    test('viewer 直接访问显示无权限且无创建入口', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        try {
            await page.goto('/api-keys')
            await waitForHydration(page)
            await expect(page.locator('text=当前账号无 API 密钥管理权限')).toBeVisible({ timeout: 15000 })
            await expect(page.locator('text=仅 admin / org_admin 可查看与管理 API 密钥')).toBeVisible({ timeout: 15000 })
            await expect(page.locator('button:has-text("创建密钥")')).toHaveCount(0)
            expect(await page.content()).not.toContain('点击右上角创建')
        } finally {
            await context.close()
        }
    })
})

test.describe('导航布局（API 密钥入口）', () => {
    test('1440 视口导航单行、不溢出 header', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto('/api-keys')
        await waitForHydration(page)
        const geometry = await page.evaluate(() => {
            const header = document.querySelector('.platform__header') as HTMLElement
            const nav = document.querySelector('.platform__nav') as HTMLElement
            const navRect = nav.getBoundingClientRect()
            const headerRect = header.getBoundingClientRect()
            return {
                navHeight: navRect.height,
                navTop: navRect.top,
                navBottom: navRect.bottom,
                headerHeight: headerRect.height,
                scrollWidth: nav.scrollWidth,
                clientWidth: nav.clientWidth,
            }
        })
        expect(geometry.navHeight).toBeLessThanOrEqual(40)
        expect(geometry.navTop).toBeGreaterThanOrEqual(-0.5)
        expect(geometry.navBottom).toBeLessThanOrEqual(geometry.headerHeight + 0.5)
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
    })

    test('1280 窄屏导航可横向滚动且 API 密钥入口可达', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto('/api-keys')
        await waitForHydration(page)
        const geometry = await page.evaluate(() => {
            const nav = document.querySelector('.platform__nav') as HTMLElement
            return {
                scrollWidth: nav.scrollWidth,
                clientWidth: nav.clientWidth,
                overflowX: getComputedStyle(nav).overflowX,
            }
        })
        expect(geometry.overflowX).toBe('auto')
        expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth)
        const link = page.locator('.platform__nav-link', { hasText: 'API 密钥' })
        await link.scrollIntoViewIfNeeded()
        await expect(link).toBeVisible()
    })
})
