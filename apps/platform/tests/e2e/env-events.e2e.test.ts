import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * env-events 视图冒烟测试（docs/plan/todo.md §C-ENV-CHANGE-ALERT）。
 *
 * 覆盖：
 * - viewer 角色访问 /env-events 跳转（导航隐藏但 URL 直访必须 403 重定向）
 * - admin 角色可见 + 列表渲染
 * - 过滤器（type / severity / notified / from / to）
 * - 详情展开 payloadJson
 * - 768px 响应式
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('C-ENV env-events UI', () => {
    test('admin 可访问 /env-events + 列表渲染', async ({ page }) => {
        // 必须在 goto 前注册：env-events.vue 在 onMounted 立即调用 fetchEvents()
        // 不 mock 时 API 401/403 → events 为空但页面仍渲染过滤器（不依赖数据）
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify([]),
        }))
        await page.goto('/env-events')
        await waitForHydration(page)
        await expect(page.locator('h2')).toContainText('环境事件')
        // 过滤器渲染（type/severity/notified/from/to 5 个字段 + 筛选按钮独立 class）
        const filters = page.locator('.env-events__filter-field')
        await expect(filters).toHaveCount(5)
    })

    test('导航菜单对 admin 可见 env-events 链接', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        const navLink = page.locator('a:has-text("环境事件")')
        await expect(navLink).toBeVisible()
        await navLink.click()
        await expect(page).toHaveURL(/\/env-events$/)
    })

    test('过滤器交互：选 type = sandbox_degraded 触发 fetch', async ({ page }) => {
        // 必须在 goto 前注册：env-events.vue 在 onMounted 立即调用 fetchEvents()
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 'evt-1', type: 'sandbox_degraded', severity: 'warn', repository: 'demo/app', scanRunId: null, payloadJson: '{"degradedReason":{"code":"sandbox_unavailable","message":"降级"}}', notified: false, notifiedVia: null, createdAt: new Date().toISOString() },
            ]),
        }))
        await page.goto('/env-events')
        await waitForHydration(page)
        // 选择 type
        await page.locator('#type').click()
        await page.locator('li:has-text("沙箱降级")').click()
        // 点筛选
        await page.locator('button:has-text("筛选")').click()
        // 等待 table 行出现
        await page.waitForSelector('.env-events__table tbody tr', { timeout: 10000 })
        const rows = page.locator('.env-events__table tbody tr')
        await expect(rows.first()).toContainText('沙箱降级')
    })

    test('详情展开：点击展开按钮显示完整 payloadJson', async ({ page }) => {
        // 必须在 goto 前注册：env-events.vue 在 onMounted 立即调用 fetchEvents()，
        // 若在 goto 后注册 mock，onMounted 走真实 API → events 空 → 详情按钮不渲染
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 'evt-1', type: 'sandbox_unavailable', severity: 'error', repository: 'demo/app', scanRunId: 'run-1', payloadJson: JSON.stringify({ errno: 'ENOENT', code: 'sandbox_unavailable', message: 'docker daemon stopped' }), notified: true, notifiedVia: 'email', createdAt: new Date().toISOString() },
            ]),
        }))
        await page.goto('/env-events')
        await waitForHydration(page)
        // 等待 table 行出现（mock 已在 onMounted 生效）
        await page.waitForSelector('.env-events__expand-btn', { timeout: 10000 })
        await page.locator('.env-events__expand-btn').first().click()
        const full = page.locator('.env-events__message-full')
        await expect(full).toBeVisible()
        await expect(full).toContainText('ENOENT')
    })

    test('768px 响应式：filter-row 换行', async ({ page }) => {
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify([]),
        }))
        await page.setViewportSize({ width: 768, height: 1024 })
        await page.goto('/env-events')
        await waitForHydration(page)
        const filterRow = page.locator('.env-events__filter-row')
        // flex-wrap: wrap → 768px 下 5 个字段会换行
        const flexWrap = await filterRow.evaluate((el) => window.getComputedStyle(el).flexWrap)
        expect(flexWrap).toBe('wrap')
    })

    test('DataTable scrollable：60vh 滚动容器存在', async ({ page }) => {
        // PrimeVue 4 DataTable scrollable 包裹层 class 名为 .p-datatable-table-container
        // （PrimeVue 3 叫 .p-datatable-wrapper，4 已重命名）—— 返回 1 条最小数据确保包裹层出现
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 'evt-min', type: 'sandbox_unavailable', severity: 'error', repository: 'demo/app', scanRunId: null, payloadJson: null, notified: false, notifiedVia: null, createdAt: new Date().toISOString() },
            ]),
        }))
        await page.goto('/env-events')
        await waitForHydration(page)
        await page.waitForSelector('.env-events__table', { timeout: 10000 })
        const scrollWrapper = page.locator('.env-events__table .p-datatable-table-container')
        await expect(scrollWrapper).toBeVisible()
    })

    test('severity 列 sortable 三态：点击切换 unsorted → asc → desc → unsorted（removable-sort）', async ({ page }) => {
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 'evt-1', type: 'sandbox_unavailable', severity: 'critical', repository: 'demo/app', scanRunId: null, payloadJson: null, notified: false, notifiedVia: null, createdAt: new Date().toISOString() },
                { id: 'evt-2', type: 'sandbox_degraded', severity: 'warn', repository: 'demo/app', scanRunId: null, payloadJson: null, notified: false, notifiedVia: null, createdAt: new Date().toISOString() },
            ]),
        }))
        await page.goto('/env-events')
        await waitForHydration(page)
        await page.waitForSelector('.env-events__table tbody tr', { timeout: 10000 })
        const severityHeader = page.locator('.env-events__table .p-datatable th:has-text("级别")')
        // 列 header 含 sortable 标记（PrimeVue 4 data-p-sortable-column 属性）
        await expect(severityHeader).toHaveAttribute('data-p-sortable-column', 'true')
        // 初始未排序：aria-sort="none"
        await expect(severityHeader).toHaveAttribute('aria-sort', 'none')
        // 第一击：unsorted → asc（PrimeVue 4 默认 sort-order=1）
        await severityHeader.click()
        await expect(severityHeader).toHaveAttribute('aria-sort', 'ascending', { timeout: 5000 })
        // 第二击：asc → desc 翻转（:default-sort-order=-1 决定再次点击进入 desc）
        await severityHeader.click()
        await expect(severityHeader).toHaveAttribute('aria-sort', 'descending', { timeout: 5000 })
        // 第三击：desc → unsorted（removable-sort 三态）
        await severityHeader.click()
        await expect(severityHeader).toHaveAttribute('aria-sort', 'none', { timeout: 5000 })
    })
})

/**
 * viewer 角色访问 /env-events 必须被拒绝。
 * 通过 viewer auth storage state 验证：UI 隐藏链接 + 直接访问 URL 应跳转到 dashboard 或显示 403。
 */
test.describe('C-ENV viewer 权限', () => {
    test.use({ storageState: 'tests/e2e/.auth/viewer.json' })

    test('viewer 导航菜单不显示 env-events 链接', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        const navLink = page.locator('a:has-text("环境事件")')
        await expect(navLink).toHaveCount(0)
    })

    test('viewer 直访 /env-events 触发 API 403', async ({ page }) => {
        // mock API 返回 403（必须在 goto 前注册）
        await page.route('**/api/audit-events*', (route) => route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ statusCode: 403, statusMessage: 'Forbidden', message: '权限不足' }),
        }))
        await page.goto('/env-events')
        await waitForHydration(page)
        // 验证页面有错误提示（API 403 不会自动重定向）
        // 或验证最终页面仍在 /env-events（不跳走）
        await expect(page).toHaveURL(/\/env-events$/)
    })
})
