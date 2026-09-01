import { expect, test } from '@playwright/test'
import { authedCookieHeader } from './helpers/auth-cookie.helper'

/**
 * 凭据管理 API 集成测试（todo.md §M19.4 T701-e2e）：
 * 1. POST /api/credentials — admin 创建凭据，参数验证
 * 2. GET /api/credentials — admin/viewer 列表（脱敏视图）
 * 3. GET /api/credentials/[id] — admin/viewer 详情（脱敏）
 * 4. PUT /api/credentials/[id] — admin 更新，viewer 403
 * 5. DELETE /api/credentials/[id] — admin 删除，viewer 403
 * 6. 类型验证：type=classic-pat / fine-grained-pat / github-app
 */

test.describe('凭据管理 API 集成（todo.md §M19.4 T701-e2e）', () => {
    test.use({ storageState: 'tests/e2e/.auth/admin.json' })

    function uniqueStamp(): string {
        return Date.now().toString(36)
    }

    test('POST /api/credentials 创建 classic-pat 凭据 → 200 + 脱敏视图', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        const token = `ghp_secret_${stamp}`
        const response = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: `api-cred-classic-${stamp}`, type: 'classic-pat', token, note: 'e2e test' },
        })
        expect(response.status()).toBe(200)
        const body = await response.json()
        // 脱敏：token 明文不应出现在响应中
        expect(JSON.stringify(body)).not.toContain(token)
        // 视图字段
        expect(body).toMatchObject({
            name: `api-cred-classic-${stamp}`,
            type: 'classic-pat',
            hasToken: true,
            id: expect.any(String),
        })
        expect(body.encryptedToken).toBeUndefined()
        expect(body.encryptedPrivateKey).toBeUndefined()
    })

    test('POST /api/credentials 创建 fine-grained-pat 凭据 → 200', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        const response = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: `api-cred-fineg-${stamp}`, type: 'fine-grained-pat', token: `ghp_fine_${stamp}` },
        })
        expect(response.status()).toBe(200)
        const body = await response.json()
        expect(body).toMatchObject({ type: 'fine-grained-pat', hasToken: true })
    })

    test('POST /api/credentials 创建 github-app 凭据 → 200 + appId/installationId/botLogin', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        const response = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: {
                name: `api-cred-app-${stamp}`,
                type: 'github-app',
                appId: '123456',
                installationId: '78901234',
                encryptedPrivateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAabcdefghijklmnopqrstuvwxyz0123456789ABCDEF\n-----END RSA PRIVATE KEY-----',
                botLogin: `dependfix-bot-${stamp}`,
            },
        })
        expect(response.status()).toBe(200)
        const body = await response.json()
        expect(body).toMatchObject({
            type: 'github-app',
            hasToken: true,
            appId: '123456',
            installationId: '78901234',
            botLogin: `dependfix-bot-${stamp}`,
        })
    })

    test('POST /api/credentials 缺 name → 400', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { type: 'classic-pat', token: 'ghp_x' }, // 缺 name
        })
        expect(response.status()).toBe(400)
        const body = await response.json()
        expect(body.data?.code).toBe('CREDENTIAL_VALIDATION_FAILED')
    })

    test('POST /api/credentials classic-pat 缺 token → 400', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        const response = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: `no-token-${stamp}`, type: 'classic-pat' }, // 缺 token
        })
        expect(response.status()).toBe(400)
    })

    test('POST /api/credentials github-app 缺 appId → 400', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        const response = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: {
                name: `no-appid-${stamp}`,
                type: 'github-app',
                installationId: `inst_${stamp}`,
                encryptedPrivateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAabcdefghijklmnopqrstuvwxyz0123456789ABCDEF\n-----END RSA PRIVATE KEY-----',
            }, // 缺 appId
        })
        expect(response.status()).toBe(400)
    })

    test('GET /api/credentials 列表 → 200 + 数组', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.get('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(response.status()).toBe(200)
        const body = await response.json()
        expect(Array.isArray(body)).toBe(true)
    })

    test('GET /api/credentials/[id] 已存在凭据 → 200 + 脱敏', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        // 创建
        const createRes = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: `get-detail-${stamp}`, type: 'classic-pat', token: `ghp_${stamp}` },
        })
        const { id } = await createRes.json()
        // 查询
        const getRes = await page.context().request.get(`/api/credentials/${id}`, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(getRes.status()).toBe(200)
        const detail = await getRes.json()
        expect(detail.id).toBe(id)
        expect(detail.hasToken).toBe(true)
        // 脱敏：响应中不应出现明文 token
        expect(JSON.stringify(detail)).not.toContain(`ghp_${stamp}`)
    })

    test('GET /api/credentials/[id] 不存在 → 404', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.get('/api/credentials/non-existent-id-12345', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(response.status()).toBe(404)
    })

    test('PUT /api/credentials/[id] 更新 name → 200', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        const createRes = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: `update-${stamp}`, type: 'classic-pat', token: `ghp_${stamp}` },
        })
        const { id } = await createRes.json()
        // 更新（不传 token，保持原有 token）
        const updateRes = await page.context().request.put(`/api/credentials/${id}`, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: `updated-${stamp}`, note: 'updated' },
        })
        expect(updateRes.status()).toBe(200)
        // 验证更新生效
        const getRes = await page.context().request.get(`/api/credentials/${id}`, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        const detail = await getRes.json()
        expect(detail.name).toBe(`updated-${stamp}`)
        expect(detail.note).toBe('updated')
    })

    test('PUT /api/credentials/[id] 不存在 → 404', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.put('/api/credentials/non-existent-id-12345', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: 'new-name' },
        })
        expect(response.status()).toBe(404)
        const body = await response.json()
        expect(body.data?.code).toBe('CREDENTIAL_NOT_FOUND')
    })

    test('DELETE /api/credentials/[id] 删除 → 200 + 后续 GET 404', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const stamp = uniqueStamp()
        const createRes = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: `delete-${stamp}`, type: 'classic-pat', token: `ghp_${stamp}` },
        })
        const { id } = await createRes.json()
        // 删除
        const delRes = await page.context().request.delete(`/api/credentials/${id}`, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(delRes.status()).toBe(200)
        const delBody = await delRes.json()
        expect(delBody).toMatchObject({ id, deleted: true })
        // 验证已删除
        const getRes = await page.context().request.get(`/api/credentials/${id}`, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(getRes.status()).toBe(404)
    })

    test('DELETE /api/credentials/[id] 不存在 → 404', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.delete('/api/credentials/non-existent-id-12345', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(response.status()).toBe(404)
        const body = await response.json()
        expect(body.data?.code).toBe('CREDENTIAL_NOT_FOUND')
    })

    test('POST /api/credentials 支持的方法 → PUT/DELETE 405', async ({ page }) => {
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.put('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: 'x' },
        })
        expect(response.status()).toBe(405)
        const body = await response.json()
        expect(body.data?.code).toBe('METHOD_NOT_ALLOWED')
    })
})

test.describe('凭据管理 API 鉴权边界（todo.md §M19.4 T701-e2e）', () => {
    test.use({ storageState: 'tests/e2e/.auth/viewer.json' })

    test('viewer GET /api/credentials → 200（列表只读）', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.get('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(response.status()).toBe(200)
        await context.close()
    })

    test('viewer POST /api/credentials → 403（写操作限 admin/org_admin）', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.post('/api/credentials', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: 'viewer-attempt', type: 'classic-pat', token: 'ghp_x' },
        })
        expect(response.status()).toBe(403)
        await context.close()
    })

    test('viewer PUT /api/credentials/[id] → 403', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.put('/api/credentials/any-id', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data: { name: 'updated' },
        })
        expect(response.status()).toBe(403)
        await context.close()
    })

    test('viewer DELETE /api/credentials/[id] → 403', async ({ browser }) => {
        const context = await browser.newContext({ storageState: 'tests/e2e/.auth/viewer.json' })
        const page = await context.newPage()
        const cookies = await authedCookieHeader(page)
        const response = await page.context().request.delete('/api/credentials/any-id', {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(response.status()).toBe(403)
        await context.close()
    })

    test('未认证 GET /api/credentials → 401', async ({ browser }) => {
        // 强制空 storageState（避免任何上游 cookie 注入——CI run 33533376712 实证：未显式传
        // storageState: { cookies: [], origins: [] } 时，新 context 可能携带上游 session，
        // 导致期望 401 的请求被认证通过收到 200）
        const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
        const page = await context.newPage()
        const response = await page.context().request.get('/api/credentials', {
            headers: { origin: 'http://127.0.0.1:3101' },
        })
        expect(response.status()).toBe(401)
        await context.close()
    })
})
