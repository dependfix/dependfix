import { betterAuth } from 'better-auth'
import { admin, createAccessControl, genericOAuth } from 'better-auth/plugins'
import { snowflake } from './snowflake'
import { typeormAdapter } from '#server/database/typeorm-adapter'
import { ensureDatabaseInitialized } from '#server/database'
import { ensureDefaultOrganization, migrateLegacyRoles } from '#server/utils/organization'
import { parseDomainList, type AuthMode } from '#server/utils/email-domain'
import { buildCreateUserBefore } from '#server/utils/registration-access'
import { sendTemplateMail, MailerError } from '#server/services/mailer'

/**
 * better-auth 实例（邮箱密码登录 + admin 用户管理插件）。
 * 配置要点：
 * - SMTP 未配置时邮箱验证自动跳过（对齐"未配置自动禁用"模式）
 * - 会话数据库持久化 30 天，每 1 天续期
 * - 雪花 ID 与实体 @BeforeInsert 同源
 * - 角色模型：admin / org_admin / viewer（默认注册 viewer；首个注册用户自动 admin）
 * - admin 插件：adminRoles 仅 'admin'（org_admin/viewer 无用户管理权限，设计决策 D7）；
 *   roles 显式声明三角色，保证 setRole 类型面与运行时权限语义一致
 * - 注册开关：`REGISTRATION_DISABLED=true` 时禁用注册（better-auth disableSignUp，
 *   登录不受影响；首个管理员需在开放期注册，之后可关闭）
 */

/** admin 插件权限语句（对齐插件内置 defaultStatements，显式声明以获得三角色类型面） */
const adminStatements = {
    user: [
        'create',
        'list',
        'set-role',
        'ban',
        'impersonate',
        'delete',
        'set-password',
        'set-email',
        'get',
        'update',
    ],
    session: [
        'list',
        'revoke',
        'delete',
    ],
} as const

const adminAccessControl = createAccessControl(adminStatements)

/** 三角色权限：仅 admin 拥有用户管理权限；org_admin/viewer 无（has-permission 403 兜底） */
const adminRoles = {
    admin: adminAccessControl.newRole({
        user: [...adminStatements.user],
        session: [...adminStatements.session],
    }),
    org_admin: adminAccessControl.newRole({
        user: [],
        session: [],
    }),
    viewer: adminAccessControl.newRole({
        user: [],
        session: [],
    }),
}

/**
 * 认证端点限流配置。
 * 生产：better-auth 内置特殊规则已覆盖 sign-in/sign-up（10s/3 次）与密码重置类（60s/3 次），
 * 且优先级高于 customRules（1.6.26 实证）——此处仅设全局兜底（60s/60 次），不重复声明无效规则。
 * e2e 测试环境（E2E_TEST=true）：放宽全局 + 禁用 IP 追踪（见 advanced.ipAddress），避免并行用例触发 429。
 */
const buildRateLimit = () => {
    if (process.env.E2E_TEST === 'true') {
        return {
            window: 60,
            max: 1000,
        }
    }
    return {
        window: 60,
        max: 60,
    }
}

/**
 * 构造 trustedOrigins 列表：better-auth 1.7 origin-check 中间件（PR #9973）强制
 * sign-up/sign-in/social 等端点的 Origin/Referer 头命中 trustedOrigins，否则 403。
 * 默认从 baseURL 派生，但项目未配置静态 baseURL（依赖运行时请求 host 推断），
 * 因此显式声明：
 * - E2E_TEST: 固定 `http://127.0.0.1:3101`（与 playwright.config 一致）
 * - 生产: 从 NUXT_PUBLIC_BASE_URL 或 BETTER_AUTH_TRUSTED_ORIGINS 读取 origin 列表
 * - 兜底: 当上述均未配置时，加 `http://*` 与 `https://*` 通配符覆盖所有 http(s) origin
 *   （匹配模式 `wildcardMatch`，见 better-auth trusted-origins.mjs）
 *
 * 注意：通配兜底放宽了 origin 校验，但项目此前依赖运行时请求 host 推断（无 baseURL 配置），
 * better-auth 1.7 默认 trustedOrigins 为空 → 升级后所有 sign-up/sign-in 立即 403。
 * 兜底模式保持与 1.6 的"默认放行 Origin"行为对齐，避免升级阻塞；生产部署应
 * 显式设置 BETTER_AUTH_TRUSTED_ORIGINS 或 NUXT_PUBLIC_BASE_URL 以收紧。
 */
const buildTrustedOrigins = (_options: { authSecret: string }): string[] => {
    const origins = new Set<string>()
    if (process.env.E2E_TEST === 'true') {
        origins.add('http://127.0.0.1:3101')
        return [...origins]
    }
    const base = process.env.NUXT_PUBLIC_BASE_URL
    if (base) {
        try {
            origins.add(new URL(base).origin)
        } catch {
            // 非法 URL 忽略
        }
    }
    const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS
    if (extra) for (const o of extra.split(',').map((s) => s.trim()).filter(Boolean)) {
        origins.add(o)
    }
    // 兜底：未配置 env 时，覆盖所有 http(s) origin（与 1.6 默认行为对齐）
    if (origins.size === 0) {
        origins.add('http://*')
        origins.add('https://*')
    }
    return [...origins]
}

/** better-auth 实例类型（由实际配置推断，含 role 等附加字段） */
const buildAuth = (ds: Awaited<ReturnType<typeof ensureDatabaseInitialized>>, options: {
    authSecret: string
    smtpEnabled: boolean
    registrationDisabled: boolean
    authMode: AuthMode
    allowedEmailDomains: string[]
    blockedEmailDomains: string[]
    githubClientId?: string
    githubClientSecret?: string
    googleClientId?: string
    googleClientSecret?: string
    oidcDiscoveryUrl?: string
    oidcClientId?: string
    oidcClientSecret?: string
    oidcIssuer?: string
    oidcAuthorizationUrl?: string
    oidcTokenUrl?: string
    oidcUserInfoUrl?: string
    oidcScopes?: string
}) => {
    // OIDC SSO 启用条件（与前端 oidcAvailable 一致——nuxt.config.ts public 段同构条件，
    // 双处声明互相指向：discovery/issuer + clientId + clientSecret 齐全）
    const oidcEnabled = Boolean(
        (options.oidcDiscoveryUrl || options.oidcIssuer)
        && options.oidcClientId
        && options.oidcClientSecret,
    )

    return betterAuth({
        appName: 'dependfix',
        secret: options.authSecret,
        database: typeormAdapter(ds),
        // better-auth 1.7 origin-check：sign-up/sign-in 等端点会校验请求 Origin 头
        // 是否在 trustedOrigins 中；默认 trustedOrigins 为空（从 baseURL 派生），
        // 未配置时所有 Origin 请求被拒，导致 e2e（http://127.0.0.1:3101）+ 生产同源
        // 登录全部失效。显式声明 trustedOrigins 列表：e2e 固定 127.0.0.1，生产从
        // NUXT_PUBLIC_BASE_URL（或同源 origin）兜底
        trustedOrigins: buildTrustedOrigins(options),
        rateLimit: buildRateLimit(),
        plugins: [
            admin({
            // 新注册用户默认 viewer（角色模型；存量 'user' 由 migrateLegacyRoles 迁移）
                defaultRole: 'viewer',
                // 用户管理仅 admin（三角色模型对齐；org_admin 管理仓库/凭据但无用户管理权限）
                adminRoles: ['admin'],
                roles: adminRoles,
            }),
            // OIDC SSO（enterprise 模式）：oidcEnabled 时才启用（clientId 等在条件内保证非空）；
            // 未配置自动禁用不阻塞启动。
            // better-auth 1.7：issuer validation 自动通过 OIDC discovery 完成（1.6 中的
            // `issuer` / `requireIssuerValidation` 字段已删除；无 discovery 的 IdP 可用
            // `accountIssuer` 覆盖；see release notes "Rewrite the generic OAuth plugin"）。
            ...(oidcEnabled
                ? [genericOAuth({
                    config: [{
                        providerId: 'oidc',
                        discoveryUrl: options.oidcDiscoveryUrl || undefined,
                        // 无 discovery 时手动声明 issuer（accountIssuer 替代旧 issuer 字段）；
                        // 有 discovery 时 issuer 自动从 discovery 文档获取，accountIssuer 不传
                        ...(options.oidcIssuer ? { accountIssuer: options.oidcIssuer } : {}),
                        clientId: options.oidcClientId!,
                        clientSecret: options.oidcClientSecret!,
                        scopes: (options.oidcScopes || 'openid,profile,email').split(',').map((s) => s.trim()).filter(Boolean),
                        // 无 discovery 的 IdP 手动声明端点（OIDC_AUTHORIZATION_URL 等覆盖）
                        ...(options.oidcAuthorizationUrl ? { authorizationUrl: options.oidcAuthorizationUrl } : {}),
                        ...(options.oidcTokenUrl ? { tokenUrl: options.oidcTokenUrl } : {}),
                        ...(options.oidcUserInfoUrl ? { userInfoUrl: options.oidcUserInfoUrl } : {}),
                    }],
                })]
                : []),
        ],
        emailAndPassword: {
            enabled: true,
            // 关闭注册（保留登录）：部署到公开环境时设置 REGISTRATION_DISABLED=true。
            // enterprise 白名单为空时**不**合并进 disableSignUp：sign-up 端点级拦截
            // 发生在 user.create.before hook 之前，会阻断首用户 admin 的 bootstrap
            // （platform-auth-users.md §11 决策点 11）；白名单准入统一由 hook 拒绝
            // （hook 单一准入点，platform-auth-users.md §11 决策点 6）
            disableSignUp: options.registrationDisabled,
            minPasswordLength: 8,
            requireEmailVerification: options.smtpEnabled,
            sendResetPassword: async ({ user, url }) => {
            // SMTP 未配置时：不支持发送密码重置邮件（用户 MVP 仅注册 + 会话）
                if (!options.smtpEnabled) {
                    console.warn('[auth] SMTP 未配置，密码重置邮件未发送')
                    return
                }
                try {
                    await sendTemplateMail('en-US', 'reset-password', {
                        email: user.email,
                        url,
                        appName: 'dependfix',
                    })
                } catch (error) {
                    if (error instanceof MailerError) {
                        // fail-quiet：better-auth 捕获异常不阻塞流程；日志详细便于排障
                        console.error(`[auth] 密码重置邮件发送失败：${error.code}`, error)
                        return
                    }
                    throw error
                }
            },
        },
        // OAuth 登录（public 模式）：clientId/clientSecret 均配置才启用，未配置自动禁用不阻塞启动
        socialProviders: {
            ...(options.githubClientId && options.githubClientSecret
                ? {
                    github: {
                        clientId: options.githubClientId,
                        clientSecret: options.githubClientSecret,
                    },
                }
                : {}),
            ...(options.googleClientId && options.googleClientSecret
                ? {
                    google: {
                        clientId: options.googleClientId,
                        clientSecret: options.googleClientSecret,
                    },
                }
                : {}),
        },
        emailVerification: {
            sendOnSignUp: options.smtpEnabled,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
            // SMTP 未配置时：不发验证邮件（注册自动通过）
                if (!options.smtpEnabled) {
                    console.warn('[auth] SMTP 未配置，验证邮件未发送')
                    return
                }
                try {
                    await sendTemplateMail('en-US', 'verification', {
                        email: user.email,
                        url,
                        appName: 'dependfix',
                    })
                } catch (error) {
                    if (error instanceof MailerError) {
                        console.error(`[auth] 验证邮件发送失败：${error.code}`, error)
                        return
                    }
                    throw error
                }
            },
        },
        session: {
            expiresIn: 60 * 60 * 24 * 30, // 30 天
            updateAge: 60 * 60 * 24, // 1 天
            storeSessionInDatabase: true,
        },
        advanced: {
            database: {
            // 与实体 @BeforeInsert 同源，保证 better-auth 生成的 id 也是雪花 ID
                generateId: () => snowflake.generateId(),
            },
            ipAddress: {
            // e2e 测试环境禁用 IP 追踪：better-auth 内置特殊规则（sign-in 10s/3 次）
            // 优先于 customRules，且无代理 IP 头时回退共享桶——并行测试必触发 429。
            // 生产环境不设置（保留限流防护）。
                ...(process.env.E2E_TEST === 'true' ? { disableIpTracking: true } : {}),
            },
        },
        user: {
            additionalFields: {
                role: {
                    type: 'string',
                    required: false,
                    // 角色模型默认 viewer（存量 'user' 启动迁移为 viewer）
                    defaultValue: 'viewer',
                    // 防客户端注入：role 只能由服务端维护
                    input: false,
                },
            },
            changeEmail: {
                enabled: true,
                // SMTP 未配置时直接改邮箱（对齐"未配置自动跳过验证"模式）；已配置时发确认邮件
                updateEmailWithoutVerification: !options.smtpEnabled,
                sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
                // SMTP 未配置时：不发确认邮件（changeEmail 直接生效，updateEmailWithoutVerification 已为 true）
                // SMTP 已配置：经 mailer service 发送（fail-quiet：异常被 better-auth 捕获不阻塞流程）
                    if (!options.smtpEnabled) {
                        console.warn('[auth] SMTP 未配置，邮箱变更确认邮件未发送')
                        return
                    }
                    try {
                        await sendTemplateMail('en-US', 'change-email', {
                            email: user.email,
                            newEmail,
                            url,
                            appName: 'dependfix',
                        })
                    } catch (error) {
                        if (error instanceof MailerError) {
                            console.error(`[auth] 邮箱变更确认邮件发送失败：${error.code}`, error)
                            return
                        }
                        throw error
                    }
                },
            },
        },
        databaseHooks: {
            user: {
                create: {
                // 注册准入 + 首用户 admin（platform-auth-users.md §11 决策点 11 短路先于准入检查；决策点 6/5 准入）
                // 独立为 buildCreateUserBefore 以便集成测试（auth-access.test.ts）
                    before: buildCreateUserBefore({
                        ds,
                        ctx: {
                            authMode: options.authMode,
                            registrationDisabled: options.registrationDisabled,
                            allowedEmailDomains: options.allowedEmailDomains,
                            blockedEmailDomains: options.blockedEmailDomains,
                        },
                    }),
                },
            },
        },
    })
}

export type AuthInstance = ReturnType<typeof buildAuth>

export const getAuthInstance = async (options: {
    authSecret: string
    smtpEnabled: boolean
    registrationDisabled: boolean
    authMode: AuthMode
    allowedEmailDomains: string[]
    blockedEmailDomains: string[]
    githubClientId?: string
    githubClientSecret?: string
    googleClientId?: string
    googleClientSecret?: string
    oidcDiscoveryUrl?: string
    oidcClientId?: string
    oidcClientSecret?: string
    oidcIssuer?: string
    oidcAuthorizationUrl?: string
    oidcTokenUrl?: string
    oidcUserInfoUrl?: string
    oidcScopes?: string
}): Promise<AuthInstance> => {
    const ds = await ensureDatabaseInitialized()

    // 数据迁移（幂等）：默认组织创建 + 存量 Repository/Credential 挂默认组织 + 角色 'user'→'viewer'
    await ensureDefaultOrganization(ds)
    await migrateLegacyRoles(ds)

    return buildAuth(ds, options)
}

/** 供 server/api/auth/[...].ts 使用的惰性单例（globalThis 挂载，跨 HMR 存活） */
const GLOBAL_AUTH_KEY = '__dependfix_auth_instance__'

interface AuthGlobal {
    [GLOBAL_AUTH_KEY]?: AuthInstance | null
}

const getGlobalScope = (): AuthGlobal => globalThis as AuthGlobal

/** 生产环境强制要求非默认 AUTH_SECRET（默认密钥可伪造会话）。 */
const assertAuthSecret = (authSecret: string): void => {
    const knownDefaultSecrets = new Set([
        'dev-secret-change-me',
        'change-me-to-a-random-secret',
    ])
    if (process.env.NODE_ENV === 'production' && (!authSecret || knownDefaultSecrets.has(authSecret))) {
        throw new Error('[auth] AUTH_SECRET 未配置或仍为默认值，生产环境禁止启动。请设置 NUXT_AUTH_SECRET（或构建期注入 AUTH_SECRET）')
    }
}

/** 启动校验并收窄 AUTH_MODE：只允许 enterprise | public（部署模式互斥二选一，platform-auth-users.md §11 决策 D1）。 */
const assertAuthMode = (authMode: string): AuthMode => {
    if (authMode !== 'enterprise' && authMode !== 'public') {
        throw new Error(`[auth] AUTH_MODE 配置非法：${authMode}，只允许 enterprise | public`)
    }
    return authMode
}

export const getAuth = async (): Promise<AuthInstance> => {
    const scope = getGlobalScope()
    if (!scope[GLOBAL_AUTH_KEY]) {
        const config = useRuntimeConfig()
        assertAuthSecret(config.authSecret)
        // 启动校验 AUTH_MODE 合法性（非法值在首个认证请求时抛错，避免静默回退默认模式）
        const authMode = assertAuthMode(config.authMode)
        scope[GLOBAL_AUTH_KEY] = await getAuthInstance({
            authSecret: config.authSecret,
            smtpEnabled: config.smtpEnabled,
            registrationDisabled: config.registrationDisabled,
            authMode,
            allowedEmailDomains: parseDomainList(config.allowedEmailDomains),
            blockedEmailDomains: parseDomainList(config.blockedEmailDomains),
            githubClientId: config.githubClientId,
            githubClientSecret: config.githubClientSecret,
            googleClientId: config.googleClientId,
            googleClientSecret: config.googleClientSecret,
            oidcDiscoveryUrl: config.oidcDiscoveryUrl,
            oidcClientId: config.oidcClientId,
            oidcClientSecret: config.oidcClientSecret,
            oidcIssuer: config.oidcIssuer,
            oidcAuthorizationUrl: config.oidcAuthorizationUrl,
            oidcTokenUrl: config.oidcTokenUrl,
            oidcUserInfoUrl: config.oidcUserInfoUrl,
            oidcScopes: config.oidcScopes,
        })
    }
    return scope[GLOBAL_AUTH_KEY]!
}
