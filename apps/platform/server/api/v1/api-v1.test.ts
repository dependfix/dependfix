import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import healthHandler from './health.get'
import reposHandler from './repos/index.get'
import repoHandler from './repos/[id].get'
import runsHandler from './runs/index.get'
import runHandler from './runs/[id].get'
import logsHandler from './runs/[id]/logs.get'
import alertsHandler from './alerts/index.get'
import prChecksHandler from './pr-checks/index.get'
import dashboardHandler from './dashboard/stats.get'
import { ensureDatabaseInitialized } from '#server/database'
import { Repository } from '#server/entities/repository'
import { Organization } from '#server/entities/organization'
import { PRCheck } from '#server/entities/pr-check'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { resolveOrganizationId } from '#server/utils/organization'
import { requireAuth } from '#server/utils/guard'
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
    let crossRepoId: string
    let crossRunId: string

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

        await ds.getRepository(Organization).save(ds.getRepository(Organization).create({ id: 'other-org', name: 'Other Org' }))
        const crossRepo = await repoRepo.save(repoRepo.create({
            organizationId: 'other-org',
            owner: 'other',
            name: 'cross',
            platform: 'github',
            defaultBranch: 'main',
            packageManager: 'pnpm',
            executorKind: 'container',
        }))
        crossRepoId = crossRepo.id
        crossRunId = (await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: crossRepoId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))).id

        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: repoId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsTotal: 1, note: 'Authorization: Bearer abc.def' }),
            errorJson: JSON.stringify({ code: 'CLONE_FAILED', message: 'failed https://user:pass@example.com/repo' }),
            logsJson: JSON.stringify([
                { timestamp: '2026-11-19T10:00:00Z', level: 'warn', message: 'retry 200ms at /root/a' },
                { timestamp: '2026-11-19T10:00:01Z', level: 'warn', message: 'retry 300ms at /root/b' },
                { timestamp: '2026-11-19T10:00:02Z', level: 'error', message: 'install failed at /app/package.json' },
            ]),
            logsDropped: 2,
        }))
        runId = run.id

        await ds.getRepository(PRCheck).save(ds.getRepository(PRCheck).create({
            repositoryId: repoId,
            prNumber: 7,
            headSha: 'deadbeefcafe',
            authorLogin: 'dependabot[bot]',
            conclusion: 'failure',
            prState: 'open',
            overallStatus: 'failure',
            alertFiring: true,
            errorMessage: 'failed at /root/private/repo',
            detailsUrl: 'https://ci.example.com/run?access_token=secret-sas',
            signalsJson: JSON.stringify([{
                kind: 'check',
                provider: 'github',
                name: 'CI /root/check-name',
                state: 'failure',
                rawState: 'failure',
                sourceId: '1',
                targetUrl: 'https://ci.example.com/run?access_token=abc',
                logUrl: null,
                summary: 'failed at /root/private/repo with dfk_ab-cdefghij',
                observedAt: '2026-11-19T10:00:00Z',
            }]),
            failureSourcesJson: JSON.stringify([{ provider: 'github', name: 'CI /root/check-name', kind: 'check' }]),
            lastPolledAt: new Date('2026-11-19T10:00:00Z'),
        }))

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
        expect([repoId, secondRepoId]).toContain(page2.items[0]!.id)
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

    it('详情端点拒绝未认证访问（会话守卫被真实调用）', async () => {
        const authError = Object.assign(new Error('unauthorized'), { statusCode: 401 })
        vi.mocked(requireAuth).mockRejectedValueOnce(authError)
        await expect(repoHandler(makeEvent('GET', `/api/v1/repos/${repoId}`, undefined, {}, { id: repoId }))).rejects.toBe(authError)
    })

    it('跨组织资源返回 403 RESOURCE_NOT_IN_ORG（repos / runs 详情）', async () => {
        await expect(repoHandler(makeEvent('GET', `/api/v1/repos/${crossRepoId}`, undefined, {}, { id: crossRepoId })))
            .rejects.toMatchObject({ statusCode: 403 })
        await expect(runHandler(makeEvent('GET', `/api/v1/runs/${crossRunId}`, undefined, {}, { id: crossRunId })))
            .rejects.toMatchObject({ statusCode: 403 })
        // 集合端点（runs）按组织过滤，不返回跨组织运行
        const runs = await runsHandler(makeEvent('GET', '/api/v1/runs?pageSize=200')) as { items: { id: string }[] }
        expect(runs.items.some((item) => item.id === crossRunId)).toBe(false)
    })

    it('alerts / pr-checks / dashboard 字段白名单与分页对象', async () => {
        const alerts = await alertsHandler(makeEvent('GET', '/api/v1/alerts?pageSize=9999')) as {
            items: Record<string, unknown>[]
            total: number
            pageSize: number
        }
        expect(alerts.pageSize).toBe(500)
        expect(alerts.items).toHaveLength(1)
        expectWhitelist(alerts.items[0]!, API_V1_FIELDS.alert)
        expect(alerts.items[0]!.summary).toContain('<path>')

        const prChecks = await prChecksHandler(makeEvent('GET', '/api/v1/pr-checks?conclusion=failure')) as {
            items: Record<string, unknown>[]
            total: number
        }
        expect(prChecks.total).toBe(1)
        expectWhitelist(prChecks.items[0]!, API_V1_FIELDS.prCheck)
        expect(prChecks.items[0]!.errorMessage).toContain('<path>')
        expect(prChecks.items[0]!.repository).toBe('demo/app')
        const serialized = JSON.stringify(prChecks.items[0])
        expect(serialized).not.toContain('/root')
        expect(serialized).not.toContain('access_token=abc')
        expect(serialized).toContain('dfk_***')

        const dashboard = await dashboardHandler(makeEvent('GET', '/api/v1/dashboard/stats')) as Record<string, unknown>
        expectWhitelist(dashboard, API_V1_FIELDS.dashboard)
        // 跨组织（other-org）不计入：仅 demo/app 与 demo/other
        expect(dashboard.repositoryCount).toBe(2)
        expect(dashboard.alertsTotal).toBe(1)
        expect((dashboard.latestRun as { id: string } | null)?.id).not.toBe(crossRunId)
    })

    it('logs grouped / raw 同源清洗、分页与 droppedBefore，跨组织 403', async () => {
        const grouped = await logsHandler(makeEvent('GET', `/api/v1/runs/${runId}/logs`, undefined, {}, { id: runId })) as unknown as {
            view: string
            total: number
            groupCount: number
            droppedBefore: number
            groups: Record<string, unknown>[]
        }
        expect(grouped.view).toBe('grouped')
        expect(grouped.total).toBe(3)
        expect(grouped.groupCount).toBe(2)
        expect(grouped.droppedBefore).toBe(2)
        expectWhitelist(grouped as unknown as Record<string, unknown>, API_V1_FIELDS.logGrouped)
        expectWhitelist(grouped.groups[0]!, API_V1_FIELDS.logGroup)
        // 两条 warn 归一为同一模板；error 逐条保留正文
        expect(grouped.groups.find((group) => group.level === 'warn')!.count).toBe(2)
        expect(grouped.groups.find((group) => group.level === 'error')!.template).toContain('<path>')

        const raw = await logsHandler(makeEvent('GET', `/api/v1/runs/${runId}/logs?view=raw&q=retry&pageSize=1`, undefined, {}, { id: runId })) as unknown as {
            view: string
            total: number
            returned: number
            truncated: boolean
            entries: Record<string, unknown>[]
        }
        expect(raw.view).toBe('raw')
        expect(raw.total).toBe(2)
        expect(raw.returned).toBe(1)
        expect(raw.truncated).toBe(true)
        expectWhitelist(raw as unknown as Record<string, unknown>, API_V1_FIELDS.logRaw)
        expectWhitelist(raw.entries[0]!, API_V1_FIELDS.logEntry)

        await expect(logsHandler(makeEvent('GET', `/api/v1/runs/${crossRunId}/logs`, undefined, {}, { id: crossRunId })))
            .rejects.toMatchObject({ statusCode: 403 })
        await expect(logsHandler(makeEvent('GET', `/api/v1/runs/${runId}/logs?level=bogus`, undefined, {}, { id: runId })))
            .rejects.toMatchObject({ statusCode: 400 })
    })

    it('非法查询返回 400 且 code 稳定', async () => {
        await expectError(runsHandler(makeEvent('GET', '/api/v1/runs?status=nope')), 400)
        await expectError(reposHandler(makeEvent('GET', '/api/v1/repos?page=0')), 400)
    })
})
