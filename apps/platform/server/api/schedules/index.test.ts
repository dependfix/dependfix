import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import schedulesHandler from './index'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

// 调度服务 mock（真实注册会启动 node-cron / BullMQ scheduler）
const { registerSchedule } = vi.hoisted(() => ({ registerSchedule: vi.fn() }))
vi.mock('#server/services/scheduler/scheduler.service', () => ({
    registerSchedule,
    unregisterSchedule: vi.fn(),
    triggerSchedule: vi.fn(),
}))

const call = (method: string, url: string, body?: unknown) => schedulesHandler(makeEvent(method, url, body))

const validBody = {
    name: '每日扫描',
    cron: '0 2 * * *',
    timezone: 'Asia/Shanghai',
    selectorKind: 'all',
    mode: 'fix',
    severityThreshold: 'high',
    enabled: true,
}

describe('GET/POST /api/schedules', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        registerSchedule.mockReset()
        registerSchedule.mockResolvedValue(undefined)
    })

    it('returns empty list on fresh database', async () => {
        expect(await call('GET', '/api/schedules')).toEqual([])
    })

    it('creates enabled schedule and registers it with scheduler service', async () => {
        const created = await call('POST', '/api/schedules', validBody) as Record<string, unknown>
        expect(created).toMatchObject({ name: '每日扫描', cron: '0 2 * * *', enabled: true, selectorKind: 'all' })
        expect(registerSchedule).toHaveBeenCalledOnce()

        const list = await call('GET', '/api/schedules') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
    })

    it('does not register disabled schedule', async () => {
        await call('POST', '/api/schedules', { ...validBody, name: '停用计划', enabled: false })
        expect(registerSchedule).not.toHaveBeenCalled()
    })

    it('rejects invalid cron expression with 400', async () => {
        await expectError(call('POST', '/api/schedules', { ...validBody, cron: 'not-a-cron' }), 400)
    })

    it('rejects unsupported method with 405', async () => {
        await expectError(call('PATCH', '/api/schedules'), 405)
    })
})
