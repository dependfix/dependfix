import type { Page } from '@playwright/test'

/**
 * 构造含 admin session 的 Cookie header（让 APIRequestContext 在 HTTP 下也能携带 __Secure- cookie，
 * 因 better-auth session cookie 是 __Secure- + secure=true，浏览器在 HTTP 下不自动发送 → 需手工拼接 Cookie header）。
 *
 * 沿用 M16.3 / M16.5 三批次遗留重复（M17.5 S-2 抽取统一）：api-i18n / credentials-crud / repos-crud
 * 三个 e2e 文件定义**完全一致**的 `authedCookieHeader` 函数，迁移至 helpers/ 后零行为变更。
 */
export async function authedCookieHeader(page: Page): Promise<string> {
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    return cookies
}
