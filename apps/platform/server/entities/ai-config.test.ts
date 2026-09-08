import 'reflect-metadata'
import { afterEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import betterSqlite3 from 'better-sqlite3'
import { SnakeCaseNamingStrategy } from '#server/database/naming-strategy'
import { User } from '#server/entities/user'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { ScanRun } from '#server/entities/scan-run'
import { encryptToken, decryptToken, getEncryptionKey } from '#server/services/credential.service'

/** 构造内存 SQLite DataSource（模拟生产实体注册；用 SnakeCaseNamingStrategy 落 snake_case 列） */
const createMemoryDataSource = async (): Promise<DataSource> => {
    const ds = new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        driver: betterSqlite3,
        entities: [User, Organization, Repository, Credential, ScanRun],
        namingStrategy: new SnakeCaseNamingStrategy(),
        synchronize: true,
    })
    await ds.initialize()
    return ds
}

describe('Organization AI config fields', () => {
    let ds: DataSource

    afterEach(async () => {
        await ds?.destroy()
    })

    it('Organization 默认值：aiProvider=openai-compatible + aiModel=deepseek-v4-flash + aiApiKeyEncrypted=null + aiBaseUrl=null + aiApiUrl=null', async () => {
        ds = await createMemoryDataSource()
        const repo = ds.getRepository(Organization)
        const org = repo.create({ name: 'Test Org' })
        const saved = await repo.save(org)

        expect(saved.aiProvider).toBe('openai-compatible')
        expect(saved.aiModel).toBe('deepseek-v4-flash')
        expect(saved.aiApiKeyEncrypted).toBeNull()
        expect(saved.aiBaseUrl).toBeNull()
        expect(saved.aiApiUrl).toBeNull()

        // 重新加载验证持久化（SnakeCaseNamingStrategy 列名 → ai_api_key_encrypted 等）
        const reloaded = await repo.findOne({ where: { id: saved.id } })
        expect(reloaded).not.toBeNull()
        expect(reloaded?.aiProvider).toBe('openai-compatible')
        expect(reloaded?.aiModel).toBe('deepseek-v4-flash')
    })

    it('Organization aiApiKeyEncrypted 加解密 round-trip（AES-256-GCM）', async () => {
        ds = await createMemoryDataSource()
        const repo = ds.getRepository(Organization)
        const encryptionKey = getEncryptionKey()

        // 加密并写入
        const plaintext = 'sk-test-deepseek-api-key-1234567890'
        const encrypted = encryptToken(plaintext, encryptionKey)
        expect(encrypted).not.toBe(plaintext)
        expect(encrypted.length).toBeGreaterThan(plaintext.length)

        const org = repo.create({
            name: 'Test Org',
            aiApiKeyEncrypted: encrypted,
        })
        await repo.save(org)

        // 重新加载并解密
        const reloaded = await repo.findOne({ where: { id: org.id } })
        expect(reloaded?.aiApiKeyEncrypted).toBe(encrypted)
        const decrypted = decryptToken(reloaded!.aiApiKeyEncrypted!, encryptionKey)
        expect(decrypted).toBe(plaintext)
    })

    it('Organization aiProvider 接受两种枚举值（openai-compatible / anthropic）', async () => {
        ds = await createMemoryDataSource()
        const repo = ds.getRepository(Organization)

        const openai = await repo.save(repo.create({ name: 'OpenAI Org', aiProvider: 'openai-compatible' }))
        const anthropic = await repo.save(repo.create({ name: 'Anthropic Org', aiProvider: 'anthropic' }))

        expect(openai.aiProvider).toBe('openai-compatible')
        expect(anthropic.aiProvider).toBe('anthropic')
    })
})

describe('Repository AI config fields', () => {
    let ds: DataSource

    afterEach(async () => {
        await ds?.destroy()
    })

    it('Repository 默认值：aiEnabled=false + aiTrigger=both', async () => {
        ds = await createMemoryDataSource()
        const repoRepo = ds.getRepository(Repository)
        const orgRepo = ds.getRepository(Organization)
        const org = await orgRepo.save(orgRepo.create({ name: 'Test Org' }))

        const repository = repoRepo.create({
            organizationId: org.id,
            owner: 'test-owner',
            name: 'test-repo',
        })
        const saved = await repoRepo.save(repository)

        expect(saved.aiEnabled).toBe(false)
        expect(saved.aiTrigger).toBe('both')

        const reloaded = await repoRepo.findOne({ where: { id: saved.id } })
        expect(reloaded?.aiEnabled).toBe(false)
        expect(reloaded?.aiTrigger).toBe('both')
    })

    it('Repository aiTrigger 接受三种枚举值（failure / major / both）', async () => {
        ds = await createMemoryDataSource()
        const repoRepo = ds.getRepository(Repository)
        const orgRepo = ds.getRepository(Organization)
        const org = await orgRepo.save(orgRepo.create({ name: 'Test Org' }))

        for (const trigger of ['failure', 'major', 'both'] as const) {
            const r = await repoRepo.save(repoRepo.create({
                organizationId: org.id,
                owner: `o-${trigger}`,
                name: `r-${trigger}`,
                aiEnabled: true,
                aiTrigger: trigger,
            }))
            expect(r.aiTrigger).toBe(trigger)
        }
    })
})

describe('ScanRun aiConfigSnapshot', () => {
    let ds: DataSource

    afterEach(async () => {
        await ds?.destroy()
    })

    it('ScanRun.aiConfigSnapshot 接受 JSON 字符串 + 默认值 null', async () => {
        ds = await createMemoryDataSource()
        const orgRepo = ds.getRepository(Organization)
        const repoRepo = ds.getRepository(Repository)
        const runRepo = ds.getRepository(ScanRun)

        const org = await orgRepo.save(orgRepo.create({ name: 'Test Org' }))
        const repository = await repoRepo.save(repoRepo.create({
            organizationId: org.id,
            owner: 'test-owner',
            name: 'test-repo',
        }))

        // 默认值 null
        const defaultRun = await runRepo.save(runRepo.create({
            repositoryId: repository.id,
            mode: 'report-only',
            severityThreshold: 'high',
            status: 'pending',
        }))
        expect(defaultRun.aiConfigSnapshot).toBeNull()

        // JSON 字符串持久化
        const snapshot = JSON.stringify({
            enabled: true,
            provider: 'openai-compatible',
            model: 'deepseek-v4-flash',
            trigger: 'both',
            hasApiKey: true,
        })
        const snapshotRun = await runRepo.save(runRepo.create({
            repositoryId: repository.id,
            mode: 'fix',
            severityThreshold: 'high',
            status: 'completed',
            aiConfigSnapshot: snapshot,
        }))
        const reloaded = await runRepo.findOne({ where: { id: snapshotRun.id } })
        expect(reloaded?.aiConfigSnapshot).toBe(snapshot)
        const parsed = JSON.parse(reloaded!.aiConfigSnapshot!)
        expect(parsed.enabled).toBe(true)
        expect(parsed.hasApiKey).toBe(true)
        // apiKey 不写入快照（即使调用方误传也建议不写入；此处只验证字段可存储）
        expect(parsed.apiKey).toBeUndefined()
    })
})
