import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest'
import { DataSource } from 'typeorm'
import BetterSqlite3 from 'better-sqlite3'
import { resolveRepositoryIds } from './selector'
import { Repository } from '#server/entities/repository'
import { Organization } from '#server/entities/organization'
import { Credential } from '#server/entities/credential'
import { SnakeCaseNamingStrategy } from '#server/database/naming-strategy'

describe('resolveRepositoryIds（仓库选择策略 + 权限隔离）', () => {
    let ds: DataSource
    const ORG_A = 'org-a'
    const ORG_B = 'org-b'
    let repoIds: { a1: string, a2: string, a3: string, b1: string }

    beforeAll(async () => {
        ds = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            driver: BetterSqlite3,
            entities: [Repository, Organization, Credential],
            synchronize: true,
            namingStrategy: new SnakeCaseNamingStrategy(),
        })
        await ds.initialize()

        // 先建组织行（Repository.organization 外键依赖）
        const orgRepo = ds.getRepository(Organization)
        await orgRepo.save(orgRepo.create({ id: ORG_A, name: 'Org A' }))
        await orgRepo.save(orgRepo.create({ id: ORG_B, name: 'Org B' }))

        const repo = ds.getRepository(Repository)
        const save = async (organizationId: string, owner: string, name: string, tags: string[] | null) => {
            const row = await repo.save(repo.create({
                organizationId,
                owner,
                name,
                platform: 'github',
                tags: tags && tags.length > 0 ? JSON.stringify(tags) : null,
            }))
            return row.id
        }
        repoIds = {
            a1: await save(ORG_A, 'org-a', 'frontend-app', ['frontend', 'critical']),
            a2: await save(ORG_A, 'org-a', 'backend-api', ['backend']),
            a3: await save(ORG_A, 'org-a', 'infra', null),
            b1: await save(ORG_B, 'org-b', 'frontend-lib', ['frontend']),
        }
    })

    afterAll(async () => {
        await ds.destroy()
    })

    it('all：当前组织全部仓库', async () => {
        const ids = await resolveRepositoryIds(ds, { kind: 'all', data: {}, organizationId: ORG_A })
        expect(ids).toEqual(expect.arrayContaining([repoIds.a1, repoIds.a2, repoIds.a3]))
        expect(ids).not.toContain(repoIds.b1)
        expect(ids).toHaveLength(3)
    })

    it('organization：指定组织全部仓库（限当前组织，跨组织不可选）', async () => {
        const ids = await resolveRepositoryIds(ds, {
            kind: 'organization',
            // selectorJson 声明组织 B，但当前组织为 A → 仍只返回 A 的仓库（权限隔离）
            data: { organizationId: ORG_B },
            organizationId: ORG_A,
        })
        expect(ids).toEqual(expect.arrayContaining([repoIds.a1, repoIds.a2, repoIds.a3]))
        expect(ids).not.toContain(repoIds.b1)
    })

    it('tag：tags JSON 包含指定标签', async () => {
        const frontend = await resolveRepositoryIds(ds, { kind: 'tag', data: { tag: 'frontend' }, organizationId: ORG_A })
        expect(frontend).toEqual([repoIds.a1])

        // 无标签仓库不命中
        const infra = await resolveRepositoryIds(ds, { kind: 'tag', data: { tag: 'infra' }, organizationId: ORG_A })
        expect(infra).toEqual([])

        // 缺 tag 参数返回空
        const empty = await resolveRepositoryIds(ds, { kind: 'tag', data: {}, organizationId: ORG_A })
        expect(empty).toEqual([])
    })

    it('explicit：repositoryIds 过滤为当前组织实际存在的仓库', async () => {
        const ids = await resolveRepositoryIds(ds, {
            kind: 'explicit',
            data: { repositoryIds: [repoIds.a1, repoIds.b1, 'nonexistent-id'] },
            organizationId: ORG_A,
        })
        // 跨组织（b1）与不存在的 id 被静默过滤
        expect(ids).toEqual([repoIds.a1])
    })

    it('explicit：空列表返回空', async () => {
        const ids = await resolveRepositoryIds(ds, { kind: 'explicit', data: { repositoryIds: [] }, organizationId: ORG_A })
        expect(ids).toEqual([])
    })
})
