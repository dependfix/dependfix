import { expect, test } from '@playwright/test'
import { authedCookieHeader } from './helpers/auth-cookie.helper'

/**
 * 定时计划 CRUD + 触发 e2e（docs/plan/todo.md §M21.5 T704 async 真实环境验证）：
 * - e2e 强制 sync 降级（playwright.config.ts:36 NUXT_QUEUE_ENABLED=false），本批次覆盖 CRUD 端到端 + 手动触发验证 BatchRun 创建
 * - BullMQ 短间隔集成测试见 apps/platform/server/services/scheduler/scheduler.integration.test.ts（vitest describe.skipIf(!redisAvailable) 模式）
 *
 * 不覆盖：cron 表达式语法验证（vitest 单测覆盖）；UI 表单交互（schedules.e2e.test.ts 已覆盖 C65-C1/C65-C2）；BullMQ upsertJobScheduler async 触发（依赖 Redis，不在 e2e 范围）
 *
 * 实现要点：test fixture 的 `request` 不自动附加 storageState cookies（APIRequestContext 与 browser context 分离），
 * 沿用现有 e2e 模式（credentials-api.e2e.test.ts / repos-api.e2e.test.ts）用 `page.context().request` + authedCookieHeader
 * helper 显式拼接 cookie header + origin（HTTP 下 better-auth __Secure- cookie 不自动发送）。
 */

test.use({ storageState: 'tests/e2e/.auth/admin.json' })

test.describe('定时计划 CRUD + 触发（docs/plan/todo.md §M21.5 T704 async 真实环境验证）', () => {
    // 随机 id 幂等（避免 e2e 并发 / 重跑冲突）
    const uniqueName = (suffix: string) => `e2e-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    /** 用 page.context().request + admin cookie 构造 API 调用 */
    const apiPost = async (page: import('@playwright/test').Page, path: string, data: unknown) => {
        const cookies = await authedCookieHeader(page)
        return page.context().request.post(path, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data,
        })
    }
    const apiGet = async (page: import('@playwright/test').Page, path: string) => {
        const cookies = await authedCookieHeader(page)
        return page.context().request.get(path, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
    }
    const apiPatch = async (page: import('@playwright/test').Page, path: string, data: unknown) => {
        const cookies = await authedCookieHeader(page)
        return page.context().request.patch(path, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
            data,
        })
    }
    const apiDelete = async (page: import('@playwright/test').Page, path: string) => {
        const cookies = await authedCookieHeader(page)
        return page.context().request.delete(path, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
    }

    test('POST /api/schedules 创建 schedule → 200 + 返回完整字段', async ({ page }) => {
        const name = uniqueName('create')
        const response = await apiPost(page, '/api/schedules', {
            name,
            cron: '0 2 * * 1',
            timezone: 'Asia/Shanghai',
            selectorKind: 'all',
            mode: 'report-only',
            severityThreshold: 'high',
            enabled: true,
        })
        expect(response.status()).toBe(200)
        const body = await response.json()
        expect(body.name).toBe(name)
        expect(body.cron).toBe('0 2 * * 1')
        expect(body.timezone).toBe('Asia/Shanghai')
        expect(body.selectorKind).toBe('all')
        expect(body.severityThreshold).toBe('high')
        expect(body.enabled).toBe(true)
        expect(body.id).toBeTruthy()
        expect(body.lastTriggeredAt).toBeNull()
        expect(body.lastBatchRunId).toBeNull()
        // cleanup
        await apiDelete(page, `/api/schedules/${body.id}`)
    })

    test('GET /api/schedules 列表含新建 schedule（顺序 createdAt DESC）', async ({ page }) => {
        const name = uniqueName('list')
        const create = await apiPost(page, '/api/schedules', {
            name,
            cron: '0 3 * * 2',
            selectorKind: 'all',
            mode: 'report-only',
            severityThreshold: 'high',
            enabled: true,
        })
        const created = await create.json()

        const list = await apiGet(page, '/api/schedules')
        expect(list.status()).toBe(200)
        const items = await list.json()
        expect(Array.isArray(items)).toBe(true)
        const names = (items as { name: string }[]).map((s) => s.name)
        expect(names).toContain(name)
        // createdAt DESC 顺序：新建的应该在最前
        const firstItem = (items as { name: string }[])[0]
        expect(firstItem?.name).toBe(name)

        await apiDelete(page, `/api/schedules/${created.id}`)
    })

    test('GET /api/schedules/[id] 详情含正确字段', async ({ page }) => {
        const name = uniqueName('detail')
        const create = await apiPost(page, '/api/schedules', {
            name,
            cron: '0 4 * * 3',
            timezone: 'Asia/Tokyo',
            selectorKind: 'all',
            mode: 'report-only',
            severityThreshold: 'medium',
            enabled: true,
        })
        const created = await create.json()

        const detail = await apiGet(page, `/api/schedules/${created.id}`)
        expect(detail.status()).toBe(200)
        const body = await detail.json()
        expect(body.id).toBe(created.id)
        expect(body.name).toBe(name)
        expect(body.cron).toBe('0 4 * * 3')
        expect(body.timezone).toBe('Asia/Tokyo')
        expect(body.severityThreshold).toBe('medium')
        expect(body.createdAt).toBeTruthy()
        expect(body.updatedAt).toBeTruthy()

        await apiDelete(page, `/api/schedules/${created.id}`)
    })

    test('PATCH /api/schedules/[id] 更新 name + cron + enabled 后立即生效', async ({ page }) => {
        const name = uniqueName('patch')
        const create = await apiPost(page, '/api/schedules', {
            name,
            cron: '0 5 * * 4',
            selectorKind: 'all',
            mode: 'report-only',
            severityThreshold: 'high',
            enabled: true,
        })
        const created = await create.json()

        const newName = `${name}-updated`
        const patch = await apiPatch(page, `/api/schedules/${created.id}`, {
            name: newName,
            cron: '0 6 * * 5',
            enabled: false,
        })
        expect(patch.status()).toBe(200)
        const patched = await patch.json()
        expect(patched.name).toBe(newName)
        expect(patched.cron).toBe('0 6 * * 5')
        expect(patched.enabled).toBe(false)

        // 详情也确认更新
        const detail = await apiGet(page, `/api/schedules/${created.id}`)
        const detailBody = await detail.json()
        expect(detailBody.name).toBe(newName)
        expect(detailBody.cron).toBe('0 6 * * 5')
        expect(detailBody.enabled).toBe(false)

        await apiDelete(page, `/api/schedules/${created.id}`)
    })

    test('DELETE /api/schedules/[id] 后列表不含 + 二次 DELETE 404', async ({ page }) => {
        const name = uniqueName('delete')
        const create = await apiPost(page, '/api/schedules', {
            name,
            cron: '0 7 * * 6',
            selectorKind: 'all',
            mode: 'report-only',
            severityThreshold: 'high',
            enabled: true,
        })
        const created = await create.json()

        const del = await apiDelete(page, `/api/schedules/${created.id}`)
        expect(del.status()).toBe(200)
        const delBody = await del.json()
        expect(delBody.deleted).toBe(true)

        // 二次 DELETE 返回 404
        const del2 = await apiDelete(page, `/api/schedules/${created.id}`)
        expect(del2.status()).toBe(404)

        // 列表不含已删除 id
        const list = await apiGet(page, '/api/schedules')
        const items = await list.json()
        const ids = (items as { id: string }[]).map((s) => s.id)
        expect(ids).not.toContain(created.id)
    })

    test('POST /api/schedules/[id]/trigger 手动触发 → 创建 BatchRun + lastTriggeredAt 回填', async ({ page }) => {
        const name = uniqueName('trigger')
        const create = await apiPost(page, '/api/schedules', {
            name,
            cron: '0 0 1 * *', // 每月 1 日 0:00（任意 cron 即可，不影响 trigger）
            selectorKind: 'all',
            mode: 'report-only',
            severityThreshold: 'high',
            enabled: true,
        })
        const created = await create.json()

        const cookies = await authedCookieHeader(page)
        const trigger = await page.context().request.post(`/api/schedules/${created.id}/trigger`, {
            headers: { cookie: cookies, origin: 'http://127.0.0.1:3101' },
        })
        expect(trigger.status()).toBe(200)
        const triggerBody = await trigger.json()
        expect(triggerBody.batchRunId).toBeTruthy()
        expect(typeof triggerBody.repositoryCount).toBe('number')
        expect(triggerBody.repositoryCount).toBeGreaterThanOrEqual(0)

        // 详情 lastTriggeredAt + lastBatchRunId 回填
        const detail = await apiGet(page, `/api/schedules/${created.id}`)
        const detailBody = await detail.json()
        expect(detailBody.lastBatchRunId).toBe(triggerBody.batchRunId)
        expect(detailBody.lastTriggeredAt).toBeTruthy()
        // 触发时间应 < 1 分钟前（e2e 同步执行，触发应立即完成）
        expect(new Date(detailBody.lastTriggeredAt).getTime()).toBeGreaterThan(Date.now() - 60_000)

        await apiDelete(page, `/api/schedules/${created.id}`)
    })
})
