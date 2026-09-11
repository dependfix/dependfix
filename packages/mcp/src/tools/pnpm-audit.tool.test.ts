import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * packages/mcp/src/tools/pnpm-audit.tool.test.ts
 *
 * pnpmAudit MCP tool 测试覆盖（M28.4 / C33）：
 * - 成功返回：ok=true + count + workDir + repository + alerts
 * - 失败返回：ok=false + error（toToolError 模板）
 * - 错误包装 helper 复用：requireToken + toToolError
 */

const { mockRequireToken, mockFetchPnpmAuditAlerts } = vi.hoisted(() => ({
    mockRequireToken: vi.fn(),
    mockFetchPnpmAuditAlerts: vi.fn(),
}))

vi.mock('./errors', () => ({
    requireToken: mockRequireToken,
    toToolError: (error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    }),
}))

vi.mock('@dependfix/engine', () => ({
    fetchPnpmAuditAlerts: mockFetchPnpmAuditAlerts,
}))

import { pnpmAudit } from './pnpm-audit.tool'

const sampleNormalizedAlert = {
    id: 123456,
    severity: 'high',
    packageName: 'lodash',
    manifestPath: 'package.json',
    recommendedVersion: '4.17.21',
    fixable: true,
    htmlUrl: 'https://github.com/example/repo/security/dependabot/1',
    summary: 'Prototype Pollution in lodash',
}

describe('pnpmAudit MCP tool (M28.4 / C33)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockRequireToken.mockReturnValue('ghp_test_token')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns ok=true with normalized alerts on success', async () => {
        mockFetchPnpmAuditAlerts.mockResolvedValue([sampleNormalizedAlert])

        const result = await pnpmAudit({ workDir: '/repo', repository: 'owner/repo' })

        expect(result).toEqual({
            ok: true,
            count: 1,
            workDir: '/repo',
            repository: 'owner/repo',
            alerts: [
                {
                    id: 123456,
                    severity: 'high',
                    packageName: 'lodash',
                    manifestPath: 'package.json',
                    recommendedVersion: '4.17.21',
                    fixable: true,
                    htmlUrl: 'https://github.com/example/repo/security/dependabot/1',
                    summary: 'Prototype Pollution in lodash',
                },
            ],
        })
        expect(mockFetchPnpmAuditAlerts).toHaveBeenCalledWith({
            workDir: '/repo',
            repository: 'owner/repo',
        })
    })

    it('returns ok=true with count=0 when no vulnerabilities', async () => {
        mockFetchPnpmAuditAlerts.mockResolvedValue([])

        const result = await pnpmAudit({ workDir: '/repo', repository: 'owner/repo' })

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.count).toBe(0)
            expect(result.alerts).toEqual([])
            expect(result.workDir).toBe('/repo')
            expect(result.repository).toBe('owner/repo')
        }
    })

    it('returns ok=false when GITHUB_TOKEN is not set (requireToken error)', async () => {
        mockRequireToken.mockReturnValue({
            ok: false,
            error: 'GITHUB_TOKEN not set（请配置环境变量）',
        })

        const result = await pnpmAudit({ workDir: '/repo', repository: 'owner/repo' })

        expect(result).toEqual({
            ok: false,
            error: 'GITHUB_TOKEN not set（请配置环境变量）',
        })
        expect(mockFetchPnpmAuditAlerts).not.toHaveBeenCalled()
    })

    it('returns ok=false when pnpm audit fails (toToolError wraps Error)', async () => {
        mockFetchPnpmAuditAlerts.mockRejectedValue(new Error('pnpm audit failed: lockfile missing'))

        const result = await pnpmAudit({ workDir: '/repo', repository: 'owner/repo' })

        expect(result).toEqual({
            ok: false,
            error: 'pnpm audit failed: lockfile missing',
        })
    })

    it('returns ok=false when pnpm audit throws non-Error (toToolError converts to string)', async () => {
        mockFetchPnpmAuditAlerts.mockRejectedValue('plain string error')

        const result = await pnpmAudit({ workDir: '/repo', repository: 'owner/repo' })

        expect(result).toEqual({
            ok: false,
            error: 'plain string error',
        })
    })

    it('passes workDir and repository through to fetchPnpmAuditAlerts', async () => {
        mockFetchPnpmAuditAlerts.mockResolvedValue([])

        await pnpmAudit({ workDir: '/custom/work/dir', repository: 'custom-org/custom-repo' })

        expect(mockFetchPnpmAuditAlerts).toHaveBeenCalledWith({
            workDir: '/custom/work/dir',
            repository: 'custom-org/custom-repo',
        })
    })

    it('handles multiple alerts correctly', async () => {
        mockFetchPnpmAuditAlerts.mockResolvedValue([
            sampleNormalizedAlert,
            { ...sampleNormalizedAlert, id: 789012, packageName: 'minimatch', summary: 'ReDoS in minimatch' },
        ])

        const result = await pnpmAudit({ workDir: '/repo', repository: 'owner/repo' })

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.count).toBe(2)
            expect(result.alerts).toHaveLength(2)
            expect(result.alerts[1].packageName).toBe('minimatch')
        }
    })
})
