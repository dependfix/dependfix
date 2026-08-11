import type { Page } from '@playwright/test'

/**
 * 等待 Vue 应用挂载（SSR 静态 DOM 无事件绑定，fill/click 需 hydration 完成才生效；
 * 平台页面初始化导航链可能延迟挂载，直接交互会静默失效导致断言超时）。
 * __vue_app__ 为 Vue 挂载标记（非标准 DOM 属性，类型断言访问）。
 */
export async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() => !!(document.querySelector('#__nuxt') as unknown as { __vue_app__?: unknown })?.__vue_app__, undefined, { timeout: 30000 })
}
