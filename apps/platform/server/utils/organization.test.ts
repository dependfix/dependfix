import 'reflect-metadata'
import { afterEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import betterSqlite3 from 'better-sqlite3'
import {
    DEFAULT_ORGANIZATION_ID,
    ensureDefaultOrganization,
    migrateLegacyRoles,
    resolveOrganizationId,
} from './organization'
import { SnakeCaseNamingStrategy } from '#server/database/naming-strategy'
import { User } from '#server/entities/user'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'

/** 构造内存 SQLite DataSource（模拟生产实体注册；无 entityPrefix 简化断言） */
const createMemoryDataSource = async (): Promise<DataSource> => {
    const ds = new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        driver: betterSqlite3,
        entities: [User, Organization, Repository, Credential],
        namingStrategy: new SnakeCaseNamingStrategy(),
        synchronize: true,
    })
    await ds.initialize()
    return ds
}

describe('organization utils', () => {
    let ds: DataSource

    afterEach(async () => {
        await ds?.destroy()
    })

    describe('ensureDefaultOrganization', () => {
        it('首次调用创建默认组织（固定 id）', async () => {
            ds = await createMemoryDataSource()
            const org = await ensureDefaultOrganization(ds)

            expect(org.id).toBe(DEFAULT_ORGANIZATION_ID)
            expect(org.name).toBe('Default')
            const count = await ds.getRepository(Organization).count()
            expect(count).toBe(1)
        })

        it('重复调用幂等：不重复创建组织', async () => {
            ds = await createMemoryDataSource()
            await ensureDefaultOrganization(ds)
            await ensureDefaultOrganization(ds)
            await ensureDefaultOrganization(ds)

            const count = await ds.getRepository(Organization).count()
            expect(count).toBe(1)
        })

        it('并发创建不产生重复组织（主键冲突方重查复用）', async () => {
            ds = await createMemoryDataSource()
            const results = await Promise.all([
                ensureDefaultOrganization(ds),
                ensureDefaultOrganization(ds),
                ensureDefaultOrganization(ds),
            ])

            const count = await ds.getRepository(Organization).count()
            expect(count).toBe(1)
            expect(results.map((o) => o.id)).toEqual([DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_ID])
        })

        it('存量 Repository/Credential（organization_id 为空）自动挂入默认组织', async () => {
            ds = await createMemoryDataSource()
            const repoRepo = ds.getRepository(Repository)
            const credRepo = ds.getRepository(Credential)

            // 预置存量数据：无组织归属（模拟早期遗留）
            await repoRepo.save(repoRepo.create({
                owner: 'legacy-owner',
                name: 'legacy-repo',
                platform: 'github',
            }))
            await credRepo.save(credRepo.create({
                name: 'legacy-credential',
                type: 'classic-pat',
                encryptedToken: 'iv.tag.cipher',
            }))

            await ensureDefaultOrganization(ds)

            const repos = await repoRepo.find()
            expect(repos).toHaveLength(1)
            expect(repos[0]!.organizationId).toBe(DEFAULT_ORGANIZATION_ID)
            const creds = await credRepo.find()
            expect(creds).toHaveLength(1)
            expect(creds[0]!.organizationId).toBe(DEFAULT_ORGANIZATION_ID)
        })

        it('已归属组织的数据不被覆盖', async () => {
            ds = await createMemoryDataSource()
            const repoRepo = ds.getRepository(Repository)
            const orgRepo = ds.getRepository(Organization)

            // 预置一个"其他组织"及归属数据（多组织扩展前的防御）
            await orgRepo.save(orgRepo.create({ id: 'another-org', name: 'Other' }))
            await repoRepo.save(repoRepo.create({
                organizationId: 'another-org',
                owner: 'other-owner',
                name: 'other-repo',
                platform: 'github',
            }))

            await ensureDefaultOrganization(ds)

            const repos = await repoRepo.find()
            expect(repos[0]!.organizationId).toBe('another-org')
        })
    })

    describe('resolveOrganizationId', () => {
        it('返回默认组织 id（确保存在）', async () => {
            ds = await createMemoryDataSource()
            const id = await resolveOrganizationId(ds)
            expect(id).toBe(DEFAULT_ORGANIZATION_ID)
            const count = await ds.getRepository(Organization).count()
            expect(count).toBe(1)
        })
    })

    describe('migrateLegacyRoles', () => {
        const seedUsers = async (dataSource: DataSource) => {
            const userRepo = dataSource.getRepository(User)
            await userRepo.save(userRepo.create({ id: 'u-admin', email: 'admin@example.com', role: 'admin' }))
            await userRepo.save(userRepo.create({ id: 'u-legacy', email: 'legacy@example.com', role: 'user' }))
            await userRepo.save(userRepo.create({ id: 'u-viewer', email: 'viewer@example.com', role: 'viewer' }))
            await userRepo.save(userRepo.create({ id: 'u-org', email: 'org@example.com', role: 'org_admin' }))
        }

        it('存量 role=\'user\' 迁移为 \'viewer\'，其余角色不受影响', async () => {
            ds = await createMemoryDataSource()
            await seedUsers(ds)
            const userRepo = ds.getRepository(User)

            const affected = await migrateLegacyRoles(ds)
            expect(affected).toBe(1)

            const users = await userRepo.find()
            const byId = Object.fromEntries(users.map((u) => [u.id, u.role]))
            expect(byId['u-admin']).toBe('admin')
            expect(byId['u-legacy']).toBe('viewer')
            expect(byId['u-viewer']).toBe('viewer')
            expect(byId['u-org']).toBe('org_admin')
        })

        it('幂等：第二次执行为 0 行更新', async () => {
            ds = await createMemoryDataSource()
            await seedUsers(ds)
            await migrateLegacyRoles(ds)
            const again = await migrateLegacyRoles(ds)
            expect(again).toBe(0)
        })
    })
})
