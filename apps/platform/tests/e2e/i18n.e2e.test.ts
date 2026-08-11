import { expect, test, type Page } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 国际化（i18n）闭环 e2e：
 * 1. 登录页双语渲染（无前缀 zh-CN / en 前缀英文）
 * 2. 导航栏语言切换器（切 en → 导航英文 + cookie 持久化 + 刷新保持 → 回切 zh）
 * 3. PrimeVue 内置文案联动（en 下 Dialog 关闭按钮 aria-label = Close，zh = 关闭）
 * 执行环境：playwright webServer 启动平台（QUEUE_ENABLED=false 强制 sync，见 playwright.config）。
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

/** 通过导航栏 Select 切换语言（选项列表按名称点击） */
async function switchLocale(page: Page, optionName: string): Promise<void> {
    await page.locator('.platform__lang').click()
    await page.locator('.p-select-overlay').getByText(optionName, { exact: true }).click()
}

test.describe('国际化（i18n 语言切换）', () => {
    test('登录页双语渲染（无前缀中文 / en 前缀英文）', async ({ browser }) => {
        // 未登录 context（登录页需未认证；storageState 仅作用于默认 context）
        const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3101' })
        const page = await context.newPage()

        await page.goto('/login')
        await waitForHydration(page)
        await expect(page.locator('.auth__subtitle')).toHaveText('登录管理平台', { timeout: 15000 })

        await page.goto('/en/login')
        await waitForHydration(page)
        await expect(page.locator('.auth__subtitle')).toHaveText('Sign in to the platform', { timeout: 15000 })
        // en 页面无中文残留
        await expect(page.locator('body')).not.toContainText('登录管理平台')

        await context.close()
    })

    test('导航栏切换器：切 en → 导航英文 + cookie 持久化 + 刷新保持 → 回切中文', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        await expect(page.locator('.platform__nav')).toContainText('仪表板', { timeout: 15000 })

        // 切 English（先等文案变化 = setLocale 完成，再断言 cookie）
        await switchLocale(page, 'English')
        await expect(page.locator('.platform__nav')).toContainText('Dashboard', { timeout: 15000 })
        await expect(page.locator('.platform__nav')).not.toContainText('仪表板')
        let cookies = await page.context().cookies()
        expect(cookies.find((c) => c.name === 'i18n_locale')?.value).toBe('en')

        // 刷新保持
        await page.reload()
        await waitForHydration(page)
        await expect(page.locator('.platform__nav')).toContainText('Dashboard', { timeout: 15000 })

        // 回切简体中文
        await switchLocale(page, '简体中文')
        await expect(page.locator('.platform__nav')).toContainText('仪表板', { timeout: 15000 })
        cookies = await page.context().cookies()
        expect(cookies.find((c) => c.name === 'i18n_locale')?.value).toBe('zh-CN')
    })

    test('PrimeVue 内置文案联动：en 下 Dialog 关闭按钮为 Close / zh 为关闭', async ({ page }) => {
        // 切 en（导航栏切换器，与用例 2 相同通道）
        await page.goto('/dashboard')
        await waitForHydration(page)
        await switchLocale(page, 'English')
        await expect(page.locator('.platform__nav')).toContainText('Dashboard', { timeout: 15000 })

        // 直接访问 /en/repos（带前缀 URL，避免无前缀 + en cookie 的服务器 locale 重定向）
        await page.goto('/en/repos')
        await waitForHydration(page)
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        // 添加仓库 → Dialog 打开（PrimeVue 内置关闭按钮 aria-label 来自 locale）
        await page.locator('button:has-text("Add repository")').click()
        const dialog = page.locator('.p-dialog')
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect(dialog.locator('.p-dialog-header-actions button')).toHaveAttribute('aria-label', 'Close')
        await dialog.locator('.p-dialog-header-actions button').click()
        await expect(dialog).toBeHidden()

        // 回切 zh → 关闭按钮为"关闭"
        await switchLocale(page, '简体中文')
        await expect(page.locator('.platform__nav')).toContainText('仓库', { timeout: 15000 })
        await page.locator('button:has-text("添加仓库")').click()
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect(dialog.locator('.p-dialog-header-actions button')).toHaveAttribute('aria-label', '关闭')
    })
})
