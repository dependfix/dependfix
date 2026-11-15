import { describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../../../tests/api-helper'

/**
 * GET /api/sandbox/self-check：管理员只读自检端点。
 *
 * 覆盖：角色门禁（admin / org_admin）、返回结构（可用性 / 镜像 / 出站主机）、不返回凭据。
 */

const report = {
    available: false,
    reason: 'daemon_unreachable',
    detail: 'Cannot connect to the Docker daemon',
    runtimeName: 'docker',
    modes: ['report-only', 'fix', 'fix-and-pr'],
    imageCandidates: ['caomeiyouren/dependfix-sandbox:latest'],
    imagePresence: [{ image: 'caomeiyouren/dependfix-sandbox:latest', present: false }],
    egress: { enabled: true, allowlist: ['github.com', '*.npmjs.org'], fixRequiresEgress: true },
}

const { requireRoleMock, getSelfCheckMock } = vi.hoisted(() => ({
    requireRoleMock: vi.fn(async () => ({ user: { id: 'u1' } })),
    getSelfCheckMock: vi.fn(async () => report),
}))

vi.mock('#server/utils/guard', () => ({
    requireRole: requireRoleMock,
    requireAuth: vi.fn(async () => ({ user: { id: 'u1' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

vi.mock('#server/services/executor/sandbox-executor', () => ({
    SandboxExecutor: class {
        async getSelfCheck() {
            return getSelfCheckMock()
        }
    },
}))

const { default: handler } = await import('./self-check.get')

describe('GET /api/sandbox/self-check', () => {
    it('返回自检报告 + 检查时间 + 文档指针，且不含凭据', async () => {
        const result = await handler(makeEvent('GET', '/api/sandbox/self-check')) as Record<string, unknown>

        expect(requireRoleMock).toHaveBeenCalledWith(expect.anything(), ['admin', 'org_admin'])
        expect(result).toMatchObject(report)
        expect(typeof result.checkedAt).toBe('string')
        expect(result.docs).toEqual({
            deployment: '/docs/guide/deployment.md',
            security: '/docs/standards/security.md',
        })
        expect(JSON.stringify(result)).not.toMatch(/token|password|secret/i)
    })
})
