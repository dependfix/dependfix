import { betterAuth } from 'better-auth'
import { snowflake } from './snowflake'
import { typeormAdapter } from '#server/database/typeorm-adapter'
import { ensureDatabaseInitialized } from '#server/database'
import { User } from '#server/entities/user'

/**
 * better-auth 实例（邮箱密码登录）。
 * 配置要点：
 * - SMTP 未配置时邮箱验证自动跳过（对齐"未配置自动禁用"模式）
 * - 会话数据库持久化 30 天，每 1 天续期
 * - 雪花 ID 与实体 @BeforeInsert 同源
 * - 单用户 MVP：注册默认开放，首个注册用户自动成为管理员（任务归属见 `docs/plan/todo.md` §M6）
 * - 注册开关：`REGISTRATION_DISABLED=true` 时禁用注册（better-auth disableSignUp，
 *   登录不受影响；首个管理员需在开放期注册，之后可关闭）
 */

/** better-auth 实例类型（由实际配置推断，含 role 等附加字段） */
const buildAuth = (ds: Awaited<ReturnType<typeof ensureDatabaseInitialized>>, options: {
    authSecret: string
    smtpEnabled: boolean
    registrationDisabled: boolean
}) => betterAuth({
    appName: 'dependfix',
    secret: options.authSecret,
    database: typeormAdapter(ds),
    emailAndPassword: {
        enabled: true,
        // 关闭注册（保留登录）：部署到公开环境时设置 REGISTRATION_DISABLED=true
        disableSignUp: options.registrationDisabled,
        minPasswordLength: 8,
        requireEmailVerification: options.smtpEnabled,
        sendResetPassword: async () => {
            // SMTP 未配置时不支持重置密码邮件；单用户 MVP 依赖注册 + 会话
            if (!options.smtpEnabled) {
                console.warn('[auth] SMTP 未配置，重置密码邮件未发送')
            }
        },
    },
    emailVerification: {
        sendOnSignUp: options.smtpEnabled,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async () => {
            // SMTP 未配置时跳过验证邮件发送
            if (!options.smtpEnabled) {
                console.warn('[auth] SMTP 未配置，验证邮件未发送')
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
    },
    user: {
        additionalFields: {
            role: {
                type: 'string',
                required: false,
                defaultValue: 'user',
                // 防客户端注入：role 只能由服务端维护
                input: false,
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
