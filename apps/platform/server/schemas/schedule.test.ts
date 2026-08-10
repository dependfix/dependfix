import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest'
import { DataSource } from 'typeorm'
import BetterSqlite3 from 'better-sqlite3'
import { batchScanSchema, cronIsValid, isValidTimezone, scheduleSchema, scheduleUpdateSchema } from './schedule'
import { parseTags, Repository } from '#server/entities/repository'
import { Schedule } from '#server/entities/schedule'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { Organization } from '#server/entities/organization'
import { Credential } from '#server/entities/credential'
import { SnakeCaseNamingStrategy } from '#server/database/naming-strategy'

describe('cronIsValid', () => {
    it('合法 5 段表达式（分 时 日 月 周）', () => {
        expect(cronIsValid('0 2 * * 1')).toBe(true)
        expect(cronIsValid('*/5 * * * *')).toBe(true)
        expect(cronIsValid('0 0 * * 0')).toBe(true)
        expect(cronIsValid(' */10 * * * * ')).toBe(true)
    })

    it('合法 6 段表达式（秒 分 时 日 月 周）', () => {
        expect(cronIsValid('0 0 2 * * 1')).toBe(true)
        expect(cronIsValid('0 0 0 1 1 *')).toBe(true)
    })

    it('非法表达式：字段数不足/过多/非数字', () => {
        expect(cronIsValid('* * *')).toBe(false)
        expect(cronIsValid('0 2 * * * * *')).toBe(false)
        expect(cronIsValid('abc')).toBe(false)
        expect(cronIsValid('')).toBe(false)
        expect(cronIsValid('   ')).toBe(false)
    })
})

describe('isValidTimezone', () => {
    it('空值合法（服务器本地时区语义）', () => {
        expect(isValidTimezone(undefined)).toBe(true)
        expect(isValidTimezone(null)).toBe(true)
        expect(isValidTimezone('')).toBe(true)
    })

    it('IANA 名称合法', () => {
        expect(isValidTimezone('Asia/Shanghai')).toBe(true)
        expect(isValidTimezone('UTC')).toBe(true)
    })

    it('非 IANA 名称非法', () => {
        expect(isValidTimezone('Not/AZone')).toBe(false)
        expect(isValidTimezone('GMT+8')).toBe(false)
    })
})

describe('scheduleSchema', () => {
    const validBase = {
        name: '每周一凌晨扫描',
        cron: '0 2 * * 1',
        selectorKind: 'all' as const,
    }

    it('必填校验与默认值', () => {
        expect(scheduleSchema.safeParse({}).success).toBe(false)
        const ok = scheduleSchema.safeParse(validBase)
        expect(ok.success).toBe(true)
        if (ok.success) {
            expect(ok.data.mode).toBe('report-only')
            expect(ok.data.severityThreshold).toBe('high')
            expect(ok.data.enabled).toBe(true)
        }
    })

    it('name/cron 边界校验', () => {
        expect(scheduleSchema.safeParse({ ...validBase, name: '' }).success).toBe(false)
        expect(scheduleSchema.safeParse({ ...validBase, cron: '* * *' }).success).toBe(false)
    })

    it('selectorKind=all 不需要 selectorJson', () => {
        expect(scheduleSchema.safeParse(validBase).success).toBe(true)
        expect(scheduleSchema.safeParse({ ...validBase, selectorJson: '{}' }).success).toBe(true)
    })

    it('selectorKind=organization 需要 organizationId', () => {
        expect(scheduleSchema.safeParse({ ...validBase, selectorKind: 'organization' }).success).toBe(false)
        expect(scheduleSchema.safeParse({
            ...validBase,
            selectorKind: 'organization',
            selectorJson: JSON.stringify({ organizationId: 'org-1' }),
        }).success).toBe(true)
    })

    it('selectorKind=tag 需要 tag', () => {
        expect(scheduleSchema.safeParse({ ...validBase, selectorKind: 'tag' }).success).toBe(false)
        expect(scheduleSchema.safeParse({
            ...validBase,
            selectorKind: 'tag',
            selectorJson: JSON.stringify({ tag: 'frontend' }),
        }).success).toBe(true)
    })

    it('selectorKind=explicit 需要非空 repositoryIds（≤ 100）', () => {
        expect(scheduleSchema.safeParse({ ...validBase, selectorKind: 'explicit' }).success).toBe(false)
        expect(scheduleSchema.safeParse({
            ...validBase,
            selectorKind: 'explicit',
            selectorJson: JSON.stringify({ repositoryIds: [] }),
        }).success).toBe(false)
        expect(scheduleSchema.safeParse({
            ...validBase,
            selectorKind: 'explicit',
            selectorJson: JSON.stringify({ repositoryIds: ['r1', 'r2'] }),
        }).success).toBe(true)
        const many = Array.from({ length: 101 }, (_, i) => `r${i}`)
        expect(scheduleSchema.safeParse({
            ...validBase,
            selectorKind: 'explicit',
            selectorJson: JSON.stringify({ repositoryIds: many }),
        }).success).toBe(false)
        // 元素必须是非空字符串（≤ 36 字符）
        expect(scheduleSchema.safeParse({
            ...validBase,
            selectorKind: 'explicit',
            selectorJson: JSON.stringify({ repositoryIds: [123] }),
        }).success).toBe(false)
        expect(scheduleSchema.safeParse({
            ...validBase,
            selectorKind: 'explicit',
            selectorJson: JSON.stringify({ repositoryIds: ['x'.repeat(37)] }),
        }).success).toBe(false)
    })

    it('selectorJson 非 JSON 字符串非法', () => {
        expect(scheduleSchema.safeParse({ ...validBase, selectorKind: 'tag', selectorJson: 'not-json' }).success).toBe(false)
    })

    it('时区非法校验', () => {
        expect(scheduleSchema.safeParse({ ...validBase, timezone: 'Not/AZone' }).success).toBe(false)
        expect(scheduleSchema.safeParse({ ...validBase, timezone: 'Asia/Shanghai' }).success).toBe(true)
    })
})

describe('scheduleUpdateSchema', () => {
    it('空对象合法（部分更新）', () => {
        expect(scheduleUpdateSchema.safeParse({}).success).toBe(true)
        expect(scheduleUpdateSchema.safeParse({ enabled: false }).success).toBe(true)
    })

    it('部分更新不触发 default 覆盖：未传字段保持 undefined（存量语义）', () => {
        // 关键回归断言：PATCH 只改 name，mode/severityThreshold/enabled 必须不在输出中
        // （否则 [id].ts 的 ?? found 兜底会恒取默认值，禁用计划被意外重新启用）
        const parsed = scheduleUpdateSchema.safeParse({ name: 'x' })
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(parsed.data.mode).toBeUndefined()
            expect(parsed.data.severityThreshold).toBeUndefined()
            expect(parsed.data.enabled).toBeUndefined()
        }
        const withEnabled = scheduleUpdateSchema.safeParse({ enabled: false })
        if (withEnabled.success) {
            expect(withEnabled.data.mode).toBeUndefined()
            expect(withEnabled.data.enabled).toBe(false)
        }
    })

    it('交叉校验仅当 selectorKind 随本次请求出现时生效', () => {
        // 只改 cron，不涉及 selectorKind → 不触发交叉校验
        expect(scheduleUpdateSchema.safeParse({ cron: '0 3 * * 2' }).success).toBe(true)
        // 改了 selectorKind 但缺 selectorJson 参数 → 交叉校验生效
        expect(scheduleUpdateSchema.safeParse({ selectorKind: 'tag' }).success).toBe(false)
        expect(scheduleUpdateSchema.safeParse({
            selectorKind: 'tag',
            selectorJson: JSON.stringify({ tag: 'frontend' }),
        }).success).toBe(true)
    })

    it('timezone null 合法（清空时区 → 服务器本地）', () => {
        expect(scheduleUpdateSchema.safeParse({ timezone: null }).success).toBe(true)
        expect(scheduleUpdateSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false)
        // 空串在 schema 层合法（服务器本地语义），归一化为 null 由 API 映射层负责
        expect(scheduleUpdateSchema.safeParse({ timezone: '' }).success).toBe(true)
    })

    it('selectorJson null 合法（清空参数，仅对 all 策略有意义）', () => {
        expect(scheduleUpdateSchema.safeParse({ selectorJson: null }).success).toBe(true)
    })
})

describe('batchScanSchema', () => {
    it('repositoryIds 必填且 1-100 个', () => {
        expect(batchScanSchema.safeParse({}).success).toBe(false)
        expect(batchScanSchema.safeParse({ repositoryIds: [] }).success).toBe(false)
        expect(batchScanSchema.safeParse({ repositoryIds: ['r1'] }).success).toBe(true)
        const many = Array.from({ length: 101 }, (_, i) => `r${i}`)
        expect(batchScanSchema.safeParse({ repositoryIds: many }).success).toBe(false)
    })

    it('默认值与空串过滤', () => {
        const ok = batchScanSchema.safeParse({ repositoryIds: [' r1 '] })
        expect(ok.success).toBe(true)
        if (ok.success) {
            expect(ok.data.repositoryIds).toEqual(['r1'])
            expect(ok.data.mode).toBe('report-only')
            expect(ok.data.severityThreshold).toBe('high')
        }
        expect(batchScanSchema.safeParse({ repositoryIds: [''] }).success).toBe(false)
    })
})

describe('数据层实体字段（内存 SQLite）', () => {
    let ds: DataSource

    beforeAll(async () => {
        ds = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            driver: BetterSqlite3,
            entities: [Schedule, BatchRun, Repository, ScanRun, Organization, Credential],
            synchronize: true,
            namingStrategy: new SnakeCaseNamingStrategy(),
        })
        await ds.initialize()
    })

    afterAll(async () => {
        await ds.destroy()
    })

    it('Schedule：默认值与字段 roundtrip', async () => {
        const repo = ds.getRepository(Schedule)
        const saved = await repo.save(repo.create({
            name: '测试计划',
            cron: '0 2 * * 1',
            selectorKind: 'tag',
            selectorJson: JSON.stringify({ tag: 'frontend' }),
        }))
        const found = await repo.findOneOrFail({ where: { id: saved.id } })
        expect(found.mode).toBe('report-only')
        expect(found.severityThreshold).toBe('high')
        expect(found.enabled).toBe(true)
        expect(found.selectorKind).toBe('tag')
        expect(found.selectorJson).toBe(JSON.stringify({ tag: 'frontend' }))
        expect(found.timezone).toBeNull()
        expect(found.organizationId).toBeNull()
        expect(found.lastTriggeredAt).toBeNull()
        expect(found.lastBatchRunId).toBeNull()
    })

    it('BatchRun：默认值与字段 roundtrip', async () => {
        const repo = ds.getRepository(BatchRun)
        const saved = await repo.save(repo.create({
            source: 'scheduled',
            scheduleId: 'schedule-1',
            mode: 'fix',
            severityThreshold: 'critical',
            repositoryCount: 3,
        }))
        const found = await repo.findOneOrFail({ where: { id: saved.id } })
        expect(found.status).toBe('running')
        expect(found.finishedCount).toBe(0)
        expect(found.completedCount).toBe(0)
        expect(found.failedCount).toBe(0)
        expect(found.pendingCount).toBe(0)
        expect(found.summaryJson).toBeNull()
        expect(found.finishedAt).toBeNull()
        expect(found.source).toBe('scheduled')
        expect(found.scheduleId).toBe('schedule-1')
        expect(found.organizationId).toBeNull()
    })

    it('Repository.tags：null 默认 + JSON 数组 roundtrip', async () => {
        const repo = ds.getRepository(Repository)
        const saved = await repo.save(repo.create({
            owner: 'owner-a',
            name: 'repo-a',
            platform: 'github',
        }))
        const found = await repo.findOneOrFail({ where: { id: saved.id } })
        expect(found.tags).toBeNull()

        found.tags = JSON.stringify(['frontend', 'critical'])
        await repo.save(found)
        const updated = await repo.findOneOrFail({ where: { id: saved.id } })
        expect(updated.tags).toBe(JSON.stringify(['frontend', 'critical']))
    })

    it('ScanRun.batchRunId：null 默认 + roundtrip', async () => {
        const repoRepo = ds.getRepository(Repository)
        const repoRow = await repoRepo.save(repoRepo.create({
            owner: 'owner-x',
            name: 'repo-x',
            platform: 'github',
        }))
        const runRepo = ds.getRepository(ScanRun)
        const saved = await runRepo.save(runRepo.create({
            repositoryId: repoRow.id,
            mode: 'report-only',
            severityThreshold: 'high',
            status: 'pending',
        }))
        const found = await runRepo.findOneOrFail({ where: { id: saved.id } })
        expect(found.batchRunId).toBeNull()

        found.batchRunId = 'batch-1'
        await runRepo.save(found)
        const updated = await runRepo.findOneOrFail({ where: { id: saved.id } })
        expect(updated.batchRunId).toBe('batch-1')
    })

    it('新表存在（schedule / batch_run）', async () => {
        const tables = await ds.query('SELECT name FROM sqlite_master WHERE type = \'table\'')
        const names = (tables as { name: string }[]).map((t) => t.name)
        expect(names).toContain('schedule')
        expect(names).toContain('batch_run')
    })
})

describe('parseTags', () => {
    it('JSON 数组解析', () => {
        expect(parseTags('["frontend","critical"]')).toEqual(['frontend', 'critical'])
        expect(parseTags('[]')).toEqual([])
    })

    it('非法/缺失容错', () => {
        expect(parseTags(null)).toEqual([])
        expect(parseTags(undefined)).toEqual([])
        expect(parseTags('not-json')).toEqual([])
        expect(parseTags('"str"')).toEqual([])
    })
})
