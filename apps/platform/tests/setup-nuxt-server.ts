import { createError, eventHandler, getQuery, getRouterParam, readBody } from 'h3'

/**
 * Nuxt server auto-import 模拟（vitest 环境）：
 * Nuxt 会为 server/ 下路由文件自动注入 h3 工具（defineEventHandler/readBody/createError 等），
 * vitest 无 Nuxt 插件故需在 setupFiles 中显式注入，否则 API handler 模块加载即报 ReferenceError。
 * 与 Nuxt 实际注入面保持一致：新增 auto-import 标识符时在此补全。
 */
 
const g = globalThis as any
g.defineEventHandler = eventHandler
g.readBody = readBody
g.createError = createError
g.getQuery = getQuery
g.getRouterParam = getRouterParam
