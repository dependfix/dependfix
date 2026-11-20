import { expect, test } from '@playwright/test'
import { unauthenticatedApiContext } from './helpers/unauthenticated-api.helper'

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
