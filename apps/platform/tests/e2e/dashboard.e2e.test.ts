import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * C61 仪表板图表 e2e 冒烟测试（docs/plan/todo.md §C61）。
 * 验证 ChartCanvas 渲染（3 个 canvas）+ aria-label 可访问性 + 暗色模式切换不破图表。
 * 不深入校验数据正确性（chart.js 内部行为由 ChartCanvas.vue 单测覆盖）。
 * 跳过 mock 注入（W11 SSR+CSR 陷阱）。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('C61 仪表板图表', () => {
    test('3 个 Chart canvas 在 dashboard 渲染（含 aria-label）', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        // 等待 ClientOnly 包裹的图表 canvas 出现（chart.js 客户端注册需 hydration 后）
        const canvases = page.locator('.dashboard__chart-canvas canvas[role="img"]')
        await expect(canvases).toHaveCount(3, { timeout: 20000 })
        // 每个 canvas 都有 aria-label（RG-W04 可访问性）
        const severityCanvas = page.locator('.dashboard__chart-card:has-text("告警分布") canvas')
        const fixRateCanvas = page.locator('.dashboard__chart-card:has-text("修复率") canvas')
        const topPackagesCanvas = page.locator('.dashboard__chart-card:has-text("Top-10") canvas')
        await expect(severityCanvas).toHaveAttribute('aria-label', /告警分布/)
        await expect(fixRateCanvas).toHaveAttribute('aria-label', /修复率/)
        await expect(topPackagesCanvas).toHaveAttribute('aria-label', /Top-10/)
    })

    test('i18n 双语键对齐：zh-CN / en-US 渲染 "图表" 与 "Charts" 区块标题', async ({ page }) => {
        // zh-CN（默认）
        await page.goto('/dashboard')
        await waitForHydration(page)
        await expect(page.locator('.dashboard__charts h3')).toContainText('图表', { timeout: 15000 })

        // en 切换（/en 前缀）
        await page.goto('/en/dashboard')
        await waitForHydration(page)
        await expect(page.locator('.dashboard__charts h3')).toContainText('Charts', { timeout: 15000 })
    })

    test('暗色模式切换图表区域仍正常渲染', async ({ page }) => {
        await page.goto('/dashboard')
        await waitForHydration(page)
        // 切到暗色（C59 修复的 .dark 类）
        await page.evaluate(() => document.documentElement.classList.add('dark'))
        // 图表 canvas 仍存在（不白屏）
        await expect(page.locator('.dashboard__chart-canvas canvas[role="img"]').first()).toBeVisible({ timeout: 10000 })
    })

    test('768px 响应式：图表区 grid 单列布局', async ({ page }) => {
        await page.setViewportSize({ width: 600, height: 800 })
        await page.goto('/dashboard')
        await waitForHydration(page)
        // 768px 以下 charts-grid 切换为单列（grid-template-columns: 1fr）
        // 通过计算样式验证（V 阶段发现并修复）
        const gridStyle = await page.locator('.dashboard__charts-grid').first().evaluate((el) => window.getComputedStyle(el).gridTemplateColumns)
        // 单列只会有一个 column width（不是两个）
        const columnCount = gridStyle.trim().split(/\s+/).length
        expect(columnCount).toBe(1)
    })
})