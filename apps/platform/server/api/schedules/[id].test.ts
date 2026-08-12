import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import schedulesIdHandler from './[id]'
import schedulesTriggerHandler from './[id]/trigger.post'
import schedulesHandler from './index'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

// 调度服务 mock（真实注册会启动 node-cron / BullMQ scheduler）
const { registerSchedule, unregisterSchedule, triggerSchedule } = vi.hoisted(() => ({
    registerSchedule: vi.fn(),
    unregisterSchedule: vi.fn(),
    triggerSchedule: vi.fn(),
}))
vi.mock('#server/services/scheduler/scheduler.service', () => ({
    registerSchedule,
    unregisterSchedule,
    triggerSchedule,
}))

const callIndex = (method: string, url: string, body?: unknown) => schedulesHandler(makeEvent(method, url, body))
const callId = (method: string, url: string, body?: unknown, params: Record<string, string> = {}) =>
    schedulesIdHandler(makeEvent(method, url, body, {}, params))
const callTrigger = (params: Record<string, string> = {}) =>
    schedulesTriggerHandler(makeEvent('POST', '/api/schedules/x/trigger', undefined, {}, params))

const validBody = {
    name: '每日扫描',
    cron: '0 2 * * *',
    timezone: 'Asia/Shanghai',
    selectorKind: 'all',
    mode: 'fix',
    severityThreshold: 'high',
    enabled: true,
}

describe('GET/PATCH/DELETE /api/schedules/[id] + POST /trigger', () => {
    let id: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await callIndex('POST', '/api/schedules', validBody) as { id: string }
        id = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        registerSchedule.mockReset()
        unregisterSchedule.mockReset()
        triggerSchedule.mockReset()
        registerSchedule.mockResolvedValue(undefined)
        unregisterSchedule.mockResolvedValue(undefined)
        triggerSchedule.mockResolvedValue({ batchRunId: 'batch-triggered' })
    })

    it('returns schedule detail', async () => {
        const detail = await callId('GET', `/api/schedules/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail).toMatchObject({ id, name: '每日扫描', enabled: true })
    })

    it('returns 404 for unknown schedule', async () => {
        await expectError(callId('GET', '/api/schedules/nonexistent', undefined, { id: 'nonexistent' }), 404)
    })

    it('updates schedule and re-registers scheduler bindings', async () => {
        const result = await callId('PATCH', `/api/schedules/${id}`, { name: '改名', cron: '0 3 * * *' }, { id }) as Record<string, unknown>
        expect(result).toMatchObject({ name: '改名', cron: '0 3 * * *' })
        expect(unregisterSchedule).toHaveBeenCalledWith(id)
        expect(registerSchedule).toHaveBeenCalledOnce()
    })

    it('unregisters without re-registering when disabled', async () => {
        await callId('PATCH', `/api/schedules/${id}`, { enabled: false }, { id })
        expect(unregisterSchedule).toHaveBeenCalledWith(id)
        expect(registerSchedule).not.toHaveBeenCalled()
    })

    it('deletes schedule and unregisters', async () => {
        const result = await callId('DELETE', `/api/schedules/${id}`, undefined, { id }) as { deleted: boolean }
        expect(result).toEqual({ id, deleted: true })
        expect(unregisterSchedule).toHaveBeenCalledWith(id)
        await expectError(callId('GET', `/api/schedules/${id}`, undefined, { id }), 404)
    })

    it('rejects invalid body with 400', async () => {
        await expectError(callId('PATCH', `/api/schedules/${id}`, { cron: 123 }, { id }), 400)
    })

    it('rejects unsupported method with 405', async () => {
        await expectError(callId('POST', `/api/schedules/${id}`, undefined, { id }), 405)
    })

    it('triggers schedule manually', async () => {
        // delete 用例已删除原计划，重新创建
        const created = await callIndex('POST', '/api/schedules', validBody) as { id: string }
        const result = await callTrigger({ id: created.id }) as unknown as Record<string, unknown>
        expect(result).toEqual({ batchRunId: 'batch-triggered' })
        expect(triggerSchedule).toHaveBeenCalledWith(created.id)
    })

    it('trigger returns 404 for unknown schedule', async () => {
        await expectError(callTrigger({ id: 'nonexistent' }), 404)
    })
})
