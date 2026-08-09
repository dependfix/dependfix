import { betterAuth } from 'better-auth'
import { admin, createAccessControl } from 'better-auth/plugins'
import { snowflake } from './snowflake'
import { typeormAdapter } from '#server/database/typeorm-adapter'
import { ensureDatabaseInitialized } from '#server/database'
import { ensureDefaultOrganization, migrateLegacyRoles } from '#server/utils/organization'
import { User } from '#server/entities/user'

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

/** better-auth 实例类型（由实际配置推断，含 role 等附加字段） */
const buildAuth = (ds: Awaited<ReturnType<typeof ensureDatabaseInitialized>>, options: {
    authSecret: string
    smtpEnabled: boolean
    registrationDisabled: boolean
}) => betterAuth({
    appName: 'dependfix',
    secret: options.authSecret,
    database: typeormAdapter(ds),
    rateLimit: buildRateLimit(),
    plugins: [
        admin({
            // 新注册用户默认 viewer（角色模型；存量 'user' 由 migrateLegacyRoles 迁移）
            defaultRole: 'viewer',
            // 用户管理仅 admin（三角色模型对齐；org_admin 管理仓库/凭据但无用户管理权限）
            adminRoles: ['admin'],
            roles: adminRoles,
        }),
    ],
    emailAndPassword: {
        enabled: true,
        // 关闭注册（保留登录）：部署到公开环境时设置 REGISTRATION_DISABLED=true
        disableSignUp: options.registrationDisabled,
        minPasswordLength: 8,
        requireEmailVerification: options.smtpEnabled,
        sendResetPassword: async ({ user, url }) => {
            // SMTP 未配置时：不支持发送密码重置邮件（用户 MVP 仅注册 + 会话）
            if (!options.smtpEnabled) {
                console.warn('[auth] SMTP 未配置，密码重置邮件未发送')
            }
            void user
            void url
            await Promise.resolve()
        },
    },
    emailVerification: {
        sendOnSignUp: options.smtpEnabled,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
            // SMTP 未配置时：不发验证邮件（注册自动通过）
            if (!options.smtpEnabled) {
                console.warn('[auth] SMTP 未配置，验证邮件未发送')
            }
            void user
            void url
            await Promise.resolve()
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
                // SMTP 未配置时：不发确认邮件（changeEmail 直接生效）
                // SMTP 已配置但邮件发送器未实现：确认邮件不发出（既有降级模式，
                // 与 sendVerificationEmail/sendResetPassword 一致；统一实现已登记
                // docs/plan/backlog.md「邮件发送器统一实现」条目）
                if (!options.smtpEnabled) {
                    console.warn('[auth] SMTP 未配置，邮箱变更确认邮件未发送')
                } else {
                    console.warn('[auth] 邮件发送器未实现，邮箱变更确认邮件未发送（变更需在 verify-email 链接确认）')
                }
                void user
                void newEmail
                void url
                await Promise.resolve()
            },
        },
    },
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    // 首个注册用户自动成为管理员。
                    // count 失败时抛错中止注册：若静默降级为默认 user，后续 count 不再为 0，
                    // 系统将永久无管理员（管理员分配失败必须阻断创建）。
                    const userRepo = ds.getRepository(User)
                    const count = await userRepo.count()
                    if (count === 0) {
                        user.role = 'admin'
                    }
                    return {
                        data: user,
                    }
                },
            },
        },
    },
})

export type AuthInstance = ReturnType<typeof buildAuth>

export const getAuthInstance = async (options: {
    authSecret: string
    smtpEnabled: boolean
    registrationDisabled: boolean
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

export const getAuth = async (): Promise<AuthInstance> => {
    const scope = getGlobalScope()
    if (!scope[GLOBAL_AUTH_KEY]) {
        const config = useRuntimeConfig()
        assertAuthSecret(config.authSecret)
        scope[GLOBAL_AUTH_KEY] = await getAuthInstance({
            authSecret: config.authSecret,
            smtpEnabled: config.smtpEnabled,
            registrationDisabled: config.registrationDisabled,
        })
    }
    return scope[GLOBAL_AUTH_KEY]!
}
