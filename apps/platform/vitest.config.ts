import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import rootConfig from '../../vitest.config'

/**
 * 平台包级 Vitest 配置：在**根配置**之上补 `#shared` 别名。
 *
 * 为什么必须 merge 根配置：`pnpm --filter @dependfix/platform test` 在包目录运行，Vitest 只读本文件，
 * 直接 defineConfig 会丢掉根配置的 `setupFiles`（h3 全局注入）、`#server` 别名与 e2e/visual 排除规则，
 * 导致 Playwright 规格被收集、server 测试初始化失败。
 *
 * `#shared` 是 Nuxt 4 的 App / server 共享目录别名（Nitro 构建期由 Nuxt 注入；相对路径会在
 * `.nuxt/dist/server` 里断裂），Vitest 不读 Nuxt 别名，故根与包级两处显式声明。
 */
export default mergeConfig(rootConfig, {
    resolve: {
        alias: {
            '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
        },
    },
})
