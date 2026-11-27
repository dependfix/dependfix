import { buildBatchDeepLinkPath } from '#shared/batch-routes'

/**
 * 兼容站外 / 历史通知里的 `/batch-runs/<id>` 链接。
 *
 * 批次详情是列表页的展开视图（没有独立页面），统一 302 到 `/batch-runs?id=<id>` 深链，
 * 避免链接直接落到 404。放在 Nitro 路由而非页面 `setup`：页面 setup 里的 `navigateTo`
 * 只接管客户端导航，SSR 首屏仍会以 200 渲染出 404 内容。
 *
 * `getRouterParam` 默认不 URL 解码；批次 id 为十六进制，`%` 不会出现，故不做容错解码。
 */
export default defineEventHandler((event) => {
    const id = getRouterParam(event, 'id')
    return sendRedirect(event, buildBatchDeepLinkPath(id), 302)
})
