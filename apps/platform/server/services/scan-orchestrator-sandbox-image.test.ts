import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import reposIndexHandler from '../api/repos/index'
import { encryptToken } from './credential.service'
import { runScanForRepository } from './scan-orchestrator.service'
import { ensureDatabaseInitialized } from '#server/database'
import { Credential } from '#server/entities/credential'

/**
 * 仓库级沙箱镜像 → 执行器构造参数的传递（含「未配置则不传」的证伪分支）。
 *
 * 拆独立文件：主编排用例的 describe 已接近 max-lines-per-function 上限。
 */
const { SandboxExecutorMock, ContainerExecutorMock, sandboxIsAvailable, sandboxExecute } = vi.hoisted(() => ({
    SandboxExecutorMock: vi.fn(),
    ContainerExecutorMock: vi.fn(),
    sandboxIsAvailable: vi.fn(),
    sandboxExecute: vi.fn(),
}))

vi.mock('./executor/sandbox-executor', () => ({
    SandboxExecutor: class {
        constructor(...args: unknown[]) {
            SandboxExecutorMock(...args)
        }

        isAvailable = sandboxIsAvailable
        execute = sandboxExecute
    },
}))
vi.mock('./executor/container-executor', () => ({
    ContainerExecutor: class {
        constructor(...args: unknown[]) {
            ContainerExecutorMock(...args)
        }

        isAvailable = vi.fn(async () => true)
        execute = vi.fn()
    },
}))
vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))
vi.mock('./notification', () => ({ notifyEnvEvent: vi.fn() }))

const makeResult = () => ({
    summary: { alertsTotal: 1, severityCounts: { critical: 0, high: 1 } },
    alerts: [{
        source: 'dependabot',
        severity: 'high',
        packageName: 'lodash',
        manifestPath: 'package.json',
        ruleId: null,
        summary: '原型污染',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion: '4.17.21',
        htmlUrl: 'https://github.com/demo/app/security',
        upstreamId: `dependabot:${Math.random()}`,
    }],
})

describe('sandbox image from repository', () => {
    let credentialId: string
    let repositoryId: string

    const createRepo = async (overrides: Record<string, unknown> = {}) => {
        const suffix = Math.random().toString(36).slice(2, 8)
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: `image-${suffix}`,
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
            credentialId,
            ...overrides,
        })) as { id: string }
        return created.id
    }

    beforeAll(async () => {
        setupMemoryDatabase()
        const ds = await ensureDatabaseInitialized()
        const cred = await ds.getRepository(Credential).save(ds.getRepository(Credential).create({
            name: 'github-pat',
            type: 'classic-pat',
            encryptedToken: encryptToken('ghp_test-token', 'test-encryption-key-32-bytes!!'),
        }))
        credentialId = cred.id
        repositoryId = await createRepo()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        sandboxIsAvailable.mockResolvedValue(true)
        sandboxExecute.mockResolvedValue({ exitCode: 0, result: makeResult(), error: undefined })
    })

    it('passes the repository-level image to the executor', async () => {
        const repoId = await createRepo({ sandboxImage: 'ghcr.io/owner/dependfix:1.2.3' })

        await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
        expect(SandboxExecutorMock).toHaveBeenCalledWith(expect.objectContaining({ image: 'ghcr.io/owner/dependfix:1.2.3' }))
    })

    it('omits the image option when the repository has none (falls back to platform default)', async () => {
        await runScanForRepository(repositoryId, { mode: 'report-only', severityThreshold: 'high' })
        const options = SandboxExecutorMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
        expect('image' in options).toBe(false)
    })
})
