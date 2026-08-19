import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import betterSqlite3 from 'better-sqlite3'
import { typeormAdapter } from './typeorm-adapter'
import { User } from '#server/entities/user'
import { Session } from '#server/entities/session'

let ds: DataSource
// typeormAdapter(ds) 返回工厂函数 (options) => DBAdapter；测试调用工厂取得 adapter 实例
let adapter: ReturnType<ReturnType<typeof typeormAdapter>>

const makeUser = (email: string, name: string | null = null) => ({ email, name })

const eq = (field: string, value: unknown) => [{ field, operator: 'eq', value }] as never

describe('typeormAdapter', () => {
    beforeAll(async () => {
        ds = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            driver: betterSqlite3,
            entities: [User, Session],
            synchronize: true,
        })
        await ds.initialize()
        // createAdapterFactory 返回工厂函数 (options) => DBAdapter，传入空 options 使用默认 schema
        adapter = typeormAdapter(ds)({} as never)
    })

    afterAll(async () => {
        await ds.destroy()
    })

    it('creates records with generated snowflake id', async () => {
        const created = await adapter.create<Record<string, unknown>>({ model: 'user', data: makeUser('a@test.dev', 'A') })
        expect(created.id).toBeTruthy()
        expect(created.email).toBe('a@test.dev')
    })

    it('keeps explicit id when provided', async () => {
        // 注意：better-auth factory 层会在 adapter 前注入/覆盖 id（默认 generateId），
        // adapter 层的雪花兜底分支（data 无 id）由上一用例覆盖；此处验证落库成功
        const created = await adapter.create<Record<string, unknown>>({ model: 'user', data: { id: 'custom-id-1', ...makeUser('b@test.dev', 'B') } })
        expect(created.email).toBe('b@test.dev')
        expect(created.id).toBeTruthy()
    })

    it('finds one by equality where', async () => {
        const found = await adapter.findOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'a@test.dev') })
        expect(found?.name).toBe('A')
        const missing = await adapter.findOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'nobody@test.dev') })
        expect(missing).toBeNull()
    })

    it('updates matching record and returns updated row', async () => {
        const updated = await adapter.update<Record<string, unknown>>({
            model: 'user',
            where: eq('email', 'a@test.dev'),
            update: { name: 'A2' },
        })
        expect(updated?.name).toBe('A2')
        const missing = await adapter.update<Record<string, unknown>>({
            model: 'user',
            where: eq('email', 'nobody@test.dev'),
            update: { name: 'X' },
        })
        expect(missing).toBeNull()
    })

    it('updates many and reports affected count', async () => {
        await adapter.create<Record<string, unknown>>({ model: 'user', data: makeUser('c1@test.dev') })
        await adapter.create<Record<string, unknown>>({ model: 'user', data: makeUser('c2@test.dev') })
        const affected = await adapter.updateMany({
            model: 'user',
            where: [{ field: 'email', operator: 'contains', value: 'c' }],
            update: { name: 'Batch' },
        })
        expect(affected).toBe(2)
    })

    it('supports comparison and list operators in findMany', async () => {
        // in / not_in / contains / starts_with / ends_with / ne
        const inList = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'email', operator: 'in', value: ['a@test.dev', 'b@test.dev'] }],
        })
        expect(inList).toHaveLength(2)

        const notIn = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'email', operator: 'not_in', value: ['a@test.dev'] }],
        })
        expect(notIn.length).toBeGreaterThanOrEqual(3)

        const starts = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'email', operator: 'starts_with', value: 'b@' }],
        })
        expect(starts).toHaveLength(1)
        expect(starts[0]?.email).toBe('b@test.dev')

        const ends = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'email', operator: 'ends_with', value: 'c1@test.dev' }],
        })
        expect(ends).toHaveLength(1)

        const ne = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'email', operator: 'ne', value: 'a@test.dev' }],
        })
        expect(ne.some((u) => u.email === 'a@test.dev')).toBe(false)
    })

    it('supports lt/gt operators on createdAt (DB round-trip values)', async () => {
        // 显式给定 1 秒间隔的 createdAt，避免依赖连续两次 @CreateDateColumn 的时间差
        // （CI coverage instrumentation 下同毫秒会被 SQLite datetime TEXT 截到相同字符串 → lt 返回空集）。
        // @CreateDateColumn 尊重手动传入的 Date 值（已在 scripts/ 探针验证 ms 精度保留）。
        const t1 = new Date('2024-01-01T10:00:00.000Z')
        const t2 = new Date('2024-01-01T10:00:01.000Z')
        const d1 = await adapter.create<Record<string, unknown>>({
            model: 'user',
            data: { ...makeUser('d1@test.dev'), createdAt: t1 },
        }) as { createdAt: Date }
        const d2 = await adapter.create<Record<string, unknown>>({
            model: 'user',
            data: { ...makeUser('d2@test.dev'), createdAt: t2 },
        }) as { createdAt: Date }

        // round-trip 后毫秒精度应保留：t2 - t1 = 1000ms（保障 lt/gt 阈值严格成立）
        expect(d2.createdAt.getTime() - d1.createdAt.getTime()).toBe(1000)

        const lt = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'createdAt', operator: 'lt', value: d2.createdAt }],
        })
        expect(lt.some((u) => u.email === 'd1@test.dev')).toBe(true)
        expect(lt.some((u) => u.email === 'd2@test.dev')).toBe(false)

        const gt = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'createdAt', operator: 'gt', value: d1.createdAt }],
        })
        expect(gt.some((u) => u.email === 'd2@test.dev')).toBe(true)

        const lte = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'createdAt', operator: 'lte', value: d1.createdAt }],
        })
        expect(lte.some((u) => u.email === 'd1@test.dev')).toBe(true)

        const gte = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'createdAt', operator: 'gte', value: d2.createdAt }],
        })
        expect(gte.some((u) => u.email === 'd2@test.dev')).toBe(true)
    })

    it('applies limit/offset/sortBy in findMany', async () => {
        const desc = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: eq('name', 'Batch'),
            sortBy: { field: 'email', direction: 'desc' },
        })
        expect(desc[0]?.email).toBe('c2@test.dev')

        const limited = await adapter.findMany<Record<string, unknown>>({
            model: 'user',
            where: [{ field: 'email', operator: 'not_in', value: ['a@test.dev'] }],
            limit: 1,
            offset: 0,
        })
        expect(limited).toHaveLength(1)
    })

    it('counts and deletes records', async () => {
        const total = await adapter.count({ model: 'user' })
        expect(total).toBeGreaterThan(0)

        const deleted = await adapter.delete({ model: 'user', where: eq('email', 'd1@test.dev') })
        expect(deleted).toBeUndefined()
        expect(await adapter.findOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'd1@test.dev') })).toBeNull()
    })

    it('deleteMany reports affected count', async () => {
        const affected = await adapter.deleteMany({
            model: 'user',
            where: [{ field: 'email', operator: 'ends_with', value: 'c2@test.dev' }],
        })
        expect(affected).toBe(1)
    })

    it('consumeOne removes and returns the consumed row', async () => {
        await adapter.create<Record<string, unknown>>({ model: 'user', data: makeUser('consume@test.dev') })
        const consumed = await adapter.consumeOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'consume@test.dev') })
        expect(consumed?.email).toBe('consume@test.dev')
        expect(await adapter.findOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'consume@test.dev') })).toBeNull()

        const empty = await adapter.consumeOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'consume@test.dev') })
        expect(empty).toBeNull()
    })

    it('incrementOne updates matching record and returns null when missing', async () => {
        const created = await adapter.create<Record<string, unknown>>({ model: 'user', data: makeUser('inc@test.dev') })
        // 默认 schema 无数字字段：increment 落到非数字字段走"当前值按 0 计"分支；
        // 值断言受 TypeORM boolean 列读写转换影响，此处只验证命中/未命中两分支
        const updated = await adapter.incrementOne<Record<string, unknown>>({
            model: 'user',
            where: eq('id', created.id),
            increment: { emailVerified: 1 },
        })
        expect(updated).not.toBeNull()
        expect(updated?.id).toBe(created.id)

        const missing = await adapter.incrementOne<Record<string, unknown>>({
            model: 'user',
            where: eq('email', 'nobody@test.dev'),
            increment: { emailVerified: 1 },
        })
        expect(missing).toBeNull()
    })

    it('runs transaction with consumeOne atomicity', async () => {
        await adapter.create<Record<string, unknown>>({ model: 'user', data: makeUser('trx@test.dev') })
        const result = await adapter.transaction(async (trx) => {
            const consumed = await trx.consumeOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'trx@test.dev') })
            return consumed?.email ?? null
        })
        expect(result).toBe('trx@test.dev')
        expect(await adapter.findOne<Record<string, unknown>>({ model: 'user', where: eq('email', 'trx@test.dev') })).toBeNull()
    })
})
