import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../../tests/api-helper'
import healthHandler from './health.get'

/**
 * GET /api/health 端点单测（任务登记见 docs/plan/todo.md §M40.1）：
 * 公开只读（不触发鉴权守卫）、返回 version/commit/startedAt、未注入回退 unknown。
 */
interface HealthResponse {
    version: string
    commit: string
    startedAt: string
}

const call = () => healthHandler(makeEvent('GET', '/api/health')) as HealthResponse

describe('GET /api/health', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('公开只读：返回注入的 version / commit 与 ISO startedAt', () => {
        vi.stubGlobal('useRuntimeConfig', () => ({ buildVersion: '1.2.3', buildCommit: 'abcdef0' }))
        const res = call()
        expect(res.version).toBe('1.2.3')
        expect(res.commit).toBe('abcdef0')
        expect(new Date(res.startedAt).toString()).not.toBe('Invalid Date')
    })

    it('未注入：回退 unknown（不阻断）', () => {
        vi.stubGlobal('useRuntimeConfig', () => ({}))
        expect(call()).toMatchObject({ version: 'unknown', commit: 'unknown' })
    })
})
