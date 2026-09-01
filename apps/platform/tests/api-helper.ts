import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, type H3Event } from 'h3'

/**
 * API handler 测试辅助（apps/platform/tests/，不在 coverage 统计口径内）：
 * 构造 h3 event（Node req/res 形态，h3 1.15 createEvent 仅接受该形态），
 * body 按 h3 readBody 的 unenv 兼容惯例预置到 req.body。
 */
export const makeEvent = (
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
    params: Record<string, string> = {},
): H3Event => {
    const req = new IncomingMessage(new Socket())
    req.method = method
    req.url = url
    req.headers = { 'content-type': 'application/json', ...headers }
    if (body !== undefined) {
        ;(req as unknown as { body: string }).body = JSON.stringify(body)
    }
    const res = new ServerResponse(req)
    const event = createEvent(req, res)
    // Nuxt 路由参数（getRouterParam 读取 event.context.params）
    event.context.params = params
    return event
}

/**
 * 调用 handler 并断言抛出的 h3 错误（{ statusCode, statusMessage, message, data }）。
 *
 * 返回类型放宽为 `Record<string, any>`（test helper 上下文，any 风险可控）：
 * - 支持 `err.data?.code` / `err.data?.field` 等强契约字段断言（todo.md §M17.4 commit 2 audit Reject 根因 —
 *   原 `Record<string, unknown>` 在 strict 模式下索引访问得到 `{}` 导致 TS2339 × 6）
 * - h3 1.15 createError 序列化保证 `data` 字段透传，`data.code` 由 localized-error.ts createLocalizedError 强契约写入
 * - 测试环境而非生产代码，any 风险圈定在 vitest 单测范围
 */
export const expectError = async (promise: Promise<unknown>, statusCode: number): Promise<Record<string, any>> => {
    try {
        await promise
        throw new Error(`expected handler to throw ${statusCode}`)
    } catch (e) {
        const err = e as Record<string, any>
        if (err.statusCode !== statusCode) {
            // 非 h3 错误原样抛出（保持测试可读）
            throw e
        }
        return err
    }
}

/** 内存 SQLite 隔离（每个测试文件独立 worker，DataSource 单例各自初始化）
 * 测试环境关掉 migrations（dev/test 用 synchronize 直接建表；migration 仅生产路径）；
 * opt-in synchronize 自动建表（schema 与 entity 对齐走 synchronize，测试不需要 migration）。
 * 测试环境需要 synchronize=true 才能让 DataSource 初始化时自动建表（详见
 * docs/standards/development.md §5.1.19 反模式禁止；helper 单点声明避免每个 test 重复 stub）。
 */
export const setupMemoryDatabase = (): void => {
    process.env.DATABASE_PATH = ':memory:'
    process.env.DATABASE_MIGRATIONS_RUN = 'false'
    process.env.DATABASE_SYNCHRONIZE = 'true'
}

export const teardownMemoryDatabase = (): void => {
    delete process.env.DATABASE_PATH
    delete process.env.DATABASE_MIGRATIONS_RUN
    delete process.env.DATABASE_SYNCHRONIZE
}
