import { test, expect } from '@playwright/test'
import { waitForHydration } from './helpers/hydration.helper'

/**
 * 暗色模式回归测试（C59 修复防护，见 docs/plan/backlog.md §C59）。
 *
 * 背景：自定义 SCSS 容器（header / body / auth）切到 dark mode 后保持浅色，
 * 与 PrimeVue 组件（DataTable / Dialog / Tag）"半亮半暗"。根因：`_mixins.scss` 的
 * `@mixin dark-mode` 用 `:global(.dark) &`，这是 CSS Modules 语法，仅在 `<style scoped>`
 * 块内有效；`main.scss` 通过 `nuxt.config.ts:60` 的 `css: [...]` 作为全局 CSS 加载，
 * 没有 scope，编译产物 `:global(.dark) .parent-class` 里的 `:global(.dark)` 不是
 * 合法 CSS 选择器，浏览器静默忽略整条规则。
 *
 * 修复：mixin 改为 `.dark & { @content; }` —— 全局（`.dark .parent`）+ scoped
 * （`.dark .parent[data-v-xxx]`）两种上下文都成立。
 *
 * 验证策略：
 * 1. 启动默认（light）→ 切到 dark → 关键 DOM 节点 computed style 实测
 * 2. 关键断言：`<html class="dark">` + body 背景色=深色 + header 背景色=深色
 * 3. 截图留证（artifacts/dark-mode-*.png）
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('暗色模式（C59 修复防护）', () => {
    test('切换 dark mode 后，自定义 SCSS 容器（html / body / header）跟随 .dark 切换', async ({ page, context }) => {
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.log(`[browser error]`, msg.text())
            }
        })

        // 1) 在 navigate 前预置 localStorage（避免 initColorMode 后再点击 toggle 触发 0.2s 过渡期间的
        //    computed style race）；initColorMode 在 layout 挂载时读 localStorage → 首次渲染直接应用 dark
        await context.addInitScript(() => {
            localStorage.setItem('dependfix-color-mode', 'dark')
        })

        // 2) 进入 /repos，等待 hydration + DataTable 渲染
        await page.goto('/repos')
        await waitForHydration(page)
        await expect(page.locator('.p-datatable')).toBeVisible({ timeout: 15000 })

        // 3) 等待 initColorMode 把 .dark 挂到 <html>（同步事件，但需 Vue mount 触发）
        await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5000 })

        // 4) 跳过 0.2s 颜色过渡等待（避免 transition 中间态 getComputedStyle 报旧色）
        await page.waitForTimeout(300)

        // 5) 实测自定义 SCSS 容器 computed style（C59 修复前 header/body 是浅色，修复后是深色）
        const computedBackgrounds = await page.evaluate(() => {
            const html = document.documentElement
            const body = document.body
            const header = document.querySelector('.platform__header')
            return {
                htmlHasDark: html.classList.contains('dark'),
                htmlColorScheme: getComputedStyle(html).colorScheme,
                bodyBackground: getComputedStyle(body).backgroundColor,
                bodyColor: getComputedStyle(body).color,
                headerBackground: header ? getComputedStyle(header).backgroundColor : null,
                headerBorderBottom: header ? getComputedStyle(header).borderBottomColor : null,
            }
        })

        // 关键断言（C59 修复前：html.hasDark=true 但 bodyBackground=rgb(255,255,255)；
        // 修复后：bodyBackground 必须是深色 #0f172a = rgb(15, 23, 42)）
        expect(computedBackgrounds.htmlHasDark).toBe(true)
        expect(computedBackgrounds.htmlColorScheme).toBe('dark')
        // body 背景：$color-bg-dark: #0f172a → rgb(15, 23, 42)
        expect(computedBackgrounds.bodyBackground).toBe('rgb(15, 23, 42)')
        // body 文本：$color-text-dark: #f1f5f9 → rgb(241, 245, 249)
        expect(computedBackgrounds.bodyColor).toBe('rgb(241, 245, 249)')
        // header 背景：$color-surface-dark: #1e293b → rgb(30, 41, 59)
        expect(computedBackgrounds.headerBackground).toBe('rgb(30, 41, 59)')
        // header border-bottom：$color-border-dark: #334155 → rgb(51, 65, 85)
        expect(computedBackgrounds.headerBorderBottom).toBe('rgb(51, 65, 85)')

        // 6) 截图留证（dark mode 实际渲染）
        await page.screenshot({
            path: 'test-results/dark-mode-repos.png',
            fullPage: false,
        })

        // 7) 切回 light mode 守卫反向（防止 toggle 双向失效）
        await page.locator('button[aria-label="切换暗色模式"]').click()
        await expect(page.locator('html')).not.toHaveClass(/dark/, { timeout: 5000 })
        await page.waitForTimeout(300)

        const lightBackgrounds = await page.evaluate(() => {
            const body = document.body
            const header = document.querySelector('.platform__header')
            return {
                bodyBackground: getComputedStyle(body).backgroundColor,
                headerBackground: header ? getComputedStyle(header).backgroundColor : null,
            }
        })
        // light mode: body 背景 = #ffffff
        expect(lightBackgrounds.bodyBackground).toBe('rgb(255, 255, 255)')
        // light mode: header 背景 = #f8fafc
        expect(lightBackgrounds.headerBackground).toBe('rgb(248, 250, 252)')
    })
})
