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

    test('未知 run id 返回 404', async ({ page }) => {
        const response = await page.request.get('/api/v1/runs/not-a-real-run')
        expect(response.status()).toBe(404)
    })
})
