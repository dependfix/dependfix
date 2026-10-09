import 'reflect-metadata'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../../../tests/api-helper'
import monitorStatusHandler from './monitor-status.get'
import { requireRole } from '#server/utils/guard'

vi.mock('#server/utils/guard', () => ({
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = () => monitorStatusHandler(makeEvent('GET', '/api/schedules/monitor-status'))

describe('GET /api/schedules/monitor-status', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('以 admin/org_admin 门控（写法与同族 schedules 端点一致）', async () => {
        await call()
        expect(requireRole).toHaveBeenCalledWith(expect.anything(), ['admin', 'org_admin'])
    })

    it('未启用时返回 false（默认）', async () => {
        vi.stubEnv('ACTION_STATUS_MONITOR_ENABLED', 'false')
        expect(await call()).toEqual({ actionStatusMonitorEnabled: false })
    })

    it('ACTION_STATUS_MONITOR_ENABLED=true 时返回 true', async () => {
        vi.stubEnv('ACTION_STATUS_MONITOR_ENABLED', 'true')
        expect(await call()).toEqual({ actionStatusMonitorEnabled: true })
    })

    it('非 "true" 值（如 1）视为未启用', async () => {
        vi.stubEnv('ACTION_STATUS_MONITOR_ENABLED', '1')
        expect(await call()).toEqual({ actionStatusMonitorEnabled: false })
    })
})
