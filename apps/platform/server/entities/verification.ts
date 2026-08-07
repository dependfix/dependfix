import {
    Column,
    Entity,
    Index,
} from 'typeorm'
import { getDateType } from '../database/type'
import { BaseEntity } from './base-entity'

/** better-auth 验证码 / 一次性 token 表 */
@Entity('verification')
export class Verification extends BaseEntity {
    @Index()
    @Column({ type: 'text' })
    identifier!: string

    @Column({ type: 'text' })
    value!: string

    @Column({ type: getDateType() })
    expiresAt!: Date
}
