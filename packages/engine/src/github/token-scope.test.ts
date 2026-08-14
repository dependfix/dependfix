import { describe, expect, it, vi } from 'vitest'
import { analyzeTokenScope, checkTokenPermissions } from './token-scope'

describe('analyzeTokenScope', () => {
    it('warns on classic PAT with repo scope (full repository access)', () => {
        const result = analyzeTokenScope('repo, security_events, workflow', undefined)

        expect(result.scopes).toContain('repo')
        expect(result.warnings).toHaveLength(1)
        expect(result.warnings[0].code).toBe('CLASSIC_REPO_SCOPE')
        expect(result.warnings[0].message).toContain('classic PAT')
    })

    it('warns on classic PAT missing security_events when code scanning enabled', () => {
        const result = analyzeTokenScope('workflow, admin:org', undefined, { codeScanningEnabled: true })

        expect(result.warnings).toHaveLength(1)
        expect(result.warnings[0].code).toBe('MISSING_SECURITY_EVENTS')
    })

    it('does not warn on classic PAT with repo scope missing security_events (repo implies it)', () => {
        const result = analyzeTokenScope('repo', undefined, { codeScanningEnabled: true })

        expect(result.warnings).toHaveLength(1)
        expect(result.warnings[0].code).toBe('CLASSIC_REPO_SCOPE')
    })

    it('does not warn on classic PAT without repo scope', () => {
        const result = analyzeTokenScope('security_events, workflow', undefined)

        expect(result.scopes).toEqual(['security_events', 'workflow'])
        expect(result.warnings).toHaveLength(0)
    })

    it('accepts fine-grained token with security-events read when code scanning enabled', () => {
        const result = analyzeTokenScope(
            undefined,
            'metadata: read, contents: write, pull-requests: write, security-events: read',
            { codeScanningEnabled: true },
        )

        expect(result.acceptedPermissions).toContain('security-events: read')
        expect(result.warnings).toHaveLength(0)
    })

    it('warns when code scanning enabled but fine-grained token lacks security-events read', () => {
        const result = analyzeTokenScope(
            undefined,
            'metadata: read, contents: write, pull-requests: write',
            { codeScanningEnabled: true },
        )

        expect(result.warnings).toHaveLength(1)
        expect(result.warnings[0].code).toBe('MISSING_SECURITY_EVENTS')
    })

    it('does not warn on missing security-events when code scanning disabled', () => {
        const result = analyzeTokenScope(
            undefined,
            'metadata: read, contents: write, pull-requests: write',
            { codeScanningEnabled: false },
        )

        expect(result.warnings).toHaveLength(0)
    })

    it('handles whitespace and case in accepted permissions', () => {
        const result = analyzeTokenScope(undefined, 'metadata: read,  Security-Events: Read', {
            codeScanningEnabled: true,
        })

        expect(result.warnings).toHaveLength(0)
    })

    it('returns no warnings when no permission headers present', () => {
        const result = analyzeTokenScope(undefined, undefined)

        expect(result.scopes).toBeUndefined()
        expect(result.acceptedPermissions).toBeUndefined()
        expect(result.warnings).toHaveLength(0)
    })

    it('treats empty string headers as no permission info', () => {
        const result = analyzeTokenScope('', '', { codeScanningEnabled: true })

        expect(result.warnings).toHaveLength(0)
    })

    it('prefers classic scopes when both headers present (conservative warning direction)', () => {
        const result = analyzeTokenScope('repo', 'metadata: read', { codeScanningEnabled: true })

        expect(result.scopes).toEqual(['repo'])
        expect(result.acceptedPermissions).toBeUndefined()
        expect(result.warnings[0].code).toBe('CLASSIC_REPO_SCOPE')
    })
})

describe('checkTokenPermissions', () => {
    it('parses classic token scopes from GET /user response headers', async () => {
        const client = {
            request: vi.fn().mockResolvedValue({
                data: { login: 'octocat' },
                headers: {
                    'x-oauth-scopes': 'repo, security_events',
                    'x-accepted-github-permissions': undefined,
                },
            }),
        } as never

        const result = await checkTokenPermissions(client)

        expect(result.ok).toBe(true)
        expect(result.login).toBe('octocat')
        expect(result.scopes).toEqual(['repo', 'security_events'])
        expect(result.warnings[0].code).toBe('CLASSIC_REPO_SCOPE')
    })

    it('parses fine-grained accepted permissions', async () => {
        const client = {
            request: vi.fn().mockResolvedValue({
                data: { login: 'octocat' },
                headers: {
                    'x-oauth-scopes': undefined,
                    'x-accepted-github-permissions': 'metadata: read, security-events: read',
                },
            }),
        } as never

        const result = await checkTokenPermissions(client, { codeScanningEnabled: true })

        expect(result.ok).toBe(true)
        expect(result.acceptedPermissions).toEqual(['metadata: read', 'security-events: read'])
        expect(result.warnings).toHaveLength(0)
    })

    it('returns ok=false silently on request failure', async () => {
        const client = {
            request: vi.fn().mockRejectedValue(new Error('401 Unauthorized')),
        } as never

        const result = await checkTokenPermissions(client)

        expect(result.ok).toBe(false)
        expect(result.warnings).toHaveLength(0)
        expect(result.login).toBeUndefined()
    })

    it('passes abort signal with timeout for the request', async () => {
        const requestMock = vi.fn().mockRejectedValue(new Error('aborted'))
        const client = { request: requestMock } as never

        await checkTokenPermissions(client)

        const requestOptions = requestMock.mock.calls[0][1] as { request: { signal: AbortSignal } }
        expect(requestOptions.request.signal).toBeInstanceOf(AbortSignal)
        expect(requestOptions.request.signal.aborted).toBe(false)
    })
})
