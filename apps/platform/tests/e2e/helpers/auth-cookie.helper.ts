import type { Page } from '@playwright/test'

/**
 * 构造含 admin session 的 Cookie header（让 APIRequestContext 在 HTTP 下也能携带 __Secure- cookie，
 * 因 better-auth session cookie 是 __Secure- + secure=true，浏览器在 HTTP 下不自动发送 → 需手工拼接 Cookie header）。
 *
 * 抽取来源：api-i18n / credentials-crud / repos-crud 三个 e2e 文件曾定义**完全一致**的
 * `authedCookieHeader` 函数，统一迁移至 helpers/ 后零行为变更。现由 credentials-crud / repos-crud
 * 等使用；api-i18n 已改用文件内 `requestCookieHeader` 显式剥离 `i18n_locale`（规避客户端 i18n
 * 异步改写 cookie 与测试设置的 locale 竞争 → 全量顺序运行偶发语言断言失败）。
 */
export async function authedCookieHeader(page: Page): Promise<string> {
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    return cookies
}
