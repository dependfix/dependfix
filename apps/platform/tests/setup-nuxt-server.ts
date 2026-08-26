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

/**
 * better-auth 1.7 generic-oauth plugin 在 init 阶段会 fetch OIDC discovery URL，
 * 真实测试环境无网络，fetch 失败后因缺少 accountIssuer 兜底会抛错停止 provider 初始化
 * （"discovery returned no valid data. Provider initialization stopped to keep its account issuer stable"）。
 * 测试用例中使用的 https://idp.example.com/.well-known/openid-configuration 也属真实 fetch，
 * 这里 mock 该域名的 discovery 响应，让 better-auth 完成 provider 注册（避免引入 msw 等重依赖）：
 * - endpoint 字段从测试中设置的 oidcAuthorizationUrl / oidcTokenUrl / oidcUserInfoUrl 兜底，
 *   但 mock 响应里直接给出合法 placeholder，让 better-auth 内部不再触发后续网络请求
 */
if (typeof g.fetch === 'function' && !g.__oidcDiscoveryMocked) {
    const originalFetch = g.fetch.bind(g)
    g.fetch = async function mockedFetch(input: any, init?: any) {
        const url = typeof input === 'string' ? input : input?.url ?? ''
        if (url.startsWith('https://idp.example.com/.well-known/openid-configuration')) {
            return new Response(JSON.stringify({
                issuer: 'https://idp.example.com',
                authorization_endpoint: 'https://idp.example.com/authorize',
                token_endpoint: 'https://idp.example.com/token',
                userinfo_endpoint: 'https://idp.example.com/userinfo',
                jwks_uri: 'https://idp.example.com/.well-known/jwks.json',
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        }
        return originalFetch(input, init)
    }
    g.__oidcDiscoveryMocked = true
}
