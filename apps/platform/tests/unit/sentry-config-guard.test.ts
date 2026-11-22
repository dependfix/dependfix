import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 构建期配置门禁（源码文本断言）：
 * `@sentry/nuxt` 模块必须启用、source map 上传与构建遥测必须关闭（避免构建期向 Sentry 出网），
 * 客户端与服务端配置必须提供 `beforeSend`（错误事件）与 `beforeSendSpan`（事务 / span）两条脱敏入口。
 *
 * 为什么用文本断言：这些是 `nuxt.config.ts` / 根级配置文件，无法在 vitest 中安全 import
 * （会触发 defineNuxtConfig 全局与 #imports 解析）；配置项去掉或改回默认值时本用例会失败。
 */
const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const readConfig = (file: string): string => fs.readFileSync(path.join(platformRoot, file), 'utf8')

describe('Sentry 构建配置门禁', () => {
    it('nuxt.config.ts：模块启用、sourcemaps.disable 与 telemetry 关闭', () => {
        const source = readConfig('nuxt.config.ts')
        expect(source).toMatch(/'@sentry\/nuxt\/module'/)
        expect(source).toMatch(/sourcemaps:\s*\{\s*disable:\s*true\s*\}/)
        expect(source).toMatch(/telemetry:\s*false/)
        // 构建期依赖插桩会把 pg 链的 CJS 子路径提升为无扩展名 ESM import，导致产物启动失败
        expect(source).toMatch(/buildTimeInstrumentation:\s*false/)
    })

    it('服务端配置：DSN 闸门 + beforeSend / beforeSendSpan', () => {
        const source = readConfig('sentry.server.config.ts')
        expect(source).toContain('initializeServerObservability')
        expect(source).toContain('beforeSend:')
        expect(source).toContain('beforeSendSpan:')
        expect(source).not.toMatch(/dsn:\s*['"]https:/)
    })

    it('浏览器端配置：DSN 未配置不初始化 + beforeSend / beforeSendSpan', () => {
        const source = readConfig('sentry.client.config.ts')
        expect(source).toContain('if (settings.enabled)')
        expect(source).toContain('beforeSend:')
        expect(source).toContain('beforeSendSpan:')
        expect(source).not.toMatch(/dsn:\s*['"]https:/)
    })
})
