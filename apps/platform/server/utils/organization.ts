import {
    IsNull,
    type DataSource,
} from 'typeorm'
import { Credential } from '#server/entities/credential'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'
import { User } from '#server/entities/user'

/**
 * 组织归属工具（单组织模型）。
 *
 * 生命周期（设计文档 §8.1）：
 * 1. synchronize 阶段 organizationId 为可空列（SQLite 存量表不能加无默认值 NOT NULL 列）
 * 2. 初始化时 ensureDefaultOrganization() 幂等创建默认组织 + 存量 Repository/Credential 填充
 * 3. 创建路径经 resolveOrganizationId() 填充 organizationId，应用层强制非空
 * 4. 更新/删除路径经 requireOrgResource 校验归属
 *
 * 默认组织固定 id（非雪花 ID）：稳定标识便于幂等判定与跨环境一致。
 */

export const DEFAULT_ORGANIZATION_ID = 'dependfix-default'
export const DEFAULT_ORGANIZATION_NAME = 'Default'

/**
 * 幂等创建默认组织，并将存量 Repository/Credential 挂入默认组织。
 * 可在任意业务入口安全重复调用（仅执行缺失部分）；
 * 并发安全：两请求同时发现组织缺失时，主键冲突方捕获后重查返回既有组织。
 */
export const ensureDefaultOrganization = async (ds: DataSource): Promise<Organization> => {
    const orgRepo = ds.getRepository(Organization)
    let org = await orgRepo.findOne({ where: { id: DEFAULT_ORGANIZATION_ID } })
    if (!org) {
        try {
            org = await orgRepo.save(orgRepo.create({
                id: DEFAULT_ORGANIZATION_ID,
                name: DEFAULT_ORGANIZATION_NAME,
            }))
        } catch (error) {
            // 并发创建冲突：另一请求已写入同 id 组织，重查后复用（幂等语义）
            org = await orgRepo.findOne({ where: { id: DEFAULT_ORGANIZATION_ID } })
            if (!org) {
                throw error
            }
        }
    }
    // 存量数据填充（幂等：仅更新 organization_id 为空的行）
    await ds.getRepository(Repository).update(
        { organizationId: IsNull() },
        { organizationId: org.id },
    )
    await ds.getRepository(Credential).update(
        { organizationId: IsNull() },
        { organizationId: org.id },
    )
    return org
}

/**
 * 解析当前组织的唯一来源（创建路径填充用）。
 * 单组织模型下恒为默认组织；多租户（多组织）成为真实需求时，此处为扩展点。
 */
export const resolveOrganizationId = async (ds: DataSource): Promise<string> => {
    const org = await ensureDefaultOrganization(ds)
    return org.id
}

/**
 * 存量角色迁移：role='user' → 'viewer'（幂等）。
 * 早期单用户阶段注册用户默认 'user'；当前角色模型为 admin / org_admin / viewer，
 * 存量 'user' 语义最接近 viewer（只读），且写权限收紧后必须显式迁移（见设计文档 §8.2）。
 */
export const migrateLegacyRoles = async (ds: DataSource): Promise<number> => {
    const result = await ds.getRepository(User).update(
        { role: 'user' },
        { role: 'viewer' },
    )
    return result.affected ?? 0
}
