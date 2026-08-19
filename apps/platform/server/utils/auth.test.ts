import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import { getAuth, getAuthInstance, type AuthInstance } from './auth'
import { ensureDatabaseInitialized } from '#server/database'

// mock mailer 模块（验证三回调触发 mailer.sendTemplateMail）
const sendTemplateMailMock = vi.hoisted(() => vi.fn())
vi.mock('#server/services/mailer', () => ({
    sendTemplateMail: sendTemplateMailMock,
    MailerError: class MailerError extends Error {
        constructor(public code: string, message: string) {
            super(message)
            this.name = 'MailerError'
        }
    },
}))

const AUTH_GLOBAL_KEY = '__dependfix_auth_instance__'

const baseOptions = {
    authSecret: 'test-secret-not-default',
    smtpEnabled: false,
    registrationDisabled: false,
    authMode: 'public' as const,
    allowedEmailDomains: [],
    blockedEmailDomains: [],
}

describe('getAuthInstance', () => {
    beforeAll(async () => {
        setupMemoryDatabase()
        await ensureDatabaseInitialized()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('builds auth instance with public mode (no OAuth/OIDC configured)', async () => {
        const auth = await getAuthInstance(baseOptions) as AuthInstance
        expect(auth).toBeTruthy()
        expect(typeof auth.api?.getSession).toBe('function')
    })

    it('enables OIDC plugin when discovery url and client credentials are present', async () => {
        const auth = await getAuthInstance({
            ...baseOptions,
            authMode: 'enterprise',
            oidcDiscoveryUrl: 'https://idp.example.com/.well-known/openid-configuration',
            oidcClientId: 'client-1',
            oidcClientSecret: 'secret-1',
            oidcScopes: 'openid,profile,email',
        }) as AuthInstance
        expect(auth).toBeTruthy()
    })

    it('enables OIDC with manual endpoints when issuer provided without discovery', async () => {
        const auth = await getAuthInstance({
            ...baseOptions,
            authMode: 'enterprise',
            oidcIssuer: 'https://idp.example.com',
            oidcClientId: 'client-2',
            oidcClientSecret: 'secret-2',
            oidcAuthorizationUrl: 'https://idp.example.com/authorize',
            oidcTokenUrl: 'https://idp.example.com/token',
            oidcUserInfoUrl: 'https://idp.example.com/userinfo',
        }) as AuthInstance
        expect(auth).toBeTruthy()
    })

    it('enables GitHub/Google social providers when credentials are present', async () => {
        const auth = await getAuthInstance({
            ...baseOptions,
            githubClientId: 'gh-id',
            githubClientSecret: 'gh-secret',
            googleClientId: 'gl-id',
            googleClientSecret: 'gl-secret',
        }) as AuthInstance
        expect(auth).toBeTruthy()
    })

    it('uses relaxed rate limit in e2e test environment', async () => {
        process.env.E2E_TEST = 'true'
        try {
            const auth = await getAuthInstance(baseOptions) as AuthInstance
            expect(auth).toBeTruthy()
        } finally {
            delete process.env.E2E_TEST
        }
    })

    it('runs with smtp enabled flag (verification flows configured)', async () => {
        const auth = await getAuthInstance({
            ...baseOptions,
            smtpEnabled: true,
        }) as AuthInstance
        expect(auth).toBeTruthy()
    })
})

describe('getAuth', () => {
    const resetSingleton = () => {
        delete (globalThis as Record<string, unknown>)[AUTH_GLOBAL_KEY]
    }

    beforeEach(() => {
        resetSingleton()
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'test-secret-not-default',
            authMode: 'public',
            smtpEnabled: false,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        resetSingleton()
    })

    it('builds and caches auth instance singleton', async () => {
        const first = await getAuth()
        const second = await getAuth()
        expect(second).toBe(first)
    })

    it('rejects invalid AUTH_MODE on first call', async () => {
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'test-secret-not-default',
            authMode: 'invalid-mode',
            smtpEnabled: false,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
        await expect(getAuth()).rejects.toThrow(/AUTH_MODE 配置非法/)
    })

    it('rejects default auth secret in production', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'dev-secret-change-me',
            authMode: 'public',
            smtpEnabled: false,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
        await expect(getAuth()).rejects.toThrow(/AUTH_SECRET 未配置或仍为默认值/)
        vi.unstubAllEnvs()
    })
})

describe('邮件回调（sendVerificationEmail / sendResetPassword / sendChangeEmailConfirmation）', () => {
    beforeEach(() => {
        sendTemplateMailMock.mockReset()
        // 默认 smtpEnabled = false（回调走 console.warn 降级）
        sendTemplateMailMock.mockResolvedValue({ delivered: false, mode: 'noop' })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        delete (globalThis as Record<string, unknown>)[AUTH_GLOBAL_KEY]
    })

    it('SMTP 未配置 → 三回调均不调用 mailer（noop 降级路径）', async () => {
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'test-secret',
            authMode: 'public',
            smtpEnabled: false,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
        const auth = await getAuth()

        // 调用各回调（better-auth 内部用闭包注册；通过 options 触发）
        const resetCb = auth.options.emailAndPassword?.sendResetPassword
        const verifyCb = auth.options.emailVerification?.sendVerificationEmail
        const changeCb = (auth.options.user as unknown as { changeEmail?: { sendChangeEmailConfirmation?: (...args: unknown[]) => Promise<void> } })?.changeEmail?.sendChangeEmailConfirmation

        expect(resetCb).toBeDefined()
        expect(verifyCb).toBeDefined()
        expect(changeCb).toBeDefined()

        await resetCb!({ user: { email: 'user@example.com' }, url: 'https://example.com/reset' } as never)
        await verifyCb!({ user: { email: 'user@example.com' }, url: 'https://example.com/verify' } as never)
        await changeCb!({ user: { email: 'user@example.com' }, newEmail: 'new@example.com', url: 'https://example.com/confirm' } as never)

        expect(sendTemplateMailMock).not.toHaveBeenCalled()
    })

    it('SMTP 已配置 + sendResetPassword → 调用 mailer(kind=reset-password)', async () => {
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'test-secret',
            authMode: 'public',
            smtpEnabled: true,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
        const auth = await getAuth()

        const resetCb = auth.options.emailAndPassword?.sendResetPassword as ((args: { user: { email: string }, url: string }) => Promise<void>)
        await resetCb({ user: { email: 'reset@example.com' }, url: 'https://example.com/reset?token=xyz' })

        expect(sendTemplateMailMock).toHaveBeenCalledTimes(1)
        expect(sendTemplateMailMock).toHaveBeenCalledWith('en-US', 'reset-password', expect.objectContaining({
            email: 'reset@example.com',
            url: 'https://example.com/reset?token=xyz',
            appName: 'dependfix',
        }))
    })

    it('SMTP 已配置 + sendVerificationEmail → 调用 mailer(kind=verification)', async () => {
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'test-secret',
            authMode: 'public',
            smtpEnabled: true,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
        const auth = await getAuth()

        const verifyCb = auth.options.emailVerification?.sendVerificationEmail as ((args: { user: { email: string }, url: string }) => Promise<void>)
        await verifyCb({ user: { email: 'verify@example.com' }, url: 'https://example.com/verify?token=abc' })

        expect(sendTemplateMailMock).toHaveBeenCalledTimes(1)
        expect(sendTemplateMailMock).toHaveBeenCalledWith('en-US', 'verification', expect.objectContaining({
            email: 'verify@example.com',
            url: 'https://example.com/verify?token=abc',
        }))
    })

    it('SMTP 已配置 + sendChangeEmailConfirmation → 调用 mailer(kind=change-email, 含 newEmail)', async () => {
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'test-secret',
            authMode: 'public',
            smtpEnabled: true,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
        const auth = await getAuth()

        const changeCb = (auth.options.user as unknown as {
            changeEmail?: { sendChangeEmailConfirmation?: (args: { user: { email: string }, newEmail: string, url: string }) => Promise<void> }
        })?.changeEmail?.sendChangeEmailConfirmation

        await changeCb!({
            user: { email: 'old@example.com' },
            newEmail: 'new@example.com',
            url: 'https://example.com/confirm?token=ccc',
        })

        expect(sendTemplateMailMock).toHaveBeenCalledTimes(1)
        expect(sendTemplateMailMock).toHaveBeenCalledWith('en-US', 'change-email', expect.objectContaining({
            email: 'old@example.com',
            newEmail: 'new@example.com',
            url: 'https://example.com/confirm?token=ccc',
        }))
    })

    it('SMTP 已配置 + mailer 抛错 → 回调不向上抛（fail-quiet；better-auth 流程不阻塞）', async () => {
        vi.stubGlobal('useRuntimeConfig', () => ({
            authSecret: 'test-secret',
            authMode: 'public',
            smtpEnabled: true,
            registrationDisabled: false,
            allowedEmailDomains: '',
            blockedEmailDomains: '',
        }))
        // mailer 抛 MailerError 模拟 SMTP 投递失败
        const MailerErrorCtor = (await import('#server/services/mailer' as never)).MailerError as new (code: string, message: string) => Error
        sendTemplateMailMock.mockRejectedValue(new MailerErrorCtor('MAIL_SEND_FAILED', 'fake failure'))
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* swallow expected error log */ })

        const auth = await getAuth()
        const verifyCb = auth.options.emailVerification?.sendVerificationEmail as ((args: { user: { email: string }, url: string }) => Promise<void>)

        // 不应 throw
        await expect(verifyCb({ user: { email: 'fail@example.com' }, url: 'https://example.com' })).resolves.toBeUndefined()

        expect(sendTemplateMailMock).toHaveBeenCalledTimes(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('验证邮件发送失败'),
            expect.any(Error),
        )

        consoleErrorSpy.mockRestore()
    })
})
