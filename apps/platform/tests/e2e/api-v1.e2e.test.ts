import { expect, test } from '@playwright/test'
import { unauthenticatedApiContext } from './helpers/unauthenticated-api.helper'

/**
 * `/api/v1` 只读观测面端到端：免认证 health、无会话 401、字段白名单与无 CORS 头。
 *
 * 本阶段尚未引入 API key；鉴权走既有会话 Cookie，key / scope 在后续阶段接入。
 */
test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('/api/v1 只读契约', () => {
    test('health 免认证，且响应无 ACAO', async ({ browser }) => {
        const context = await unauthenticatedApiContext(browser)
        try {
            const response = await context.request.get('/api/v1/health')
            expect(response.status()).toBe(200)
            expect(response.headers()['access-control-allow-origin']).toBeUndefined()
            const body = await response.json() as Record<string, unknown>
            expect(Object.keys(body).sort()).toEqual(['commit', 'schema', 'startedAt', 'version'])
        } finally {
            await context.close()
        }
    })

    test('无会话访问 repos / runs 返回 401 UNAUTHORIZED', async ({ browser }) => {
        const context = await unauthenticatedApiContext(browser)
        try {
            for (const path of ['/api/v1/repos', '/api/v1/runs', '/api/v1/repos/not-a-real-id', '/api/v1/runs/not-a-real-run']) {
                const response = await context.request.get(path)
                expect(response.status(), path).toBe(401)
                const body = await response.json() as { data?: { code?: string } }
                expect(body.data?.code).toBe('UNAUTHORIZED')
            }
        } finally {
            await context.close()
        }
    })

    test('会话访问 repos / runs 返回分页对象与白名单字段，无 ACAO', async ({ page }) => {
        const repos = await page.request.get('/api/v1/repos?pageSize=1')
        expect(repos.status()).toBe(200)
        expect(repos.headers()['access-control-allow-origin']).toBeUndefined()
        const reposBody = await repos.json() as { items: Record<string, unknown>[], page: number, pageSize: number, total: number }
        expect(reposBody.page).toBe(1)
        expect(reposBody.pageSize).toBe(1)
        expect(Array.isArray(reposBody.items)).toBe(true)
        for (const item of reposBody.items) {
            expect(item).not.toHaveProperty('credentialId')
            expect(item).not.toHaveProperty('credentialName')
            expect(item).not.toHaveProperty('verifyCommands')
        }

        for (const path of ['/api/v1/alerts?pageSize=1', '/api/v1/pr-checks?pageSize=1']) {
            const response = await page.request.get(path)
            expect(response.status(), path).toBe(200)
            expect(response.headers()['access-control-allow-origin']).toBeUndefined()
            const body = await response.json() as { items: unknown[], page: number, pageSize: number, total: number }
            expect(Array.isArray(body.items)).toBe(true)
            expect(body.page).toBe(1)
            expect(body.pageSize).toBe(1)
        }
        const dashboard = await page.request.get('/api/v1/dashboard/stats')
        expect(dashboard.status()).toBe(200)
        expect(dashboard.headers()['access-control-allow-origin']).toBeUndefined()

        const runs = await page.request.get('/api/v1/runs?pageSize=1')
        expect(runs.status()).toBe(200)
        expect(runs.headers()['access-control-allow-origin']).toBeUndefined()
        const runsBody = await runs.json() as { items: Record<string, unknown>[], page: number, pageSize: number, total: number }
        expect(runsBody.page).toBe(1)
        expect(runsBody.pageSize).toBe(1)
        for (const item of runsBody.items) {
            expect(item).not.toHaveProperty('logs')
            expect(item).not.toHaveProperty('logsText')
        }
    })

    test('logs 端点 grouped / raw 与 droppedBefore', async ({ page }) => {
        const stamp = Date.now()
        const owner = `e2e-v1-logs-${stamp}`
        const seeded = await page.request.post('/api/e2e/fixtures', {
            data: {
                repos: [{ owner, name: 'app' }],
                scanRuns: [{
                    repositoryOwner: owner,
                    repositoryName: 'app',
                    status: 'completed',
                    logsDropped: 3,
                    logs: [
                        { timestamp: '2026-11-19T10:00:00Z', level: 'warn', message: 'retry 200ms at /root/a' },
                        { timestamp: '2026-11-19T10:00:01Z', level: 'warn', message: 'retry 300ms at /root/b' },
                        { timestamp: '2026-11-19T10:00:02Z', level: 'error', message: 'failed at /app/package.json' },
                    ],
                }],
            },
        })
        expect(seeded.status()).toBe(200)
        const seededBody = await seeded.json() as { scanRuns: { id: string }[] }
        const runId = seededBody.scanRuns[0]!.id

        const grouped = await page.request.get(`/api/v1/runs/${runId}/logs`)
        expect(grouped.status()).toBe(200)
        const groupedBody = await grouped.json() as { view: string, groupCount: number, droppedBefore: number, groups: { level: string, count: number }[] }
        expect(groupedBody.view).toBe('grouped')
        expect(groupedBody.groupCount).toBe(2)
        expect(groupedBody.droppedBefore).toBe(3)
        expect(groupedBody.groups.find((group) => group.level === 'warn')!.count).toBe(2)

        const raw = await page.request.get(`/api/v1/runs/${runId}/logs?view=raw&q=retry&pageSize=1`)
        expect(raw.status()).toBe(200)
        const rawBody = await raw.json() as { view: string, total: number, returned: number, entries: { message: string }[] }
        expect(rawBody.view).toBe('raw')
        expect(rawBody.total).toBe(2)
        expect(rawBody.returned).toBe(1)
        expect(rawBody.entries[0]!.message).toContain('retry')
    })

    test('未知 run id 返回 404', async ({ page }) => {
        const response = await page.request.get('/api/v1/runs/not-a-real-run')
        expect(response.status()).toBe(404)
    })
})
