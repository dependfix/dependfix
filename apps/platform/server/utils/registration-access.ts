/**
 * 注册准入决策与用户创建 hook（`user.create.before` 实现）。
 * 抛 better-auth APIError（4xx），保证准入拒绝不落 500。
 * 决策点 6/11（platform-auth-users.md §11，2026-08-10 用户确认）：
 * - enterprise 白名单为空 = 完全关闭自动开通（由本 hook 统一拒绝）
 * - 首用户 admin 路径优先于准入检查（count==0 直接返回，不走准入）
 */
import { APIError } from 'better-auth/api'
import type { Repository } from 'typeorm'
import { isEmailDomainAllowed, type AuthMode } from './email-domain'
import { User } from '#server/entities/user'

export interface RegistrationAccessContext {
    authMode: AuthMode
    registrationDisabled: boolean
    allowedEmailDomains: string[]
    blockedEmailDomains: string[]
}

/** 准入拒绝统一 403（4xx 语义：请求本身合法但被准入策略拒绝，非 500 服务错误）。 */
const forbidden = (code: string, message: string): never => {
    throw new APIError('FORBIDDEN', {
        code,
        message,
    })
}

export const assertRegistrationAllowed = (email: string | null | undefined, ctx: RegistrationAccessContext): void => {
    // 总开关：关闭所有注册渠道。
    // 邮箱密码路径已由 emailAndPassword.disableSignUp 原生拦截（sign-up.mjs 抛 BAD_REQUEST）；
    // OAuth/SSO 自动开通路径 disableSignUp 不生效（provider 级 disableImplicitSignUp，非全局开关），
    // 统一由本 hook 显式拦截。
    if (ctx.registrationDisabled) {
        forbidden('REGISTRATION_DISABLED', '注册已关闭：平台未开放注册，请联系管理员')
    }
    if (!isEmailDomainAllowed({
        email,
        mode: ctx.authMode,
        allowedDomains: ctx.allowedEmailDomains,
        blockedDomains: ctx.blockedEmailDomains,
    })) {
        // email 缺失 fail-closed：OAuth/SSO 用户信息无 email（如 GitHub 私有邮箱）时拒绝开通
        if (!email) {
            forbidden('EMAIL_REQUIRED', '第三方账号未提供邮箱，无法开通账号')
        }
        forbidden('EMAIL_DOMAIN_NOT_ALLOWED', '邮箱域名不在允许列表中')
    }
}

/** better-auth user.create.before hook 返回格式（{ data } 合并 actualData；false 中止） */
export interface CreateUserBeforeResult { data: Record<string, unknown> }

/**
 * 构造 `user.create.before` hook（platform-auth-users.md §11 决策点 11：首用户 admin 优先于准入检查）。
 * 独立于 buildAuth 以便集成测试（内存 DataSource + mock userRepo.count）。
 * 注意：enterprise 白名单空由 assertRegistrationAllowed 统一拒绝（platform-auth-users.md §11 决策点 6），
 * 不依赖 disableSignUp 端点级拦截（端点拦截会阻断首用户 bootstrap）。
 */
export const buildCreateUserBefore = (options: {
    ds: { getRepository: (entity: typeof User) => Repository<User> }
    ctx: RegistrationAccessContext
}): ((user: Record<string, unknown>) => Promise<CreateUserBeforeResult>) => async (user) => {
    const userRepo = options.ds.getRepository(User)
    const count = await userRepo.count()
    // 决策点 11（platform-auth-users.md §11）：首个注册用户自动成为管理员，且优先于准入检查
    // （确保系统在任何 AUTH_MODE/名单配置下都能创建首个管理员）。
    // count 失败时抛错中止注册：若静默降级为默认 user，后续 count 不再为 0，
    // 系统将永久无管理员（管理员分配失败必须阻断创建）。
    if (count === 0) {
        user.role = 'admin'
        return {
            data: user,
        }
    }
    // 注册准入（platform-auth-users.md §11 决策点 5/6/11）：REGISTRATION_DISABLED 总开关
    // + email 缺失 fail-closed + 域名白名单（enterprise）/黑名单（public）；
    // 邮箱注册与 OAuth/SSO 自动开通同源拦截（hook 单一准入点）
    assertRegistrationAllowed(user.email as string | null | undefined, options.ctx)
    return {
        data: user,
    }
}
