import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import healthHandler from './health.get'
import reposHandler from './repos/index.get'
import repoHandler from './repos/[id].get'
import runsHandler from './runs/index.get'
import runHandler from './runs/[id].get'
import { ensureDatabaseInitialized } from '#server/database'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { resolveOrganizationId } from '#server/utils/organization'
import { requireAuth, requireOrgResource } from '#server/utils/guard'
import { API_V1_FIELDS, API_V1_FORBIDDEN_FIELDS } from '#server/schemas/api-v1-fields'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({
        user: { id: 'u1', email: 'admin@test.dev' },
        session: { user: { id: 'u1', email: 'admin@test.dev', role: 'admin' } },
    })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const expectWhitelist = (payload: Record<string, unknown>, allowed: readonly string[]) => {
    expect(Object.keys(payload).sort()).toEqual([...allowed].sort())
    for (const forbidden of API_V1_FORBIDDEN_FIELDS) {
        expect(payload).not.toHaveProperty(forbidden)
    }
}

describe('/api/v1 只读契约（repos / runs）', () => {
    let repoId: string
    let secondRepoId: string
    let runId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const repoRepo = ds.getRepository(Repository)

        const first = await repoRepo.save(repoRepo.create({
            organizationId,
            owner: 'demo',
            name: 'app',
            platform: 'github',
            defaultBranch: 'main',
            packageManager: 'pnpm',
            executorKind: 'container',
            note: 'token=super-secret-note',
            verifyCommands: JSON.stringify(['pnpm test']),
            tags: JSON.stringify(['core']),
            aiEnabled: true,
            aiTrigger: 'failure',
        }))
        repoId = first.id

        const second = await repoRepo.save(repoRepo.create({
            organizationId,
            owner: 'demo',
            name: 'other',
            platform: 'github',
            defaultBranch: 'main',
            packageManager: 'pnpm',
            executorKind: 'container',
        }))
        secondRepoId = second.id

        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: repoId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsTotal: 1, note: 'Authorization: Bearer abc.def' }),
            errorJson: JSON.stringify({ code: 'CLONE_FAILED', message: 'failed https://user:pass@example.com/repo' }),
            logsJson: JSON.stringify([{ timestamp: new Date().toISOString(), level: 'info', message: 'internal log line' }]),
            logsDropped: 2,
        }))
        runId = run.id

        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: runId,
            repositoryId: repoId,
            upstreamId: 'dependabot:1',
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            summary: 'prototype pollution at /root/private/repo',
            fixable: true,
            fixStatus: 'not-tried',
            errorMessage: 'see https://user:pass@example.com/advisory',
            firstSeenAt: new Date('2026-11-19T00:00:00Z'),
            lastSeenAt: new Date('2026-11-19T00:00:00Z'),
            occurrenceCount: 1,
        }))
    })

    afterAll(() => teardownMemoryDatabase())

    it('health 免认证且只含白名单字段', async () => {
        const body = await healthHandler(makeEvent('GET', '/api/v1/health')) as Record<string, unknown>
        expectWhitelist(body, API_V1_FIELDS.health)
        expect(body).not.toHaveProperty('sensitive')
    })

    it('repos 集合返回分页对象、字段白名单、owner/name 精确过滤', async () => {
        const body = await reposHandler(makeEvent('GET', '/api/v1/repos?owner=demo&name=app')) as {
            items: Record<string, unknown>[]
            total: number
            page: number
            pageSize: number
        }
        expect(Object.keys(body).sort()).toEqual(['items', 'page', 'pageSize', 'total'])
        expect(body.total).toBe(1)
        expect(body.page).toBe(1)
        expect(body.pageSize).toBe(100)
        expect(body.items[0]).toMatchObject({ id: repoId, hasCredential: false, hasCustomVerifyCommands: true })
        expectWhitelist(body.items[0]!, API_V1_FIELDS.repo)
        // 备注中的敏感键赋值被清洗
        expect(JSON.stringify(body.items[0])).not.toContain('super-secret-note')
    })

    it('repos pageSize 超上限静默钳制且分页生效', async () => {
        const body = await reposHandler(makeEvent('GET', '/api/v1/repos?pageSize=9999')) as {
            items: unknown[]
            total: number
            pageSize: number
        }
        expect(body.pageSize).toBe(500)
        expect(body.total).toBe(2)

        const page1 = await reposHandler(makeEvent('GET', '/api/v1/repos?page=1&pageSize=1')) as { items: { id: string }[] }
        const page2 = await reposHandler(makeEvent('GET', '/api/v1/repos?page=2&pageSize=1')) as { items: { id: string }[] }
        expect(page1.items).toHaveLength(1)
        expect(page2.items).toHaveLength(1)
        expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id)
    })

    it('repo 详情字段白名单且无凭据标识', async () => {
        const body = await repoHandler(makeEvent('GET', `/api/v1/repos/${repoId}`, undefined, {}, { id: repoId })) as Record<string, unknown>
        expect(body.id).toBe(repoId)
        expectWhitelist(body, API_V1_FIELDS.repo)
    })

    it('runs 集合字段白名单、分页上限 200、无日志字段', async () => {
        const body = await runsHandler(makeEvent('GET', '/api/v1/runs?pageSize=9999')) as {
            items: Record<string, unknown>[]
            total: number
            pageSize: number
        }
        expect(body.pageSize).toBe(200)
        expect(body.total).toBe(1)
        expectWhitelist(body.items[0]!, API_V1_FIELDS.run)
        expect(body.items[0]!.summary).toEqual({ alertsTotal: 1, note: 'Authorization: Bearer ***' })
        expect(body.items[0]!.error).toEqual({ code: 'CLONE_FAILED', message: 'failed https://***@example.com/repo' })
    })

    it('run 详情剔除 logs/logsText，结果行字段白名单且自由文本清洗', async () => {
        const body = await runHandler(makeEvent('GET', `/api/v1/runs/${runId}`, undefined, {}, { id: runId })) as Record<string, unknown> & {
            results: Record<string, unknown>[]
        }
        expectWhitelist(body, [...API_V1_FIELDS.run, ...API_V1_FIELDS.runDetailExtra])
        expect(body).not.toHaveProperty('logs')
        expect(body).not.toHaveProperty('logsText')
        expect(body).not.toHaveProperty('logsDropped')
        expect(body.results).toHaveLength(1)
        expectWhitelist(body.results[0]!, API_V1_FIELDS.runResult)
        expect(body.results[0]!.summary).toContain('<path>')
        expect(body.results[0]!.errorMessage).toContain('https://***@example.com')
    })

    it('详情端点拒绝未认证与跨组织访问（守卫被真实调用）', async () => {
        const authError = Object.assign(new Error('unauthorized'), { statusCode: 401 })
        vi.mocked(requireAuth).mockRejectedValueOnce(authError)
        await expect(repoHandler(makeEvent('GET', `/api/v1/repos/${repoId}`, undefined, {}, { id: repoId }))).rejects.toBe(authError)

        const orgError = Object.assign(new Error('cross org'), { statusCode: 403 })
        vi.mocked(requireOrgResource).mockRejectedValueOnce(orgError)
        await expect(runHandler(makeEvent('GET', `/api/v1/runs/${runId}`, undefined, {}, { id: runId }))).rejects.toBe(orgError)
    })

    it('非法查询返回 400 且 code 稳定', async () => {
        await expectError(runsHandler(makeEvent('GET', '/api/v1/runs?status=nope')), 400)
        await expectError(reposHandler(makeEvent('GET', '/api/v1/repos?page=0')), 400)
    })
})
