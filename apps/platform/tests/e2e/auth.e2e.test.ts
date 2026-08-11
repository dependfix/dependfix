import { test, expect } from '@playwright/test'
import { TEST_ADMIN, TEST_VIEWER, pageSignIn } from './helpers/auth.helper'
import { waitForHydration } from './helpers/hydration.helper'

test.describe('认证流程', () => {
    test('未登录访问受保护页面跳转 /login', async ({ page }) => {
        await page.goto('/dashboard')
        await expect(page).toHaveURL(/\/login/)
    })

    test('登录页表单渲染', async ({ page }) => {
        await page.goto('/login')
        await expect(page.locator('input#email')).toBeVisible()
        await expect(page.locator('#password input')).toBeVisible()
        await expect(page.locator('button[type="submit"]')).toBeVisible()
        await expect(page.locator('a[href="/register"]')).toBeVisible()
    })

    test('未配置第三方凭据时登录页第三方登录区隐藏（GitHub/Google/OIDC 按钮均不显示）', async ({ page }) => {
        await page.goto('/login')
        // 第三方登录区（auth__social）整体不渲染；各按钮零命中
        await expect(page.locator('.auth__social')).toHaveCount(0)
        await expect(page.locator('button:has-text("GitHub 登录")')).toHaveCount(0)
        await expect(page.locator('button:has-text("Google 登录")')).toHaveCount(0)
        await expect(page.locator('button:has-text("企业 SSO 登录")')).toHaveCount(0)
    })

    test('错误凭据提示登录失败且停留在登录页', async ({ page }) => {
        await page.goto('/login')
        await waitForHydration(page)
        await page.locator('input#email').fill('wrong@dependfix.test')
        await page.locator('#password input').fill('wrong-password')
        await page.locator('button[type="submit"]').click()
        await expect(page.locator('.auth')).toBeVisible()
        await expect(page).toHaveURL(/\/login/)
    })

    test('注册页表单渲染', async ({ page }) => {
        await page.goto('/register')
        await expect(page.locator('input#email')).toBeVisible()
        await expect(page.locator('#password input')).toBeVisible()
        await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('admin 登录成功进入 dashboard', async ({ page }) => {
        await pageSignIn(page, TEST_ADMIN)
        await expect(page.locator('h2')).toContainText('仪表板')
    })

    test('退出登录回到 /login', async ({ page }) => {
        await pageSignIn(page, TEST_ADMIN)
        await page.locator('button:has-text("退出登录")').click()
        await expect(page).toHaveURL(/\/login/)
    })
})

test.describe('页面角色守卫', () => {
    test('viewer 登录后导航不显示用户管理入口', async ({ page }) => {
        await pageSignIn(page, TEST_VIEWER)
        await expect(page.locator('a[href="/users"]')).toHaveCount(0)
    })

    test('viewer 直接访问 /users 被重定向到 /dashboard', async ({ page }) => {
        await pageSignIn(page, TEST_VIEWER)
        await page.goto('/users')
        await expect(page).toHaveURL(/\/dashboard/)
    })
})
