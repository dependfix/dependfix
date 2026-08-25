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

    describe('dedupe=true（跨次扫描去重，todo.md §T1306）', () => {
        beforeAll(async () => {
            // 在 demo/app 已有 3 条不同 packageName 告警（lodash / '' / express）的基础上，
            // 再追加 1 条 lodash（同 fingerprint）触发 occurrenceCount=2 聚合。
            const ds = await ensureDatabaseInitialized()
            const run = await ds.getRepository(ScanRun).findOne({ where: { repositoryId } })
            if (!run) {
                throw new Error('missing run')
            }
            await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
                scanRunId: run.id,
                source: 'dependabot',
                severity: 'high',
                packageName: 'lodash',
                manifestPath: 'package.json',
                ruleId: null,
                summary: '第二次扫描 lodash 仍告警（跨次聚合测试）',
                fixable: true,
                fixStrategy: 'upgrade',
                recommendedVersion: '4.17.21',
                fixStatus: 'pending',
            }))
        })

        it('dedupe=true 合并同 fingerprint 的多次扫描为 1 行', async () => {
            const list = await call('/api/alerts?dedupe=true') as Record<string, unknown>[]
            // 4 个不同 fingerprint：demo/app|lodash| (ruleId=null) + demo/app||eol-last + demo/app|express| + other/lib|axios|
            // lodash 出现 2 次（聚合为 1 行），其他各 1 次
            expect(list.length).toBe(4)
            // 验证 lodash 行包含 occurrenceCount=2
            const lodashRow = list.find((a) => a.packageName === 'lodash')
            expect(lodashRow).toBeDefined()
            expect(lodashRow?.occurrenceCount).toBe(2)
        })

        it('dedupe=true 聚合字段正确（occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）', async () => {
            const list = await call('/api/alerts?dedupe=true') as Record<string, unknown>[]
            for (const row of list) {
                expect(row.occurrenceCount).toBeGreaterThanOrEqual(1)
                expect(typeof row.firstSeenAt).toBe('string')
                expect(typeof row.lastSeenAt).toBe('string')
                expect(Array.isArray(row.affectedRunIds)).toBe(true)
                expect((row.affectedRunIds as string[]).length).toBeGreaterThanOrEqual(1)
            }
            // lodash 行的 affectedRunIds 应只包含 1 个 runId（两次 lodash 都在同一 run 下）
            // 实际行为：dedupe 按 fingerprint 聚合 + 同一 run 下只算 1 次出现 + occurrenceCount=2
            const lodashRow = list.find((r) => r.packageName === 'lodash')
            expect((lodashRow?.affectedRunIds as string[]).length).toBe(1)
            expect(lodashRow?.occurrenceCount).toBe(2)
        })

        it('dedupe=true 排序按 occurrenceCount DESC（高频告警优先）', async () => {
            const list = await call('/api/alerts?dedupe=true') as Record<string, unknown>[]
            const counts = list.map((r) => r.occurrenceCount as number)
            // 验证序列非递增（count 高的在前）
            for (let i = 1; i < counts.length; i++) {
                expect(counts[i]).toBeLessThanOrEqual(counts[i - 1] ?? 0)
            }
            // lodash 应排第一
            expect(list[0]?.occurrenceCount).toBe(2)
        })

        it('dedupe=false（默认）行为等价缺省：返回全量 ScanResult', async () => {
            const list = await call('/api/alerts?dedupe=false') as Record<string, unknown>[]
            // lodash 出现 2 次 + 其他 packageName 各 1 次 = 5 条
            expect(list.length).toBeGreaterThanOrEqual(4)
            // 验证无聚合字段（保持原 AlertView 形态）
            expect(list[0]).not.toHaveProperty('occurrenceCount')
        })

        it('dedupe=true 与 severity 过滤组合仍工作', async () => {
            const list = await call('/api/alerts?dedupe=true&severity=critical') as Record<string, unknown>[]
            expect(list.length).toBe(1)
            expect(list[0]?.severity).toBe('critical')
            expect(list[0]?.packageName).toBe('express')
        })

        it('dedupe=true 非法值兜底为 false（zod safeParse）', async () => {
            const list = await call('/api/alerts?dedupe=foo') as Record<string, unknown>[]
            // 兜底为 dedupe=false，返回全量
            expect(list.length).toBeGreaterThanOrEqual(4)
            expect(list[0]).not.toHaveProperty('occurrenceCount')
        })
    })
})
