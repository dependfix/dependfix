import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../../tests/api-helper'
import healthHandler from './health.get'
import { setSchemaStatus, type SchemaStatus } from '#server/database/schema-drift'

/**
 * GET /api/health 端点单测：
 * 公开只读（不触发鉴权守卫）、返回 version/commit/startedAt/schema、未注入回退 unknown、
 * schema 状态透传启动期检测结果（2026-11-09 存量库缺列事故）。
 */
interface HealthResponse {
    version: string
    commit: string
    startedAt: string
    schema: SchemaStatus
}

const call = () => healthHandler(makeEvent('GET', '/api/health')) as HealthResponse

describe('GET /api/health', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        setSchemaStatus('unknown')
    })

    it('公开只读：返回注入的 version / commit 与 ISO startedAt', () => {
        vi.stubGlobal('useRuntimeConfig', () => ({ buildVersion: '1.2.3', buildCommit: 'abcdef0' }))
        const res = call()
        // 公开契约只允许这四个键（不暴露表 / 列名、数据库路径等明细）
        expect(Object.keys(res).sort()).toEqual(['commit', 'schema', 'startedAt', 'version'])
        expect(res.version).toBe('1.2.3')
        expect(res.commit).toBe('abcdef0')
        expect(new Date(res.startedAt).toString()).not.toBe('Invalid Date')
    })

    it('未注入：回退 unknown（不阻断）', () => {
        vi.stubGlobal('useRuntimeConfig', () => ({}))
        expect(call()).toMatchObject({ version: 'unknown', commit: 'unknown' })
    })

    it('schema 默认 unknown，启动期检测后透传 ok / drift', () => {
        vi.stubGlobal('useRuntimeConfig', () => ({}))
        expect(call().schema).toBe('unknown')
        setSchemaStatus('ok')
        expect(call().schema).toBe('ok')
        setSchemaStatus('drift')
        expect(call().schema).toBe('drift')
    })
})
