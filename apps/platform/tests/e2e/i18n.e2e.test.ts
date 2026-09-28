import { expect, test, type Page } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 国际化（i18n）闭环 e2e：
 * 1. 登录页双语渲染（无前缀 zh-CN / en 前缀英文）
 * 2. 导航栏语言切换器（切 en → 导航英文 + cookie 持久化 + 刷新保持 → 回切 zh）
 * 3. caomei 内置文案联动（en 下 Dialog 关闭按钮 aria-label = Close，zh = 关闭；
 *    caomei locale 由 app.vue 的 CaomeiConfigProvider 绑定平台 i18n，en → en-US）
 * 执行环境：playwright webServer 启动平台（QUEUE_ENABLED=false 强制 sync，见 playwright.config）。
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

/** 通过导航栏 Select 切换语言（选项列表按名称点击） */
async function switchLocale(page: Page, optionName: string): Promise<void> {
    await page.locator('.platform__lang .caomei-select').click()
    await page.locator('.caomei-select__content').getByText(optionName, { exact: true }).click()
}

test.describe('国际化（i18n 语言切换）', () => {
    test('登录页双语渲染（无前缀中文 / en 前缀英文）', async ({ browser }, testInfo) => {
        // 未登录 context（登录页需未认证；storageState 仅作用于默认 context）
        // baseURL 取自当前 project 配置，避免硬编码端口（并行执行体/本地覆盖端口下仍可用）
        const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
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
        // setLocale 会跳转到带前缀的本地化路由；等导航落地再做 cookie/刷新断言，
        // 避免 reload 抢在客户端路由跳转完成前触发（冷启动时会把 URL 回退到无前缀 = 默认中文）
        await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 15000 })
        let cookies = await page.context().cookies()
        expect(cookies.find((c) => c.name === 'i18n_locale')?.value).toBe('en')

        // 刷新保持
        await page.reload()
        await waitForHydration(page)
        await expect(page.locator('.platform__nav')).toContainText('Dashboard', { timeout: 15000 })

        // 回切简体中文
        await switchLocale(page, '简体中文')
        await expect(page.locator('.platform__nav')).toContainText('仪表板', { timeout: 15000 })
        // 回切后 URL 必须是默认（无前缀）或 zh-CN 前缀路由；`toHaveURL` 对完整 URL 做子串匹配，
        // 故必须锚定 host + 尾部（否则 `/en/dashboard` 也会命中）
        await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(zh-CN\/)?dashboard$/, { timeout: 15000 })
        cookies = await page.context().cookies()
        expect(cookies.find((c) => c.name === 'i18n_locale')?.value).toBe('zh-CN')
    })

    test('caomei 内置文案联动：en 下 Dialog 关闭按钮为 Close / zh 为关闭', async ({ page }) => {
        // 切 en（导航栏切换器，与用例 2 相同通道）
        await page.goto('/dashboard')
        await waitForHydration(page)
        await switchLocale(page, 'English')
        await expect(page.locator('.platform__nav')).toContainText('Dashboard', { timeout: 15000 })

        // 直接访问 /en/repos（带前缀 URL，避免无前缀 + en cookie 的服务器 locale 重定向）
        await page.goto('/en/repos')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })
        // 添加仓库 → CaomeiDialog 打开（关闭按钮 aria-label 来自 caomei 内置 locale）
        await page.locator('button:has-text("Add repository")').click()
        const dialog = page.locator('.caomei-dialog__content')
        await expect(dialog).toBeVisible({ timeout: 15000 })
        const closeButton = dialog.locator('.caomei-dialog__close')
        await expect(closeButton).toHaveAttribute('aria-label', 'Close')
        await closeButton.click()
        await expect(dialog).toBeHidden()

        // 回切 zh → 关闭按钮为"关闭"
        await switchLocale(page, '简体中文')
        await expect(page.locator('.platform__nav')).toContainText('仓库', { timeout: 15000 })
        await page.locator('button:has-text("添加仓库")').click()
        await expect(dialog).toBeVisible({ timeout: 15000 })
        await expect(dialog.locator('.caomei-dialog__close')).toHaveAttribute('aria-label', '关闭')
    })

    test('用户管理角色标签随语言切换（zh-CN 管理员 / 观察者；en Admin / Viewer）', async ({ page }) => {
        // 默认 zh-CN → 角色 Tag 应为中文（实际用户 admin / viewer，对应"管理员" / "观察者"；
        // "组织管理员"仅出现在 Select option，未实际分配给任何用户时不进入 DataTable）
        await page.goto('/users')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toContainText('管理员', { timeout: 15000 })
        await expect(page.locator('.caomei-data-table')).toContainText('观察者')

        // 切 en → 角色 Tag 应为英文
        await page.goto('/dashboard')
        await waitForHydration(page)
        await switchLocale(page, 'English')
        await expect(page.locator('.platform__nav')).toContainText('Dashboard', { timeout: 15000 })
        await page.goto('/en/users')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toContainText('Admin', { timeout: 15000 })
        await expect(page.locator('.caomei-data-table')).toContainText('Viewer')
        // 无中文残留
        await expect(page.locator('.caomei-data-table')).not.toContainText('管理员')
    })
})
