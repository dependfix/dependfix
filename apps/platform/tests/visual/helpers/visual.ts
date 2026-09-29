import { type Locator, type Page, expect } from '@playwright/test'

/**
 * 视觉回归（截图识别层）公共辅助。
 *
 * 设计口径（详见 docs/standards/testing.md「视觉回归」）：
 * - 主题以**确定性**方式注入（写 localStorage 偏好），不依赖系统 `prefers-color-scheme`，
 *   避免 CI（无系统偏好）与本地（可能是深色偏好）渲染不一致；
 * - 动态区域统一以 `[data-visual-mask]` 显式遮蔽，不依赖像素容差兜底；
 * - 截图前置 = 网络空闲 + 字体就绪；动画与光标由 config 的 `animations: 'disabled'` /
 *   `caret: 'hide'` 关闭。
 */

export type VisualTheme = 'light' | 'dark'

/** 覆盖浅色 / 深色两套主题。 */
export const VISUAL_THEMES: readonly VisualTheme[] = ['light', 'dark']

/**
 * 暗色偏好 localStorage 键：必须与 `app/composables/use-color-mode.ts` 的存储键一致。
 * 该键漂移会让暗色用例静默截成亮色基线（假绿），故两侧各留一条指针、用例内另有
 * `expectThemeApplied` 断言 `<html class="dark">` 兜底。
 */
const COLOR_MODE_STORAGE_KEY = 'dependfix-color-mode'

/** 动态区域遮蔽选择器：所有标记 `data-visual-mask` 的元素（时间戳等运行时派生值）。 */
export const VISUAL_MASK_SELECTOR = '[data-visual-mask]'

/**
 * 以确定性方式注入主题偏好。必须在 `page.goto` 之前调用，确保初始化脚本先于应用启动。
 */
export async function applyTheme(page: Page, theme: VisualTheme): Promise<void> {
    await page.addInitScript(({ key, value }) => {
        window.localStorage.setItem(key, value)
    }, { key: COLOR_MODE_STORAGE_KEY, value: theme })
}

/**
 * 断言主题已落到 `<html>`：暗色需带 `.dark`，亮色需不带。
 * `use-color-mode.ts` 在挂载时才应用偏好，故本断言必须在 hydration 之后调用。
 */
export async function expectThemeApplied(page: Page, theme: VisualTheme): Promise<void> {
    const html = page.locator('html')
    if (theme === 'dark') {
        await expect(html).toHaveClass(/\bdark\b/, { timeout: 5000 })
        return
    }
    await expect(html).not.toHaveClass(/\bdark\b/)
}

/**
 * 等待渲染稳定：网络空闲 + 字体就绪。
 * 不额外 sleep——过渡动画由 `animations: 'disabled'` 在截图瞬间禁用。
 */
export async function waitForVisualStable(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
        await document.fonts?.ready
    })
}

/** 动态区域掩码：所有标记 `data-visual-mask` 的元素。 */
export function dynamicMask(page: Page): Locator[] {
    return [page.locator(VISUAL_MASK_SELECTOR)]
}

/**
 * 整页截图比对（`fullPage: true`：表格长于视口时仍覆盖全部行），自动应用动态区域掩码。
 */
export async function expectPageScreenshot(page: Page, name: string): Promise<void> {
    await expect(page).toHaveScreenshot(name, {
        fullPage: true,
        mask: dynamicMask(page),
    })
}

/** 单个元素（如浮层容器）截图比对。 */
export async function expectLocatorScreenshot(locator: Locator, name: string): Promise<void> {
    await expect(locator).toHaveScreenshot(name)
}
