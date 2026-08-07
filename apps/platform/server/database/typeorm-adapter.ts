import {
    In,
    Like,
    LessThan,
    LessThanOrEqual,
    MoreThan,
    MoreThanOrEqual,
    Not,
    type DataSource,
    type EntityManager,
    type FindOptionsOrder,
    type FindOptionsWhere,
    type ObjectLiteral,
} from 'typeorm'
import {
    createAdapterFactory,
    type CustomAdapter,
    type DBTransactionAdapter,
    type Where,
} from 'better-auth/adapters'
import { snowflake } from '../utils/snowflake'

/**
 * better-auth TypeORM 适配器（基于官方 createAdapterFactory 精简实现）。
 *
 * 设计说明：
 * - better-auth schema 字段名与实体属性名一致（camelCase，如 `emailVerified`），
 *   数据库列名由 SnakeCaseNamingStrategy 统一转换（`email_verified`）。
 * - join 由 factory 内部 fallback 查询完成（默认 passJoinToAdapter=false），
 *   adapter 无需处理 relations；这里保持返回基础数据即可。
 * - 事务回调提供 consumeOne / incrementOne（一次性消费 / 原子计数），
 *   避免 better-auth 内部事务路径缺失方法。
 */

type TypeormWhere = Required<Where>[]

const findWhere = (where?: TypeormWhere): FindOptionsWhere<ObjectLiteral> => {
    const result: FindOptionsWhere<ObjectLiteral> = {}
    if (!where) {
        return result
    }
    for (const w of where) {
        const field = w.field
        const value = w.value
        switch (w.operator) {
            case 'ne':
                result[field] = Not(value)
                break
            case 'lt':
                result[field] = LessThan(value)
                break
            case 'lte':
                result[field] = LessThanOrEqual(value)
                break
            case 'gt':
                result[field] = MoreThan(value)
                break
            case 'gte':
                result[field] = MoreThanOrEqual(value)
                break
            case 'in':
                result[field] = In(value as unknown[])
                break
            case 'not_in':
                result[field] = Not(In(value as unknown[]))
                break
            case 'contains':
                result[field] = Like(`%${value}%`)
                break
            case 'starts_with':
                result[field] = Like(`${value}%`)
                break
            case 'ends_with':
                result[field] = Like(`%${value}`)
                break
            default:
                result[field] = value
                break
        }
    }
    return result
}

interface TypeormCreateArgs<T extends Record<string, unknown>> {
    model: string
    data: T
}

interface TypeormUpdateArgs<T> {
    model: string
    where: TypeormWhere
    update: T
}

interface TypeormDeleteArgs {
    model: string
    where: TypeormWhere
}

interface TypeormFindOneArgs {
    model: string
    where: TypeormWhere
}

interface TypeormFindManyArgs {
    model: string
    where?: TypeormWhere
    limit?: number
    offset?: number
    sortBy?: { field: string, direction: 'asc' | 'desc' }
}

interface TypeormCountArgs {
    model: string
    where?: TypeormWhere
}

interface TypeormIncrementArgs {
    model: string
    where: TypeormWhere
    increment: Record<string, number>
    set?: Record<string, unknown>
}

/** 基于指定 EntityManager（事务内则为事务连接）创建 adapter 方法集合。 */
const createTypeormAdapter = (dataSource: DataSource, manager: EntityManager): CustomAdapter & { id: string } => {
    /**
     * better-auth 模型名（user/session/account/verification）→ TypeORM 实体类名。
     * 按表名大小写不敏感匹配（实体注册名是类名 `User`，better-auth 传 `user`；
     * 表名可能带 entityPrefix，如 `dependfix_user`，需剥离后比较）。
     */
    const resolveEntityName = (model: string): string => {
        const prefix = dataSource.options.entityPrefix ?? ''
        // 前缀按字面量剥离（entityPrefix 可能含正则元字符，如 `.`）
        const meta = dataSource.entityMetadatas.find((m) => {
            const rawName = m.tableName
            const bareName = prefix ? rawName.slice(prefix.length) : rawName
            return bareName.toLowerCase() === model.toLowerCase()
        })
        if (meta) {
            return meta.name
        }
        // 未匹配时原样传递（允许直接传实体类名）
        return model
    }
    const getRepository = (model: string) => manager.getRepository(resolveEntityName(model))

    return {
        id: 'typeorm',
        async create<T extends Record<string, unknown>>({ model, data }: TypeormCreateArgs<T>): Promise<T> {
            // better-auth 传入 plain object，TypeORM @BeforeInsert 不触发；
            // 若 data 无 id（factory 未注入）则用雪花 ID 兜底
            const payload = { ...data } as Record<string, unknown>
            if (!payload.id) {
                payload.id = snowflake.generateId()
            }
            const result = await getRepository(model).save(payload as ObjectLiteral)
            return result as T
        },
        async update<T>({ model, where, update }: TypeormUpdateArgs<T>): Promise<T | null> {
            const findOptions = findWhere(where)
            const target = await getRepository(model).findOne({ where: findOptions })
            if (!target) {
                return null
            }
            await getRepository(model).update(findOptions, update as ObjectLiteral)
            const updated = await getRepository(model).findOne({ where: findOptions })
            return updated as T | null
        },
        async updateMany<T>({ model, where, update }: TypeormUpdateArgs<T>): Promise<number> {
            const result = await getRepository(model).update(findWhere(where), update as ObjectLiteral)
            return result.affected ?? 0
        },
        async findOne<T>({ model, where }: TypeormFindOneArgs): Promise<T | null> {
            const result = await getRepository(model).findOne({ where: findWhere(where) })
            return result as T | null
        },
        async findMany<T>({ model, where, limit, offset, sortBy }: TypeormFindManyArgs): Promise<T[]> {
            const order: FindOptionsOrder<ObjectLiteral> | undefined = sortBy
                ? { [sortBy.field]: sortBy.direction }
                : undefined
            const result = await getRepository(model).find({
                where: findWhere(where),
                take: limit,
                skip: offset,
                order,
            })
            return result as T[]
        },
        async delete({ model, where }: TypeormDeleteArgs): Promise<void> {
            await getRepository(model).delete(findWhere(where))
        },
        async deleteMany({ model, where }: TypeormDeleteArgs): Promise<number> {
            const result = await getRepository(model).delete(findWhere(where))
            return result.affected ?? 0
        },
        async count({ model, where }: TypeormCountArgs): Promise<number> {
            return getRepository(model).count({ where: findWhere(where) })
        },
        // 一次性消费：单行 find → delete（事务内原子），返回被消费行
        async consumeOne<T>({ model, where }: TypeormFindOneArgs): Promise<T | null> {
            const findOptions = findWhere(where)
            const target = await getRepository(model).findOne({ where: findOptions })
            if (!target) {
                return null
            }
            const targetId = (target as ObjectLiteral).id as string
            await getRepository(model).delete({ ...findOptions, id: targetId })
            return target as T
        },
        // 原子计数：单行增量更新（事务内 find + update）
        async incrementOne<T>({ model, where, increment, set }: TypeormIncrementArgs): Promise<T | null> {
            const findOptions = findWhere(where)
            const target = await getRepository(model).findOne({ where: findOptions })
            if (!target) {
                return null
            }
            const record = target as ObjectLiteral
            const merged: ObjectLiteral = { ...(set ?? {}) }
            for (const [field, delta] of Object.entries(increment)) {
                const current = typeof record[field] === 'number' ? record[field] : 0
                merged[field] = current + (delta as number)
            }
            await getRepository(model).update(findOptions, merged)
            const updated = await getRepository(model).findOne({ where: findOptions })
            return updated as T | null
        },
    }
}

export const typeormAdapter = (dataSource: DataSource): ReturnType<typeof createAdapterFactory> => createAdapterFactory({
    config: {
        adapterId: 'typeorm',
        supportsNumericIds: false,
        supportsDates: true,
        supportsBooleans: true,
        transaction: <R>(callback: (trx: DBTransactionAdapter) => Promise<R>) =>
            dataSource.transaction(async (manager) => {
                const trx = createTypeormAdapter(dataSource, manager) as DBTransactionAdapter
                return callback(trx)
            }),
    },
    adapter: () => createTypeormAdapter(dataSource, dataSource.manager),
})
