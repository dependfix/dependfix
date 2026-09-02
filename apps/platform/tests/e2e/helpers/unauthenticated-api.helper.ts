import type { Browser } from '@playwright/test'

/**
 * 创建未认证 API 请求 context（强制空 storageState 隔离上游 cookie 注入）。
 *
 * 根因（M22.8 hotfix `bdcd900` + 经验归档 §五十二）：Playwright 1.62 fixture pool 会通过
 * `test.use({ storageState })` 跨 scope 污染 describe 块内的手动 `browser.newContext()` 调用
 * ——即使新 context 未显式传 storageState，仍会携带上游 session token，导致"未认证 API"
 * 测试（期望 401/403）莫名收到 200。
 *
 * 修复模式（Playwright 1.62 文档推荐的 "unauthenticated API call" 模式）：显式传
 * `storageState: { cookies: [], origins: [] }` 强制清空 cookies/origins，与 describe 块
 * `test.use({ storageState })` 完全脱钩。
 *
 * 适用场景：M22.8 hotfix 引入，已在 `credentials-api.e2e.test.ts` 和
 * `repos-api.e2e.test.ts` 各 1 处使用，未来"未认证 API"测试统一走此 helper。
 */
export function unauthenticatedApiContext(browser: Browser) {
    return browser.newContext({ storageState: { cookies: [], origins: [] } })
}
