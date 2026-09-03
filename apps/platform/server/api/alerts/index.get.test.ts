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
            repositoryId: run.repositoryId,
            upstreamId: 'dependabot:1',
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            summary: '原型污染',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.17.21',
            fixStatus: 'pending',
            firstSeenAt: new Date('2026-08-01T00:00:00Z'),
            lastSeenAt: new Date('2026-08-01T00:00:00Z'),
            occurrenceCount: 1,
            supersededAt: null,
            // 依赖类告警携带 GHSA + CVE 标识（reconcile 路径 JSON 序列化 cveIds）
            ghsaId: 'GHSA-p6mc-m468-83gw',
            cveIds: JSON.stringify(['CVE-2021-23337']),
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            repositoryId: run.repositoryId,
            upstreamId: 'code-scanning:1',
            source: 'code-scanning',
            severity: 'low',
            packageName: '',
            manifestPath: null,
            ruleId: 'eol-last',
            summary: '文件末尾缺少换行',
            fixable: true,
            fixStrategy: 'template',
            fixStatus: 'success',
            firstSeenAt: new Date('2026-08-01T00:00:00Z'),
            lastSeenAt: new Date('2026-08-01T00:00:00Z'),
            occurrenceCount: 1,
            supersededAt: null,
            // code-scanning 无 GHSA/CVE 概念，ghsaId/cveIds 留 NULL
            ghsaId: null,
            cveIds: null,
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
                repositoryId: run.repositoryId,
                upstreamId: 'pnpm-audit:1',
                source: 'pnpm-audit',
                severity: 'critical',
                packageName: 'express',
                manifestPath: 'package.json',
                summary: '安全漏洞',
                fixable: true,
                fixStrategy: 'upgrade',
                recommendedVersion: '4.21.0',
                fixStatus: 'pending',
                firstSeenAt: new Date('2026-08-01T00:00:00Z'),
                lastSeenAt: new Date('2026-08-01T00:00:00Z'),
                occurrenceCount: 1,
                supersededAt: null,
                // pnpm-audit 携带 GHSA + CVE（fetcher extractIdentifiers helper 透传字段）
                ghsaId: 'GHSA-rv95-896h-c2vc',
                cveIds: JSON.stringify(['CVE-2024-29041']),
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
                repositoryId: otherRun.repositoryId,
                upstreamId: 'dependabot:101',
                source: 'dependabot',
                severity: 'medium',
                packageName: 'axios',
                manifestPath: 'package.json',
                summary: '跨 repo 测试',
                fixable: true,
                fixStrategy: 'upgrade',
                fixStatus: 'pending',
                firstSeenAt: new Date('2026-08-01T00:00:00Z'),
                lastSeenAt: new Date('2026-08-01T00:00:00Z'),
                occurrenceCount: 1,
                supersededAt: null,
                // 多 CVE 用例（同一 advisory 关联 2 个 CVE）
                ghsaId: 'GHSA-42xw-2xvc-qx8m',
                cveIds: JSON.stringify(['CVE-2023-45857', 'CVE-2024-39338']),
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

    describe('M20.5 supersede 过滤（todo.md §M20.5 默认 supersededAt IS NULL）', () => {
        beforeAll(async () => {
            // 在 demo/app 已有 3 条活跃告警的基础上，
            // 再追加 1 条已 supersede 告警（m20.5 默认过滤场景）+ 1 条已修复告警（决策 1：永不被 supersede）
            const ds = await ensureDatabaseInitialized()
            const run = await ds.getRepository(ScanRun).findOne({ where: { repositoryId } })
            if (!run) {
                throw new Error('missing run')
            }
            // 已 supersede 告警（m20.5 默认过滤应排除）
            await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
                scanRunId: run.id,
                repositoryId: run.repositoryId,
                upstreamId: 'pnpm-audit:superseded-1',
                source: 'pnpm-audit',
                severity: 'low',
                packageName: 'superseded-pkg',
                manifestPath: 'package.json',
                ruleId: null,
                summary: '上游已关闭的告警',
                fixable: false,
                fixStrategy: null,
                recommendedVersion: null,
                htmlUrl: null,
                fixStatus: 'pending',
                firstSeenAt: new Date('2026-08-01T00:00:00Z'),
                lastSeenAt: new Date('2026-08-01T00:00:00Z'),
                occurrenceCount: 1,
                // 关键：supersededAt 非 NULL 标记上游已关闭
                supersededAt: new Date('2026-08-15T00:00:00Z'),
            }))
            // 已修复告警（决策 1：永不被 supersede，supersededAt 必须为 NULL）
            await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
                scanRunId: run.id,
                repositoryId: run.repositoryId,
                upstreamId: 'code-scanning:fixed-1',
                source: 'code-scanning',
                severity: 'medium',
                packageName: 'fixed-pkg',
                manifestPath: 'src/utils/y.ts',
                ruleId: 'js/incomplete-sanitization',
                summary: '已修复的告警',
                fixable: true,
                fixStrategy: 'template',
                recommendedVersion: null,
                htmlUrl: null,
                // 关键：fixStatus='success' 的告警 supersededAt 永远为 NULL（决策 1）
                fixStatus: 'success',
                firstSeenAt: new Date('2026-08-01T00:00:00Z'),
                lastSeenAt: new Date('2026-08-01T00:00:00Z'),
                occurrenceCount: 1,
                supersededAt: null,
            }))
        })

        it('默认 ? 无参数：只返回 supersededAt IS NULL 行（活跃告警）', async () => {
            const list = await call('/api/alerts') as Record<string, unknown>[]
            // 5 条活跃告警（原有 3 + 已修复 1 + 既有重复 lodash 1）
            // 注意：dedupe=true 测试已注释，但 lodash 第二次 INSERT（dependabot:2）仍保留在数据库
            // 总活跃数：demo/app 原有 lodash(1) + code-scanning eol-last(1) + pnpm-audit express(1) + dedupe-test lodash 二次(1) + fixed-pkg(1) = 5
            // other/lib axios(1) = 1 → 总共 6 条活跃
            expect(list.length).toBeGreaterThanOrEqual(5)
            // 验证 superseded-pkg 不在结果中
            const superseded = list.find((a) => a.packageName === 'superseded-pkg')
            expect(superseded).toBeUndefined()
            // 验证 fixed-pkg 在结果中（fixStatus=success 不被 supersede）
            const fixed = list.find((a) => a.packageName === 'fixed-pkg')
            expect(fixed).toBeDefined()
            // 验证 supersededAt 字段在活跃告警上为 null
            for (const row of list) {
                expect(row.supersededAt).toBeNull()
            }
        })

        it('includeSuperseded=false：等价缺省（suppressed 行为）', async () => {
            const list = await call('/api/alerts?includeSuperseded=false') as Record<string, unknown>[]
            const superseded = list.find((a) => a.packageName === 'superseded-pkg')
            expect(superseded).toBeUndefined()
        })

        it('includeSuperseded=true：返回全量（含已关闭告警，前端"显示已解决"开关）', async () => {
            const list = await call('/api/alerts?includeSuperseded=true') as Record<string, unknown>[]
            const superseded = list.find((a) => a.packageName === 'superseded-pkg')
            expect(superseded).toBeDefined()
            // 验证 supersededAt 字段返回 ISO 字符串（非 null）
            expect(typeof superseded?.supersededAt).toBe('string')
            // 验证 fixed-pkg 仍存在
            const fixed = list.find((a) => a.packageName === 'fixed-pkg')
            expect(fixed).toBeDefined()
        })

        it('includeSuperseded 非法值兜底为 false（zod safeParse）', async () => {
            const list = await call('/api/alerts?includeSuperseded=foo') as Record<string, unknown>[]
            const superseded = list.find((a) => a.packageName === 'superseded-pkg')
            expect(superseded).toBeUndefined()
        })

        it('默认响应包含 M20.3 新增字段（upstreamId / occurrenceCount / firstSeenAt / lastSeenAt / supersededAt）', async () => {
            const list = await call('/api/alerts') as Record<string, unknown>[]
            expect(list.length).toBeGreaterThan(0)
            for (const row of list) {
                expect(row).toHaveProperty('upstreamId')
                expect(row).toHaveProperty('occurrenceCount')
                expect(row).toHaveProperty('firstSeenAt')
                expect(row).toHaveProperty('lastSeenAt')
                expect(row).toHaveProperty('supersededAt')
                expect(row.supersededAt).toBeNull()
            }
        })
    })

    describe('M20.5 dedupe 参数移除（向后兼容：dedupe=true 静默忽略）', () => {
        // M20.5 移除 dedupe 参数的处理：
        // - 后端不再处理 dedupe query（应用层指纹聚合已无意义——M20.3 per-alert 模型）
        // - dedupe=true 静默忽略（旧前端的兼容请求，不会 400）
        // - 返回全量活跃告警（不再按 fingerprint 聚合）

        beforeAll(async () => {
            // 在已有的 lodash (dependabot:1) 基础上追加 lodash 第二次插入
            // （M20.3 unique index 强制不同 upstreamId；模拟同 packageName 跨次扫描的"实际业务"）
            const ds = await ensureDatabaseInitialized()
            const run = await ds.getRepository(ScanRun).findOne({ where: { repositoryId } })
            if (!run) {
                throw new Error('missing run')
            }
            await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
                scanRunId: run.id,
                repositoryId: run.repositoryId,
                upstreamId: 'dependabot:dedupe-backward-compat-2',
                source: 'dependabot',
                severity: 'high',
                packageName: 'lodash',
                manifestPath: 'package.json',
                ruleId: null,
                summary: 'M20.5 dedupe=true 静默忽略测试 — 第二次 lodash（依赖 occurrenceCount 区分）',
                fixable: true,
                fixStrategy: 'upgrade',
                recommendedVersion: '4.17.21',
                fixStatus: 'pending',
                firstSeenAt: new Date('2026-08-02T00:00:00Z'),
                lastSeenAt: new Date('2026-08-02T00:00:00Z'),
                occurrenceCount: 1,
                supersededAt: null,
            }))
        })

        it('dedupe=true 静默忽略，返回全量活跃告警（含重复 lodash）', async () => {
            const list = await call('/api/alerts?dedupe=true') as Record<string, unknown>[]
            // M20.3 后每行独立告警：活跃告警中含 lodash 两次（demo/app run 下的不同 upstreamId）
            expect(list.length).toBeGreaterThanOrEqual(5)
            // 验证 lodash 出现 2 次（不同 upstreamId，依赖 occurrenceCount 区分）
            const lodashRows = list.filter((a) => a.packageName === 'lodash')
            expect(lodashRows.length).toBe(2)
            // occurrenceCount 字段存在（来自 ScanResult，不应用层聚合）
            for (const row of lodashRows) {
                expect(row.occurrenceCount).toBe(1)
            }
        })
    })

    describe('ghsaId / cveIds 字段透传（todo.md §M23.3 前端依赖）', () => {
        it('默认响应每行包含 ghsaId 与 cveIds 字段', async () => {
            const list = await call('/api/alerts') as Record<string, unknown>[]
            expect(list.length).toBeGreaterThan(0)
            for (const row of list) {
                expect(row).toHaveProperty('ghsaId')
                expect(row).toHaveProperty('cveIds')
                // cveIds 必须为数组（即使是空：code-scanning 无 CVE 概念）
                expect(Array.isArray(row.cveIds)).toBe(true)
            }
        })

        it('dependabot 告警：ghsaId 非 null + cveIds 反序列化为数组', async () => {
            // 锁定 fixture 中预置 GHSA 的那条 lodash 行（upstreamId='dependabot:1'）：
            // 同 describe 下 M20.5 dedupe beforeAll 另插一条 lodash（无 ghsaId），
            // 跨 worker 还可能被其他测试文件（如 stats.get / runs/[id].get / scan-orchestrator）通过
            // globalThis singleton DataSource 注入更多 lodash；按 upstreamId 精确匹配避免依赖
            // 列表顺序（createdAt DESC 在 SQLite rowid 同毫秒下不稳定，且会被后插入的无 ghsaId 行污染）。
            const list = await call('/api/alerts?source=dependabot') as { packageName: string, upstreamId: string, ghsaId: string | null, cveIds: string[] }[]
            const lodashRow = list.find((a) => a.packageName === 'lodash' && a.upstreamId === 'dependabot:1')
            expect(lodashRow).toBeDefined()
            expect(lodashRow?.ghsaId).toBe('GHSA-p6mc-m468-83gw')
            expect(lodashRow?.cveIds).toEqual(['CVE-2021-23337'])
        })

        it('pnpm-audit 告警：ghsaId 非 null + cveIds 反序列化', async () => {
            const list = await call('/api/alerts?source=pnpm-audit') as { packageName: string, ghsaId: string | null, cveIds: string[] }[]
            const expressRow = list.find((a) => a.packageName === 'express')
            expect(expressRow).toBeDefined()
            expect(expressRow?.ghsaId).toBe('GHSA-rv95-896h-c2vc')
            expect(expressRow?.cveIds).toEqual(['CVE-2024-29041'])
        })

        it('code-scanning 告警：ghsaId=null + cveIds=[]（无 GHSA/CVE 概念）', async () => {
            const list = await call('/api/alerts?source=code-scanning') as { ruleId: string | null, ghsaId: string | null, cveIds: string[] }[]
            const eolRow = list.find((a) => a.ruleId === 'eol-last')
            expect(eolRow).toBeDefined()
            expect(eolRow?.ghsaId).toBeNull()
            expect(eolRow?.cveIds).toEqual([])
        })

        it('多 CVE 数组：同一告警携带 2 个 CVE 全部返回', async () => {
            const list = await call('/api/alerts') as { packageName: string, cveIds: string[] }[]
            const axiosRow = list.find((a) => a.packageName === 'axios')
            expect(axiosRow).toBeDefined()
            expect(axiosRow?.cveIds).toEqual(['CVE-2023-45857', 'CVE-2024-39338'])
        })
    })
})
