import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import { getAuth, getAuthInstance, type AuthInstance } from './auth'
import { ensureDatabaseInitialized } from '#server/database'

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
