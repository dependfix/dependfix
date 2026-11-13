// auth-errors.ts — 认证客户端错误的纯分类（登录 / 重发提示共用，可单测）。
//
// better-auth 客户端错误形态为 `{ code?, message?, status }`：优先按 code 判定，
// 兼容只带 message / status 的版本。分类只影响文案与是否给出自助入口，不做重试。

/** 认证客户端错误的结构子集（只读）。 */
export interface AuthClientErrorLike {
    code?: string | null
    message?: string | null
    status?: number | null
}

/**
 * 是否「邮箱未验证」导致的登录拒绝（HTTP 403 / `EMAIL_NOT_VERIFIED`）。
 *
 * 只有这种情况给「重发验证邮件」入口；密码错误等其余失败必须保持原文案。
 */
export function isEmailNotVerifiedError(error: AuthClientErrorLike): boolean {
    if (error.code === 'EMAIL_NOT_VERIFIED') {
        return true
    }
    return error.status === 403 && /email.{0,10}not.{0,10}verified/i.test(error.message ?? '')
}

/**
 * 是否命中频率限制（better-auth 内置特殊规则：`/send-verification-email` 60s / 3 次）。
 *
 * 命中时提示「稍后再试」，不暴露内部错误码。
 */
export function isRateLimitedError(error: AuthClientErrorLike): boolean {
    return error.status === 429 || error.code === 'TOO_MANY_REQUESTS'
}
