import type { Page } from '@playwright/test'

/**
 * 等待 Vue 应用挂载完成（SSR 静态 DOM 无事件绑定，fill/click 需 hydration 完成才生效；
 * 平台页面初始化导航链可能延迟挂载，直接交互会静默失效导致断言超时）。
 * __vue_app__ 为 Vue 挂载标记（非标准 DOM 属性，类型断言访问）。
 *
 * 仅 `__vue_app__` 存在并不足够：Nuxt 的 Suspense 边界会在挂载后继续异步 hydration，
 * 此间点击会被静默吞掉（handler 尚未绑定）。因此额外等待 Nuxt 的 `isHydrating` 落为 false
 * （`window.useNuxtApp()` 为 Nuxt 客户端全局钩子）。
 */
export async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vue_app__?: unknown })?.__vue_app__, undefined, { timeout: 30000 })
    await page.waitForFunction(() => {
        const w = window as unknown as { useNuxtApp?: () => { isHydrating?: boolean } }
        try {
            return w.useNuxtApp?.().isHydrating === false
        } catch {
            return false
        }
    }, undefined, { timeout: 30000 })
}
