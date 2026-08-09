import { createError } from 'h3'

/**
 * better-auth API 调用错误 → h3 错误转换。
 * better-auth 管理端点（admin 插件）抛 APIError（含 statusCode/code/message），
 * 直接透出会丢失统一错误语义；这里转换为与平台 API 一致的 h3 createError，
 * 保持 403（越权）/ 404（资源不存在）/ 400（参数/业务冲突）语义。
 */
export const rethrowAuthError = (error: unknown): never => {
    const candidate = error as { statusCode?: unknown, message?: unknown } | null
    if (candidate && typeof candidate === 'object' && typeof candidate.statusCode === 'number') {
        let statusMessage = 'Bad Request'
        if (candidate.statusCode === 403) {
            statusMessage = 'Forbidden'
        } else if (candidate.statusCode === 404) {
            statusMessage = 'Not Found'
        }
        const message = typeof candidate.message === 'string' && candidate.message
            ? candidate.message
            : '操作失败'
        // 400 由业务冲突/参数错误构成：错误码已含语义（如 YOU_CANNOT_BAN_YOURSELF），
        // 直接透传 message，前端可读
        throw createError({
            statusCode: candidate.statusCode,
            statusMessage,
            message,
        })
    }
    throw error
}
