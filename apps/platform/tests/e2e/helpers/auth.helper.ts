import { type APIRequestContext, type Page, expect } from '@playwright/test'
import { waitForHydration } from './hydration.helper'

/**
 * e2e 测试账号（global-setup 注册首用户 admin；viewer 测试内注册）。
 * 独立 e2e 数据库，与开发/生产环境完全隔离。
 */
export const TEST_ADMIN = {
    email: 'e2e-admin@dependfix.test',
    password: 'E2eAdmin123',
    name: 'E2E Admin',
}

export const TEST_VIEWER = {
    email: 'e2e-viewer@dependfix.test',
    password: 'E2eViewer123',
    name: 'E2E Viewer',
}

/** e2e 服务地址（与 playwright.config e2eBaseURL 一致；API 请求需模拟浏览器同源 Origin，
 *  否则 better-auth 的 Origin 校验对 `Origin: null` 返回 403 MISSING_OR_NULL_ORIGIN） */
export const E2E_ORIGIN = 'http://127.0.0.1:3101'

/** 通过 API 注册用户（sign-up/email；首个注册用户自动 admin） */
export async function apiSignUp(request: APIRequestContext, user: { email: string, password: string, name: string }): Promise<void> {
    const response = await request.post('/api/auth/sign-up/email', {
        headers: { origin: E2E_ORIGIN },
        data: {
            email: user.email,
            password: user.password,
            name: user.name,
        },
    })
    // 已存在也视为成功（幂等：重复运行 e2e 时库已含账号）
    expect([200, 201, 422].includes(response.status()), `sign-up ${user.email} status ${response.status()}`).toBeTruthy()
}

/** 通过 API 登录并返回 Set-Cookie（供 API 级断言使用） */
export async function apiSignIn(request: APIRequestContext, user: { email: string, password: string }): Promise<string> {
    const response = await request.post('/api/auth/sign-in/email', {
        headers: { origin: E2E_ORIGIN },
        data: {
            email: user.email,
            password: user.password,
        },
    })
    expect(response.status()).toBe(200)
    const cookies = response.headers()['set-cookie'] ?? ''
    expect(cookies).toContain('better-auth.session_token')
    return cookies
}

/** 页面级登录（用于 storageState 之外的测试） */
export async function pageSignIn(page: Page, user: { email: string, password: string }): Promise<void> {
    await page.goto('/login')
    // 等待 hydration（SSR 静态 DOM 无事件绑定；global-setup 与各测试共用此路径）
    await waitForHydration(page)
    await page.locator('input#email').fill(user.email)
    await page.locator('#password input').fill(user.password)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/dashboard/)
}
