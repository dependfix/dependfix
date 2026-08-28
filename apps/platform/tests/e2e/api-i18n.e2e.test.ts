import { type Page, expect, test } from '@playwright/test'

/**
 * 服务端 API 错误响应 i18n 闭环 e2e（todo.md §M16.3 C36）：
 *
 * 覆盖 surface：
 * - /api/repos POST 409 重复 → REPO_DUPLICATE
 * - /api/runs/[id] GET 404 → SCAN_RUN_NOT_FOUND
 * - /api/repos POST 405 → METHOD_NOT_ALLOWED
 * - /api/repos POST 400 zod 验证失败 → REPO_VALIDATION_FAILED + data.issues
 *
 * 验证维度：
 * - Accept-Language 头切换 message 双语
 * - i18n_locale cookie 优先级高于 Accept-Language
 * - 未知 locale 降级到默认 zh-CN
 * - 响应包含 data.code 强契约字段
 *
 * 注意点：
 * - e2e webServer 跑 HTTP，但 better-auth session cookie 是 __Secure- + secure=true，
 *   浏览器在 HTTP 下不自动发送 → 用 page.context().cookies() 取全部 cookie 后手工拼接 Cookie header
 * - admin storageState 默认带 i18n_locale=zh-CN cookie，会覆盖 Accept-Language；
 *   每个测试用 clearI18nCookie / setI18nCookie 显式控制 locale 来源
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

/** 构造含 admin session 的 Cookie header（让 APIRequestContext 在 HTTP 下也能携带 __Secure- cookie） */
async function authedCookieHeader(page: Page): Promise<string> {
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    return cookies
}

/** 移除 admin storageState 默认带上的 i18n_locale cookie，让 Accept-Language 起作用 */
async function clearI18nCookie(page: Page): Promise<void> {
    await page.context().clearCookies({ name: 'i18n_locale' })
}

/** 显式覆盖 i18n_locale cookie（验证 cookie 优先级时用） */
async function setI18nCookie(page: Page, value: 'en' | 'zh-CN'): Promise<void> {
    await page.context().addCookies([{
        name: 'i18n_locale',
        value,
        domain: '127.0.0.1',
        path: '/',
    }])
}

/** 触发 /api/repos POST 409 重复（先创建一次，再用同一 payload 创建第二次） */
async function createRepoOnce(page: Page, owner: string): Promise<void> {
    const cookieHeader = await authedCookieHeader(page)
    const response = await page.request.post('/api/repos', {
        headers: { cookie: cookieHeader },
        data: {
            owner,
            name: 'api-i18n-test',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        },
    })
    expect(response.status()).toBe(200)
}

test.describe('服务端 API 错误响应 i18n（M16.3 C36）', () => {
    test('POST /api/repos 重复仓库：Accept-Language: zh-CN → 中文 message + data.code: REPO_DUPLICATE', async ({ page }) => {
        await page.goto('/dashboard')
        await clearI18nCookie(page) // 让 Accept-Language 起作用（清掉 storageState 默认 cookie）
        const owner = `dup-zh-${Date.now()}`
        await createRepoOnce(page, owner)

        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.post('/api/repos', {
            headers: {
                cookie: cookieHeader,
                'accept-language': 'zh-CN,zh;q=0.9',
            },
            data: {
                owner,
                name: 'api-i18n-test',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })
        expect(response.status()).toBe(409)
        const body = await response.json()
        expect(body.message).toBe('该仓库已存在')
        expect(body.data?.code).toBe('REPO_DUPLICATE')
    })

    test('POST /api/repos 重复仓库：Accept-Language: en-US → 英文 message + data.code 不变', async ({ page }) => {
        await page.goto('/dashboard')
        await clearI18nCookie(page)
        const owner = `dup-en-${Date.now()}`
        await createRepoOnce(page, owner)

        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.post('/api/repos', {
            headers: {
                cookie: cookieHeader,
                'accept-language': 'en-US,en;q=0.9',
            },
            data: {
                owner,
                name: 'api-i18n-test',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })
        expect(response.status()).toBe(409)
        const body = await response.json()
        expect(body.message).toBe('Repository already exists')
        // code 强契约：服务端永远英文，与 locale 无关
        expect(body.data?.code).toBe('REPO_DUPLICATE')
    })

    test('POST /api/repos 重复仓库：i18n_locale cookie=en 优先于 Accept-Language: zh-CN', async ({ page }) => {
        await page.goto('/dashboard')
        await setI18nCookie(page, 'en')
        const owner = `dup-cookie-${Date.now()}`
        await createRepoOnce(page, owner)

        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.post('/api/repos', {
            headers: {
                cookie: cookieHeader,
                'accept-language': 'zh-CN,zh;q=0.9',
            },
            data: {
                owner,
                name: 'api-i18n-test',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })
        expect(response.status()).toBe(409)
        const body = await response.json()
        // cookie=en 胜 → 英文 message（即便 Accept-Language 是中文）
        expect(body.message).toBe('Repository already exists')
        expect(body.data?.code).toBe('REPO_DUPLICATE')
    })

    test('POST /api/repos 重复仓库：未知 locale (ja-JP) → 默认 zh-CN', async ({ page }) => {
        await page.goto('/dashboard')
        await clearI18nCookie(page)
        const owner = `dup-ja-${Date.now()}`
        await createRepoOnce(page, owner)

        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.post('/api/repos', {
            headers: {
                cookie: cookieHeader,
                'accept-language': 'ja-JP,ja;q=0.9',
            },
            data: {
                owner,
                name: 'api-i18n-test',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            },
        })
        expect(response.status()).toBe(409)
        const body = await response.json()
        // 未知 locale 走默认 zh-CN
        expect(body.message).toBe('该仓库已存在')
        expect(body.data?.code).toBe('REPO_DUPLICATE')
    })

    test('GET /api/runs/[id]：不存在 → 404 + SCAN_RUN_NOT_FOUND 双语对称', async ({ page }) => {
        await page.goto('/dashboard')
        await clearI18nCookie(page)
        const nonexistentId = '00000000-0000-0000-0000-000000000000'
        const cookieHeader = await authedCookieHeader(page)

        // zh-CN
        const zhRes = await page.request.get(`/api/runs/${nonexistentId}`, {
            headers: { cookie: cookieHeader, 'accept-language': 'zh-CN' },
        })
        expect(zhRes.status()).toBe(404)
        const zhBody = await zhRes.json()
        expect(zhBody.message).toBe('扫描记录不存在')
        expect(zhBody.data?.code).toBe('SCAN_RUN_NOT_FOUND')

        // en
        const enRes = await page.request.get(`/api/runs/${nonexistentId}`, {
            headers: { cookie: cookieHeader, 'accept-language': 'en-US' },
        })
        expect(enRes.status()).toBe(404)
        const enBody = await enRes.json()
        expect(enBody.message).toBe('Scan run not found')
        expect(enBody.data?.code).toBe('SCAN_RUN_NOT_FOUND')
    })

    test('PUT /api/repos：405 Method Not Allowed + METHOD_NOT_ALLOWED 双语', async ({ page }) => {
        await page.goto('/dashboard')
        await clearI18nCookie(page)
        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.put('/api/repos', {
            headers: { cookie: cookieHeader, 'accept-language': 'en-US' },
            data: {},
        })
        expect(response.status()).toBe(405)
        const body = await response.json()
        expect(body.message).toBe('Method not allowed')
        expect(body.data?.code).toBe('METHOD_NOT_ALLOWED')
    })

    test('POST /api/repos：Zod 验证失败 → 静态 "Request validation failed" + data.code + data.issues 透传', async ({ page }) => {
        await page.goto('/dashboard')
        await clearI18nCookie(page)
        const cookieHeader = await authedCookieHeader(page)
        const response = await page.request.post('/api/repos', {
            headers: { cookie: cookieHeader, 'accept-language': 'en-US' },
            // 故意缺少必填字段 owner/name 等
            data: { owner: 'invalid-only' },
        })
        expect(response.status()).toBe(400)
        const body = await response.json()
        expect(body.message).toBe('Request validation failed')
        expect(body.data?.code).toBe('REPO_VALIDATION_FAILED')
        expect(Array.isArray(body.data?.issues)).toBe(true)
        expect(body.data.issues.length).toBeGreaterThan(0)
    })
})
