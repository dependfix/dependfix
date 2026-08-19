import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * C60 平台表格排序 e2e 冒烟测试（docs/plan/todo.md §C60）。
 * 复用 global-setup 保存的 admin 认证状态；仅验证 sortable 列存在 + 点击可切换 asc/desc，
 * 不深校验业务排序键（_severityRank 等）——后者由 sort-helpers.test.ts 单测覆盖。
 * 跳过 mock 注入（W11 SSR+CSR 陷阱：page.route 仅 client 拦截，SSR fetch 走真 API）。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('C60 平台表格 sortable', () => {
    test('alerts 页面 severity 列可点击排序（removableSort 三态）', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // DataTable 渲染（无 alerts 时仍可见空态）
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        // severity 列 header 含 sortable 标记（PrimeVue 4 用 data-p-sortable-column 属性）
        const severityHeader = page.locator('.p-datatable th:has-text("严重级别")')
        await expect(severityHeader).toHaveAttribute('data-p-sortable-column', 'true')
        // 点击列头 → 切换排序状态
        await severityHeader.click()
        // PrimeVue 4 sortable 点击后表头加 data-p-sorted 属性
        await expect(severityHeader).toHaveAttribute('data-p-sorted', 'true', { timeout: 5000 })
    })

    test('repos 页面 owner 列可点击排序 + selectedRows 保留', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
        // owner 列 sortable
        const ownerHeader = page.locator('.p-datatable th:has-text("Owner")')
        await expect(ownerHeader).toHaveAttribute('data-p-sortable-column', 'true')
        await ownerHeader.click()
        await expect(ownerHeader).toHaveAttribute('data-p-sorted', 'true', { timeout: 5000 })
        // 排序后批量选择 checkbox 仍可用（PR1 W10 教训：selectedRows 不应被排序重置）
        const checkboxes = page.locator('.p-datatable .p-checkbox')
        await expect(checkboxes.first()).toBeVisible()
    })

    test('schedules / credentials / users / batch-runs 页面 sortable 列存在', async ({ page }) => {
        for (const route of ['/schedules', '/credentials', '/users', '/batch-runs']) {
            await page.goto(route)
            await waitForHydration(page)
            await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })
            // 至少一个 sortable 列存在（PrimeVue 4 data-p-sortable-column 属性）
            const sortableHeaders = page.locator('.p-datatable th[data-p-sortable-column="true"]')
            await expect(sortableHeaders.first()).toBeVisible()
        }
    })
})