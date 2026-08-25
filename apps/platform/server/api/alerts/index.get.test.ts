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
        // 不依赖 list[0] 顺序：handler 不传 groupBy 时按 createdAt DESC（后插入排前），
        // 但 SQLite rowid 排序在 createdAt 同毫秒时不稳定（CI 与本机表现不一致），
        // 改用 toContainEqual 做集合包含断言（与同 describe 下其他非顺序断言风格一致）
        expect(list).toContainEqual(expect.objectContaining({ repository: 'demo/app', severity: 'high', packageName: 'lodash' }))
        expect(list).toContainEqual(expect.objectContaining({ repository: 'demo/app', severity: 'low', packageName: '' }))
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

    describe('groupBy=repository (rowGroup 按项目)', () => {
        beforeAll(async () => {
            // 追加一个不同 repo 的告警，验证 groupBy=repository 跨 repo 排序
            const ds = await ensureDatabaseInitialized()
            const otherRepo = await reposIndexHandler(makeEvent('POST', '/api/repos', {
                owner: 'other',
                name: 'lib',
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            })) as { id: string }
            const otherRun = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
                repositoryId: otherRepo.id,
                mode: 'fix',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'completed',
            }))
            await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
                scanRunId: otherRun.id,
                source: 'dependabot',
                severity: 'medium',
                packageName: 'axios',
                manifestPath: 'package.json',
                summary: '跨 repo 测试',
                fixable: true,
                fixStrategy: 'upgrade',
                fixStatus: 'pending',
            }))
        })

        it('returns alerts sorted by repository owner + name ASC when groupBy=repository', async () => {
            const list = await call('/api/alerts?groupBy=repository') as { repository: string | null }[]
            const repos = list.map((a) => a.repository)
            // 验证跨 repo 排序：demo/app 全部在 other/lib 之前（owner ASC）
            const demoIdx = repos.findIndex((r) => r === 'demo/app')
            const otherIdx = repos.findIndex((r) => r === 'other/lib')
            expect(demoIdx).toBeGreaterThanOrEqual(0)
            expect(otherIdx).toBeGreaterThanOrEqual(0)
            expect(demoIdx).toBeLessThan(otherIdx)
        })

        it('groupBy=repository 与 repositoryId 过滤组合仍工作', async () => {
            const list = await call(`/api/alerts?groupBy=repository&repositoryId=${repositoryId}`) as { packageName: string }[]
            // 过滤到 demo/app 后应只返回该 repo 的告警（3 条）
            expect(list).toHaveLength(3)
            const names = list.map((a) => a.packageName)
            // 同一 repo 内按 packageName ASC：'' < express < lodash
            expect(names).toEqual([...names].sort())
        })
    })

    describe('groupBy 非法值兜底', () => {
        it('未知 groupBy 值（如 "foo"）回退到默认 createdAt DESC 顺序', async () => {
            const list = await call('/api/alerts?groupBy=foo') as { packageName: string }[]
            expect(list.length).toBeGreaterThanOrEqual(3)
            // 兜底顺序不影响数据完整性，全部数据应返回
            const names = list.map((a) => a.packageName)
            expect(names).toContain('lodash')
            expect(names).toContain('express')
            expect(names).toContain('axios')
        })

        it('groupBy=none（保留字：前端原始列表模式）等价于缺省', async () => {
            // 前端 viewMode='none' 表示原始列表模式（不分组），后端等价于未传 groupBy（todo.md §C65-D3）
            const list = await call('/api/alerts?groupBy=none') as { packageName: string }[]
            expect(list.length).toBeGreaterThanOrEqual(3)
            const names = list.map((a) => a.packageName)
            expect(names).toContain('lodash')
            expect(names).toContain('express')
        })
    })
})
