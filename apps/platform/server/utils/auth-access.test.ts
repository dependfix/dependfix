import 'reflect-metadata'
import { afterEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import betterSqlite3 from 'better-sqlite3'
import { APIError } from 'better-auth/api'
import { assertRegistrationAllowed, buildCreateUserBefore, type RegistrationAccessContext } from './registration-access'
import { SnakeCaseNamingStrategy } from '#server/database/naming-strategy'
import { User } from '#server/entities/user'

/** 默认 public 开放模式上下文（黑名单空、注册开放） */
const publicOpenCtx: RegistrationAccessContext = {
    authMode: 'public',
    registrationDisabled: false,
    allowedEmailDomains: [],
    blockedEmailDomains: [],
}

/** 断言抛出的 APIError 状态码与 code（4xx 非 500） */
const expectApiError = (fn: () => void, status: number, code: string): void => {
    try {
        fn()
        expect.unreachable('应抛出 APIError')
    } catch (e) {
        expect(e).toBeInstanceOf(APIError)
        const err = e as APIError
        expect(err.statusCode).toBe(status)
        expect((err.body as { code?: string })?.code).toBe(code)
    }
}

describe('assertRegistrationAllowed（注册准入）', () => {
    it('开放模式（public 黑名单空 + 注册开放）放行', () => {
        expect(() => assertRegistrationAllowed('user@gmail.com', publicOpenCtx)).not.toThrow()
    })

    it('REGISTRATION_DISABLED 总开关：拒绝所有渠道（403 REGISTRATION_DISABLED）', () => {
        const ctx: RegistrationAccessContext = { ...publicOpenCtx, registrationDisabled: true }
        expectApiError(() => assertRegistrationAllowed('user@gmail.com', ctx), 403, 'REGISTRATION_DISABLED')
        // 即使 email 缺失，总开关语义优先（注册全部关闭）
        expectApiError(() => assertRegistrationAllowed(null, ctx), 403, 'REGISTRATION_DISABLED')
    })

    it('email 缺失 fail-closed：拒绝开通（403 EMAIL_REQUIRED）', () => {
        expectApiError(() => assertRegistrationAllowed(null, publicOpenCtx), 403, 'EMAIL_REQUIRED')
        expectApiError(() => assertRegistrationAllowed(undefined, publicOpenCtx), 403, 'EMAIL_REQUIRED')
        expectApiError(() => assertRegistrationAllowed('', publicOpenCtx), 403, 'EMAIL_REQUIRED')
    })

    it('public 黑名单命中拒绝（403 EMAIL_DOMAIN_NOT_ALLOWED）；未命中放行', () => {
        const ctx: RegistrationAccessContext = { ...publicOpenCtx, blockedEmailDomains: ['mailinator.com'] }
        expectApiError(() => assertRegistrationAllowed('user@mailinator.com', ctx), 403, 'EMAIL_DOMAIN_NOT_ALLOWED')
        expect(() => assertRegistrationAllowed('user@gmail.com', ctx)).not.toThrow()
    })

    it('enterprise 白名单命中放行；未命中拒绝（403 EMAIL_DOMAIN_NOT_ALLOWED）', () => {
        const ctx: RegistrationAccessContext = {
            authMode: 'enterprise',
            registrationDisabled: false,
            allowedEmailDomains: ['example.com'],
            blockedEmailDomains: [],
        }
        expect(() => assertRegistrationAllowed('user@example.com', ctx)).not.toThrow()
        expectApiError(() => assertRegistrationAllowed('user@other.com', ctx), 403, 'EMAIL_DOMAIN_NOT_ALLOWED')
    })

    it('enterprise 白名单为空 = 完全关闭自动开通（拒绝，platform-auth-users.md §11 决策点 6 修订）', () => {
        const ctx: RegistrationAccessContext = {
            authMode: 'enterprise',
            registrationDisabled: false,
            allowedEmailDomains: [],
            blockedEmailDomains: [],
        }
        expectApiError(() => assertRegistrationAllowed('user@example.com', ctx), 403, 'EMAIL_DOMAIN_NOT_ALLOWED')
    })
})

describe('buildCreateUserBefore（user.create.before hook 集成）', () => {
    let testDs: DataSource

    afterEach(async () => {
        await testDs?.destroy()
    })

    /** 构造内存 SQLite DataSource（User 实体，与生产同名策略） */
    const createMemoryDataSource = async (): Promise<DataSource> => {
        const ds = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            driver: betterSqlite3,
            entities: [User],
            namingStrategy: new SnakeCaseNamingStrategy(),
            synchronize: true,
        })
        await ds.initialize()
        return ds
    }

    it('首用户 count==0：设置 role=admin 并短路，不走准入检查（platform-auth-users.md §11 决策点 11）', async () => {
        testDs = await createMemoryDataSource()
        // enterprise + 白名单空（最严准入）：首用户仍可创建 admin
        const before = buildCreateUserBefore({
            ds: testDs,
            ctx: {
                authMode: 'enterprise',
                registrationDisabled: false,
                allowedEmailDomains: [],
                blockedEmailDomains: [],
            },
        })
        const user: Record<string, unknown> = { email: 'first@anywhere.com', name: 'First' }
        const result = await before(user)
        expect(result.data).toBe(user)
        expect(user.role).toBe('admin')
    })

    it('首用户 + REGISTRATION_DISABLED=true：hook 放行（platform-auth-users.md §11 决策点 11 短路优先；邮箱路径由 disableSignUp 端点级拦截，此处模拟 OAuth 自动开通路径）', async () => {
        testDs = await createMemoryDataSource()
        const before = buildCreateUserBefore({
            ds: testDs,
            ctx: { ...publicOpenCtx, registrationDisabled: true },
        })
        const user: Record<string, unknown> = { email: 'first@anywhere.com', name: 'First' }
        const result = await before(user)
        expect(result.data).toBe(user)
        expect(user.role).toBe('admin')
    })

    it('非首用户 + REGISTRATION_DISABLED=true：hook 拒绝（403 REGISTRATION_DISABLED）', async () => {
        testDs = await createMemoryDataSource()
        const userRepo = testDs.getRepository(User)
        await userRepo.save(userRepo.create({
            email: 'existing@example.com',
            role: 'admin',
        }))
        const before = buildCreateUserBefore({
            ds: testDs,
            ctx: { ...publicOpenCtx, registrationDisabled: true },
        })
        const err = await before({ email: 'second@gmail.com' }).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(APIError)
        expect((err as APIError).statusCode).toBe(403)
        expect((err as APIError).body).toMatchObject({ code: 'REGISTRATION_DISABLED' })
    })

    it('非首用户：走准入检查（enterprise 白名单空拒绝 403 EMAIL_DOMAIN_NOT_ALLOWED）', async () => {
        testDs = await createMemoryDataSource()
        const userRepo = testDs.getRepository(User)
        await userRepo.save(userRepo.create({
            email: 'existing@example.com',
            role: 'admin',
        }))
        const before = buildCreateUserBefore({
            ds: testDs,
            ctx: {
                authMode: 'enterprise',
                registrationDisabled: false,
                allowedEmailDomains: [],
                blockedEmailDomains: [],
            },
        })
        const err = await before({ email: 'second@example.com' }).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(APIError)
        expect((err as APIError).statusCode).toBe(403)
        expect((err as APIError).body).toMatchObject({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' })
    })

    it('非首用户 + 开放模式：放行且不覆盖角色（保持默认 viewer）', async () => {
        testDs = await createMemoryDataSource()
        const userRepo = testDs.getRepository(User)
        await userRepo.save(userRepo.create({
            email: 'existing@example.com',
            role: 'admin',
        }))
        const before = buildCreateUserBefore({ ds: testDs, ctx: publicOpenCtx })
        const user: Record<string, unknown> = { email: 'second@gmail.com', name: 'Second' }
        const result = await before(user)
        expect(result.data).toBe(user)
        // 非首用户不设 role（better-auth 默认 viewer 由 defaultRole 兜底）
        expect(user.role).toBeUndefined()
    })
})
