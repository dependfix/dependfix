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

/** 调用 handler 并断言抛出的 h3 错误（{ statusCode, statusMessage, message }） */
export const expectError = async (promise: Promise<unknown>, statusCode: number): Promise<Record<string, unknown>> => {
    try {
        await promise
        throw new Error(`expected handler to throw ${statusCode}`)
    } catch (e) {
        const err = e as Record<string, unknown>
        if (err.statusCode !== statusCode) {
            // 非 h3 错误原样抛出（保持测试可读）
            throw e
        }
        return err
    }
}

/** 内存 SQLite 隔离（每个测试文件独立 worker，DataSource 单例各自初始化） */
export const setupMemoryDatabase = (): void => {
    process.env.DATABASE_PATH = ':memory:'
}

export const teardownMemoryDatabase = (): void => {
    delete process.env.DATABASE_PATH
}
