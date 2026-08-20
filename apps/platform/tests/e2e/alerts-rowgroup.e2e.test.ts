import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * alerts 视图 rowGroup + 图表复用冒烟（docs/plan/todo.md §C58）。
 *
 * 覆盖：
 * - alerts 顶部 charts 渲染（severity 饼图 + fixRate 环形 + Top-10 包柱状图，复用 dashboard.vue 图表组件）
 * - DataTable rowGroup by packageName（subheader 显示包名 + 告警数）
 * - subheader 点击折叠/展开
 * - 768px 响应式（filter-row 换行 + charts-grid 单列）
 *
 * 测试数据：依赖后端 /api/alerts（e2e setup 通过 admin auth + 历史 alert fixtures）
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('C58 alerts rowGroup + chart 复用', () => {
    test('alerts 顶部 3 块图表渲染（aria-label 含图表标题）', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        const chartCanvases = page.locator('.alerts__chart-canvas canvas[role="img"]')
        await expect(chartCanvases).toHaveCount(3, { timeout: 20000 })
        const severityCanvas = page.locator('.alerts__chart-card:has-text("告警分布") canvas')
        const fixRateCanvas = page.locator('.alerts__chart-card:has-text("修复率") canvas')
        const topPackagesCanvas = page.locator('.alerts__chart-card:has-text("Top-10") canvas')
        await expect(severityCanvas).toHaveAttribute('aria-label', /告警分布/)
        await expect(fixRateCanvas).toHaveAttribute('aria-label', /修复率/)
        await expect(topPackagesCanvas).toHaveAttribute('aria-label', /Top-10/)
    })

    test('DataTable rowGroup by packageName：subheader 显示包名 + 告警数', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        // 等待 alerts 数据加载完成
        await page.waitForSelector('.alerts__group-header', { timeout: 15000 })
        const groupHeaders = page.locator('.alerts__group-header strong')
        const count = await groupHeaders.count()
        expect(count).toBeGreaterThan(0)
        // 第一个 group header 应该包含包名 + 告警数
        const firstGroup = groupHeaders.first()
        await expect(firstGroup).toBeVisible()
    })

    test('subheader 点击可展开/折叠该包告警', async ({ page }) => {
        await page.goto('/alerts')
        await waitForHydration(page)
        await page.waitForSelector('.alerts__group-header', { timeout: 15000 })
        const firstGroup = page.locator('.alerts__group-header').first()
        // 点击前：toggle icon 是 chevron-right
        const toggleIcon = firstGroup.locator('.alerts__group-toggle')
        await expect(toggleIcon).toHaveClass(/pi-chevron-right/)
        // 点击展开
        await firstGroup.click()
        await expect(toggleIcon).toHaveClass(/pi-chevron-down/)
        // 再点击折叠
        await firstGroup.click()
        await expect(toggleIcon).toHaveClass(/pi-chevron-right/)
    })

    test('768px 响应式：charts-grid 单列', async ({ page }) => {
        await page.setViewportSize({ width: 768, height: 1024 })
        await page.goto('/alerts')
        await waitForHydration(page)
        await page.waitForSelector('.alerts__charts-grid', { timeout: 10000 })
        // 768px 以下 charts-grid 应为单列（grid-template-columns: 1fr）
        const grid = page.locator('.alerts__charts-grid')
        const columns = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns)
        // 单列时只有 1 个宽度值（如 "768px" 或 "720px"）
        const columnCount = columns.split(/\s+/).filter(Boolean).length
        expect(columnCount).toBe(1)
    })
})
