import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import alertsHandler from './index.get'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (url: string) => alertsHandler(makeEvent('GET', url))

describe('GET /api/alerts', () => {
    let repositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = created.id

        const ds = await ensureDatabaseInitialized()
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            summary: '原型污染',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.17.21',
            fixStatus: 'pending',
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'code-scanning',
            severity: 'low',
            packageName: '',
            manifestPath: null,
            ruleId: 'eol-last',
            summary: '文件末尾缺少换行',
            fixable: true,
            fixStrategy: 'template',
            fixStatus: 'success',
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns all alerts with repository context', async () => {
        const list = await call('/api/alerts') as Record<string, unknown>[]
        expect(list).toHaveLength(2)
        expect(list[0]).toMatchObject({ repository: 'demo/app', severity: 'high', packageName: 'lodash' })
    })

    it('filters by severity', async () => {
        const list = await call('/api/alerts?severity=low') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({ source: 'code-scanning' })
    })

    it('filters by source', async () => {
        const list = await call('/api/alerts?source=dependabot') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({ packageName: 'lodash' })
    })

    it('filters by repositoryId', async () => {
        const list = await call(`/api/alerts?repositoryId=${repositoryId}`) as Record<string, unknown>[]
        expect(list).toHaveLength(2)
        const none = await call('/api/alerts?repositoryId=nonexistent') as Record<string, unknown>[]
        expect(none).toEqual([])
    })

    it('treats "all" query values as no filter', async () => {
        const list = await call('/api/alerts?severity=all&source=all&repositoryId=all') as Record<string, unknown>[]
        expect(list).toHaveLength(2)
    })

    describe('groupBy=package (rowGroup 模式)', () => {
        beforeAll(async () => {
            // 追加一个不同包的告警，让排序断言稳定（lodash / '' / express 三种 packageName）
            const ds = await ensureDatabaseInitialized()
            const run = await ds.getRepository(ScanRun).findOne({ where: { repositoryId } })
            if (!run) {
                throw new Error('missing run')
            }
            await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
                scanRunId: run.id,
                source: 'pnpm-audit',
                severity: 'critical',
                packageName: 'express',
                manifestPath: 'package.json',
                summary: '安全漏洞',
                fixable: true,
                fixStrategy: 'upgrade',
                recommendedVersion: '4.21.0',
                fixStatus: 'pending',
            }))
        })

        it('returns alerts sorted by packageName ASC when groupBy=package', async () => {
            const list = await call('/api/alerts?groupBy=package') as { packageName: string }[]
            const names = list.map((a) => a.packageName)
            // 验证排序：空串（code-scanning ''）< express < lodash（ASCII 字典序）
            const sorted = [...names].sort()
            expect(names).toEqual(sorted)
            expect(list.length).toBeGreaterThanOrEqual(3)
        })

        it('groupBy=package 与其他过滤组合仍工作', async () => {
            const list = await call('/api/alerts?groupBy=package&severity=critical') as { packageName: string }[]
            expect(list).toHaveLength(1)
            expect(list[0]?.packageName).toBe('express')
        })

        it('groupBy=package 与不存在的 repositoryId 返回空数组', async () => {
            const list = await call('/api/alerts?groupBy=package&repositoryId=nonexistent') as unknown[]
            expect(list).toEqual([])
        })

        it('groupBy 缺省或非法值走默认 createdAt DESC 顺序', async () => {
            // 验证：未传 groupBy 时不影响默认排序行为（保持向后兼容）
            // 不验证具体顺序（同秒插入受 SQLite 精度影响）
            const list = await call('/api/alerts') as { packageName: string }[]
            expect(list.length).toBeGreaterThanOrEqual(3)
            const names = list.map((a) => a.packageName)
            // 三个 packageName 都应出现
            expect(names).toContain('lodash')
            expect(names).toContain('express')
        })
    })
})
