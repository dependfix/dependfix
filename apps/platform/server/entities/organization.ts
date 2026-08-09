import {
    Column,
    Entity,
} from 'typeorm'
import { BaseEntity } from './base-entity'

/**
 * 组织实体（单组织最小形态：id / name / createdAt）。
 * 当前为单组织模型：默认组织 `dependfix-default`（启动幂等创建），
 * Repository / Credential 通过 organizationId 归属到组织；
 * 多租户（多组织 + 成员关系）登记 backlog，届时再扩展。
 */
@Entity('organization')
export class Organization extends BaseEntity {
    @Column({ type: 'varchar', length: 100 })
    name!: string
}
