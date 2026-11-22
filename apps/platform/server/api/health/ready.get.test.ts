import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../../../tests/api-helper'

/**
 * GET /api/health/ready 端点单测：
 * ready → 200 `{ status, schema }`；not_ready → 503（正文仍不含数据库明细）。
 */
const { toReadinessViewMock } = vi.hoisted(() => ({ toReadinessViewMock: vi.fn() }))

vi.mock('#server/services/view/readiness', () => ({
    toReadinessView: toReadinessViewMock,
}))

import readyHandler from './ready.get'

const call = async (): Promise<{ status: number, body: unknown }> => {
    const event = makeEvent('GET', '/api/health/ready')
    const body = await readyHandler(event)
    return { status: event.node.res.statusCode, body }
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('GET /api/health/ready', () => {
    it('ready → 200，正文只含 status 与 schema', async () => {
        toReadinessViewMock.mockResolvedValue({ status: 'ready', schema: 'ok' })
        const { status, body } = await call()
        expect(status).toBe(200)
        expect(body).toEqual({ status: 'ready', schema: 'ok' })
    })

    it('not_ready → 503（编排器与 uptime 只看状态码）', async () => {
        toReadinessViewMock.mockResolvedValue({ status: 'not_ready', schema: 'unknown' })
        const { status, body } = await call()
        expect(status).toBe(503)
        expect(body).toEqual({ status: 'not_ready', schema: 'unknown' })
    })
})
