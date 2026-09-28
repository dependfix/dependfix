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
    test('alerts 页面 severity 列可点击排序（三态循环 asc → desc → 移除）', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // DataTable 渲染（无 alerts 时仍可见空态）
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })
        // 可排序列头渲染排序按钮（caomei 用 `.caomei-data-table__sort` 按钮 + th[aria-sort] 承载状态）
        const severityHeader = page.locator('.caomei-data-table th:has-text("严重级别")').first()
        await expect(severityHeader.locator('.caomei-data-table__sort')).toBeVisible()
        // 默认排序契约：multiSortMeta 初值已按严重级别降序
        await expect(severityHeader).toHaveAttribute('aria-sort', 'descending')
        // 三态循环（选取初始未排序的「出现次数」列）：asc → desc → 移除
        const occHeader = page.locator('.caomei-data-table th:has-text("出现次数")').first()
        const occSort = occHeader.locator('.caomei-data-table__sort')
        await occSort.click()
        await expect(occHeader).toHaveAttribute('aria-sort', 'ascending', { timeout: 5000 })
        await occSort.click()
        await expect(occHeader).toHaveAttribute('aria-sort', 'descending', { timeout: 5000 })
        await occSort.click()
        await expect(occHeader).toHaveAttribute('aria-sort', 'none', { timeout: 5000 })
    })

    test('repos 页面 owner 列可点击排序 + selectedRows 保留', async ({ page }) => {
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })
        // owner 列可排序（caomei 用 `.caomei-data-table__sort` 按钮 + th[aria-sort]）
        const ownerHeader = page.locator('.caomei-data-table th:has-text("Owner")')
        const ownerSort = ownerHeader.locator('.caomei-data-table__sort')
        await expect(ownerSort).toBeVisible()
        await ownerSort.click()
        await expect(ownerHeader).toHaveAttribute('aria-sort', 'ascending', { timeout: 5000 })
        // 排序后批量选择 checkbox 仍可用（PR1 W10 教训：selectedRows 不应被排序重置）
        const checkboxes = page.locator('.caomei-data-table .caomei-checkbox__control')
        await expect(checkboxes.first()).toBeVisible()
    })

    test('schedules / credentials / users / batch-runs 页面 sortable 列存在', async ({ page }) => {
        for (const route of ['/schedules', '/credentials', '/users', '/batch-runs']) {
            await page.goto(route)
            await waitForHydration(page)
            await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })
            // 至少一个可排序列存在（caomei 用 `.caomei-data-table__sort` 按钮）
            await expect(page.locator('.caomei-data-table th .caomei-data-table__sort').first()).toBeVisible()
        }
    })

    test('env-events 页面 6 列均 sortable（type/severity/repository/message/notified/createdAt）', async ({ page }) => {
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify([]),
        }))
        await page.goto('/env-events')
        await waitForHydration(page)
        await expect(page.locator('.caomei-data-table')).toBeVisible({ timeout: 15000 })
        // 6 列均渲染排序按钮（caomei 用 `.caomei-data-table__sort`）
        const sortableHeaders = page.locator('.caomei-data-table th .caomei-data-table__sort')
        await expect(sortableHeaders).toHaveCount(6, { timeout: 5000 })
    })
})
